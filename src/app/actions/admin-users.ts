"use server";

import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";

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

  const { data: profiles } = await admin.from("profiles").select("id, display_name, role, created_at");

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

  const users = (authData.users ?? []).map((u) => {
    const pr = profileMap.get(u.id);
    return {
      id: u.id,
      email: u.email ?? "",
      displayName: pr?.display_name ?? null,
      role: (pr?.role as "user" | "admin") ?? "user",
      createdAt: u.created_at,
      lastSignIn: u.last_sign_in_at ?? null,
    };
  });

  return { ok: true as const, users };
}

export async function createUserAsAdminAction(input: {
  email: string;
  password: string;
  role: "user" | "admin";
}) {
  const gate = await assertAdmin();
  if (!gate.ok) return gate;

  const admin = createServiceRoleClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: input.email.trim(),
    password: input.password,
    email_confirm: true,
  });
  if (error) return { ok: false as const, error: error.message };
  if (!data.user) return { ok: false as const, error: "No user returned." };

  const { error: upErr } = await admin
    .from("profiles")
    .update({ role: input.role })
    .eq("id", data.user.id);
  if (upErr) return { ok: false as const, error: upErr.message };

  revalidatePath("/admin/users");
  return { ok: true as const };
}

export async function updateUserRoleAction(userId: string, role: "user" | "admin") {
  const gate = await assertAdmin();
  if (!gate.ok) return gate;
  if (userId === gate.userId && role === "user") {
    return { ok: false as const, error: "You cannot remove your own admin role." };
  }

  const admin = createServiceRoleClient();
  const { error } = await admin.from("profiles").update({ role }).eq("id", userId);
  if (error) return { ok: false as const, error: error.message };

  revalidatePath("/admin/users");
  return { ok: true as const };
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
