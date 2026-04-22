"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import type { SubscriptionTier } from "@/lib/billing/entitlement";

export type AdminUserRowData = {
  id: string;
  email: string;
  displayName: string | null;
  role: "user" | "admin" | "coach";
  createdAt: string;
  lastSignIn: string | null;
  tier: SubscriptionTier;
  entitlementSource: "comp" | "stripe" | "free";
  entitlementExpiresAt: string | null;
  compGrantId: string | null;
  subscriptionId: string | null;
};

async function assertAdmin() {
  if (!hasSupabaseEnv()) {
    return { ok: false as const, error: "Supabase is not configured." };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") {
    return { ok: false as const, error: "Forbidden." };
  }
  return { ok: true as const, userId: user.id };
}

export async function listUsersForAdminAction() {
  const gate = await assertAdmin();
  if (!gate.ok) return { ok: false as const, error: gate.error, users: [] };

  const admin = createServiceRoleClient();
  const { data: authData, error: authErr } = await admin.auth.admin.listUsers({
    perPage: 200,
    page: 1,
  });
  if (authErr) return { ok: false as const, error: authErr.message, users: [] };

  const [{ data: profiles }, { data: entitlements }] = await Promise.all([
    admin.from("profiles").select("id, display_name, role, created_at"),
    admin
      .from("user_entitlements")
      .select("user_id, tier, source, expires_at, comp_grant_id, subscription_id"),
  ]);

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
  const entMap = new Map((entitlements ?? []).map((e) => [e.user_id, e]));

  const users: AdminUserRowData[] = (authData.users ?? []).map((u) => {
    const pr = profileMap.get(u.id);
    const e = entMap.get(u.id);
    return {
      id: u.id,
      email: u.email ?? "",
      displayName: pr?.display_name ?? null,
      role: (pr?.role as "user" | "admin" | "coach") ?? "user",
      createdAt: u.created_at,
      lastSignIn: u.last_sign_in_at ?? null,
      tier: (e?.tier as SubscriptionTier) ?? "free",
      entitlementSource: (e?.source as "comp" | "stripe" | "free") ?? "free",
      entitlementExpiresAt: (e?.expires_at as string | null) ?? null,
      compGrantId: (e?.comp_grant_id as string | null) ?? null,
      subscriptionId: (e?.subscription_id as string | null) ?? null,
    };
  });

  return { ok: true as const, users };
}

export async function createUserAsAdminAction(input: {
  email: string;
  password: string;
  role: "user" | "admin" | "coach";
  displayName?: string;
}) {
  const gate = await assertAdmin();
  if (!gate.ok) return gate;

  const email = input.email.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false as const, error: "Invalid email." };
  }
  if (input.password.length < 8) {
    return { ok: false as const, error: "Password must be at least 8 characters." };
  }

  const admin = createServiceRoleClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
  });
  if (error) return { ok: false as const, error: error.message };
  if (!data.user) return { ok: false as const, error: "No user returned." };

  const profilePatch: Record<string, string | null> = { role: input.role };
  const displayName = input.displayName?.trim();
  if (displayName) profilePatch.display_name = displayName;

  const { error: upErr } = await admin
    .from("profiles")
    .update(profilePatch)
    .eq("id", data.user.id);
  if (upErr) return { ok: false as const, error: upErr.message };

  revalidateTag(`user-role:${data.user.id}`, "max");
  revalidatePath("/settings");
  return { ok: true as const };
}

export async function updateUserRoleAction(userId: string, role: "user" | "admin" | "coach") {
  const gate = await assertAdmin();
  if (!gate.ok) return gate;
  if (userId === gate.userId && role !== "admin") {
    return { ok: false as const, error: "You cannot remove your own admin role." };
  }

  const admin = createServiceRoleClient();
  const { error } = await admin.from("profiles").update({ role }).eq("id", userId);
  if (error) return { ok: false as const, error: error.message };

  revalidateTag(`user-role:${userId}`, "max");
  revalidatePath("/admin/users");
  return { ok: true as const };
}

