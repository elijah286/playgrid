"use server";

import { revalidatePath } from "next/cache";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { getRequestUser } from "@/lib/supabase/request-user";

export type LeagueOrganizerRow = {
  userId: string;
  email: string | null;
  grantedAt: string;
  grantedByEmail: string | null;
};

// Local admin gate — mirrors the convention in coach-invitations.ts. Do NOT use
// requireAdmin() (it redirects); server actions return a result shape instead.
async function assertAdmin() {
  if (!hasSupabaseEnv()) {
    return { ok: false as const, error: "Supabase is not configured." };
  }
  const auth = await getRequestUser();
  if (auth.kind !== "ok" || !auth.user) return { ok: false as const, error: "Not signed in." };
  const user = auth.user;
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") return { ok: false as const, error: "Forbidden." };
  return { ok: true as const, userId: user.id };
}

export async function listLeagueOrganizersAction() {
  const gate = await assertAdmin();
  if (!gate.ok) return { ok: false as const, error: gate.error, items: [] as LeagueOrganizerRow[] };

  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from("league_organizers")
    .select("user_id, granted_by, granted_at")
    .order("granted_at", { ascending: false });
  if (error) return { ok: false as const, error: error.message, items: [] as LeagueOrganizerRow[] };

  // Resolve emails (they live in auth.users, not profiles).
  const { data: usersData } = await admin.auth.admin.listUsers({ perPage: 1000, page: 1 });
  const emailById = new Map<string, string>();
  for (const u of usersData?.users ?? []) {
    if (u.email) emailById.set(u.id, u.email);
  }

  const items: LeagueOrganizerRow[] = (data ?? []).map((row) => ({
    userId: row.user_id as string,
    email: emailById.get(row.user_id as string) ?? null,
    grantedAt: row.granted_at as string,
    grantedByEmail: row.granted_by ? emailById.get(row.granted_by as string) ?? null : null,
  }));

  return { ok: true as const, items };
}

export async function grantLeagueOrganizerAction(email: string) {
  const gate = await assertAdmin();
  if (!gate.ok) return gate;

  const target = email.trim().toLowerCase();
  if (!target) return { ok: false as const, error: "Enter an email address." };

  const admin = createServiceRoleClient();

  // Resolve email -> user_id via the auth admin API.
  const { data: usersData, error: listErr } = await admin.auth.admin.listUsers({
    perPage: 1000,
    page: 1,
  });
  if (listErr) return { ok: false as const, error: listErr.message };
  const match = (usersData?.users ?? []).find(
    (u) => u.email?.toLowerCase() === target,
  );
  if (!match) {
    return {
      ok: false as const,
      error: `No XO Gridmaker user with the email ${email}. They must sign up first.`,
    };
  }

  const { error } = await admin
    .from("league_organizers")
    .upsert(
      { user_id: match.id, granted_by: gate.userId },
      { onConflict: "user_id" },
    );
  if (error) return { ok: false as const, error: error.message };

  revalidatePath("/settings");
  return { ok: true as const };
}

export async function revokeLeagueOrganizerAction(userId: string) {
  const gate = await assertAdmin();
  if (!gate.ok) return gate;

  const admin = createServiceRoleClient();
  const { error } = await admin.from("league_organizers").delete().eq("user_id", userId);
  if (error) return { ok: false as const, error: error.message };

  revalidatePath("/settings");
  return { ok: true as const };
}