export async function updateUserAsAdminAction(input: {
  userId: string;
  email?: string;
  displayName?: string | null;
  role?: "user" | "admin" | "coach";
}) {
  const gate = await assertAdmin();
  if (!gate.ok) return gate;

  const admin = createServiceRoleClient();

  const email = input.email?.trim();
  if (email !== undefined && email.length > 0) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { ok: false as const, error: "Invalid email." };
    }
    const { error } = await admin.auth.admin.updateUserById(input.userId, { email });
    if (error) return { ok: false as const, error: error.message };
  }

  const profilePatch: Record<string, string | null> = {};
  if (input.displayName !== undefined) {
    const trimmed = (input.displayName ?? "").trim();
    profilePatch.display_name = trimmed.length > 0 ? trimmed : null;
  }
  if (input.role !== undefined) {
    if (input.userId === gate.userId && input.role !== "admin") {
      return { ok: false as const, error: "You cannot remove your own admin role." };
    }
    profilePatch.role = input.role;
  }
  if (Object.keys(profilePatch).length > 0) {
    const { error } = await admin.from("profiles").update(profilePatch).eq("id", input.userId);
    if (error) return { ok: false as const, error: error.message };
    if (profilePatch.role) {
      revalidateTag(`user-role:${input.userId}`, "max");
    }
  }

  revalidatePath("/settings");
  return { ok: true as const };
}

export async function setUserPasswordAsAdminAction(input: {
  userId: string;
  password: string;
}) {
  const gate = await assertAdmin();
  if (!gate.ok) return gate;
  if (input.password.length < 8) {
    return { ok: false as const, error: "Password must be at least 8 characters." };
  }
  const admin = createServiceRoleClient();
  const { error } = await admin.auth.admin.updateUserById(input.userId, {
    password: input.password,
  });
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

export type AdminUserStats = {
  playbooksOwned: number;
  playbooksShared: number;
  playsCreated: number;
  peopleSharedWith: number;
};

export async function getAdminUserStatsAction(
  userId: string,
): Promise<
  { ok: true; stats: AdminUserStats } | { ok: false; error: string }
> {
  const gate = await assertAdmin();
  if (!gate.ok) return gate;

  const admin = createServiceRoleClient();

  const { data: ownedRows, error: ownedErr } = await admin
    .from("playbook_members")
    .select("playbook_id")
    .eq("user_id", userId)
    .eq("role", "owner")
    .eq("status", "active");
  if (ownedErr) return { ok: false, error: ownedErr.message };
  const ownedIds = (ownedRows ?? []).map((r) => r.playbook_id as string);

  let playbooksShared = 0;
  const peopleSet = new Set<string>();
  if (ownedIds.length > 0) {
    const { data: otherMembers, error: othersErr } = await admin
      .from("playbook_members")
      .select("playbook_id, user_id")
      .in("playbook_id", ownedIds)
      .neq("user_id", userId)
      .eq("status", "active");
    if (othersErr) return { ok: false, error: othersErr.message };
    const sharedBookSet = new Set<string>();
    for (const m of otherMembers ?? []) {
      sharedBookSet.add(m.playbook_id as string);
      peopleSet.add(m.user_id as string);
    }
    playbooksShared = sharedBookSet.size;
  }

  const { data: versionRows, error: versionsErr } = await admin
    .from("play_versions")
    .select("play_id")
    .eq("created_by", userId);
  if (versionsErr) return { ok: false, error: versionsErr.message };
  const playsCreated = new Set(
    (versionRows ?? []).map((r) => r.play_id as string),
  ).size;

  return {
    ok: true,
    stats: {
      playbooksOwned: ownedIds.length,
      playbooksShared,
      playsCreated,
      peopleSharedWith: peopleSet.size,
    },
  };
}

export async function deleteUserAsAdminAction(userId: string) {
  const gate = await assertAdmin();
  if (!gate.ok) return gate;
  if (userId === gate.userId) {
    return { ok: false as const, error: "You cannot delete your own account." };
  }

  const admin = createServiceRoleClient();
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return { ok: false as const, error: error.message };

  revalidatePath("/admin/users");
  return { ok: true as const };
}
