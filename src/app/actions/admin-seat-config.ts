"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import {
  getSeatDefaults,
  setSeatDefaults,
  type SeatDefaults,
} from "@/lib/site/seat-defaults-config";

async function requireAdmin(): Promise<
  | { ok: true }
  | { ok: false; error: string }
> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") return { ok: false, error: "Forbidden." };
  return { ok: true };
}

export async function getSeatDefaultsAction(): Promise<
  { ok: true; defaults: SeatDefaults } | { ok: false; error: string }
> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;
  const defaults = await getSeatDefaults();
  return { ok: true, defaults };
}

export async function setSeatDefaultsAction(
  next: Partial<SeatDefaults>,
): Promise<{ ok: true; defaults: SeatDefaults } | { ok: false; error: string }> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;
  try {
    const defaults = await setSeatDefaults(next);
    revalidatePath("/", "layout");
    return { ok: true, defaults };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Save failed." };
  }
}

export type CoachBonusRow = {
  ownerId: string;
  email: string | null;
  displayName: string | null;
  tier: "coach" | "coach_ai";
  bonusSeats: number;
  bonusMessages: number;
};

/** List paying owners (Coach / Coach Pro) with their current bonus_seats.
 *  Drives the admin "extra seats" table — only paying owners can be
 *  granted comp seats (free owners get zero seats by definition). */
export async function listCoachBonusGrantsAction(): Promise<
  { ok: true; rows: CoachBonusRow[] } | { ok: false; error: string }
> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;
  const admin = createServiceRoleClient();
  const { data: ents, error: entErr } = await admin
    .from("user_entitlements")
    .select("user_id, tier")
    .in("tier", ["coach", "coach_ai"]);
  if (entErr) return { ok: false, error: entErr.message };
  const userIds = (ents ?? []).map((r) => r.user_id as string);
  if (userIds.length === 0) return { ok: true, rows: [] };

  const [grantsRes, profilesRes] = await Promise.all([
    admin
      .from("owner_seat_grants")
      .select("owner_id, bonus_seats, bonus_messages")
      .in("owner_id", userIds),
    admin.from("profiles").select("id, display_name").in("id", userIds),
  ]);
  const bonusByUser = new Map<string, number>();
  const bonusMsgByUser = new Map<string, number>();
  for (const r of grantsRes.data ?? []) {
    bonusByUser.set(r.owner_id as string, (r.bonus_seats as number | null) ?? 0);
    bonusMsgByUser.set(r.owner_id as string, (r.bonus_messages as number | null) ?? 0);
  }
  const nameByUser = new Map<string, string | null>();
  for (const r of profilesRes.data ?? []) {
    nameByUser.set(r.id as string, (r.display_name as string | null) ?? null);
  }
  const emailByUser = new Map<string, string | null>();
  await Promise.all(
    userIds.map(async (uid) => {
      const { data } = await admin.auth.admin.getUserById(uid);
      if (data?.user) emailByUser.set(uid, data.user.email ?? null);
    }),
  );

  const tierByUser = new Map<string, "coach" | "coach_ai">();
  for (const r of ents ?? []) {
    const t = r.tier as string;
    if (t === "coach" || t === "coach_ai") {
      tierByUser.set(r.user_id as string, t);
    }
  }

  const rows: CoachBonusRow[] = userIds
    .map((uid) => ({
      ownerId: uid,
      email: emailByUser.get(uid) ?? null,
      displayName: nameByUser.get(uid) ?? null,
      tier: tierByUser.get(uid) ?? "coach",
      bonusSeats: bonusByUser.get(uid) ?? 0,
      bonusMessages: bonusMsgByUser.get(uid) ?? 0,
    }))
    .sort((a, b) => {
      const aTotal = a.bonusSeats + a.bonusMessages;
      const bTotal = b.bonusSeats + b.bonusMessages;
      if (aTotal !== bTotal) return bTotal - aTotal;
      return (a.email ?? "").localeCompare(b.email ?? "");
    });
  return { ok: true, rows };
}

type GrantContext = {
  userId: string;
  email: string;
  tier: "coach" | "coach_ai";
};

async function resolveGrantTarget(
  email: string,
  scope: "seats" | "messages",
): Promise<{ ok: true; ctx: GrantContext } | { ok: false; error: string }> {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed) return { ok: false, error: "Email required." };

  const admin = createServiceRoleClient();
  // Look up the user by email via auth admin. There's no direct query
  // for auth.users.email, so list and filter — fine for the small admin
  // surface here.
  let userId: string | null = null;
  let pageMarker: number | null = 1;
  while (pageMarker !== null) {
    const { data, error } = await admin.auth.admin.listUsers({
      page: pageMarker,
      perPage: 1000,
    });
    if (error) return { ok: false, error: error.message };
    const hit = data.users.find((u) => (u.email ?? "").toLowerCase() === trimmed);
    if (hit) {
      userId = hit.id;
      break;
    }
    if (data.users.length < 1000) pageMarker = null;
    else pageMarker = pageMarker + 1;
  }
  if (!userId) return { ok: false, error: "No user with that email." };

  const { data: ent } = await admin
    .from("user_entitlements")
    .select("tier")
    .eq("user_id", userId)
    .maybeSingle();
  const tier = (ent?.tier as string | null) ?? "free";
  if (scope === "seats") {
    if (tier !== "coach" && tier !== "coach_ai") {
      return {
        ok: false,
        error: "User is on the free tier. Bonus seats only apply to Team Coach or Coach Pro.",
      };
    }
  } else {
    // Coach Cal is Coach Pro only. Granting messages to a Team Coach
    // user wouldn't do anything — they don't have Cal access.
    if (tier !== "coach_ai") {
      return {
        ok: false,
        error: "Bonus messages only apply to Coach Pro users (Coach Cal is Pro-only).",
      };
    }
  }

  return {
    ok: true,
    ctx: { userId, email: trimmed, tier: tier as "coach" | "coach_ai" },
  };
}

async function buildBonusRow(ctx: GrantContext): Promise<CoachBonusRow> {
  const admin = createServiceRoleClient();
  const [profRes, grantRes] = await Promise.all([
    admin.from("profiles").select("display_name").eq("id", ctx.userId).maybeSingle(),
    admin
      .from("owner_seat_grants")
      .select("bonus_seats, bonus_messages")
      .eq("owner_id", ctx.userId)
      .maybeSingle(),
  ]);
  return {
    ownerId: ctx.userId,
    email: ctx.email,
    displayName: (profRes.data?.display_name as string | null) ?? null,
    tier: ctx.tier,
    bonusSeats: (grantRes.data?.bonus_seats as number | null) ?? 0,
    bonusMessages: (grantRes.data?.bonus_messages as number | null) ?? 0,
  };
}

export async function setCoachBonusSeatsByEmailAction(
  email: string,
  bonusSeats: number,
): Promise<{ ok: true; row: CoachBonusRow } | { ok: false; error: string }> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;
  if (!Number.isFinite(bonusSeats) || bonusSeats < 0 || bonusSeats > 1000) {
    return { ok: false, error: "Bonus seats must be between 0 and 1000." };
  }
  const target = await resolveGrantTarget(email, "seats");
  if (!target.ok) return target;

  const admin = createServiceRoleClient();
  const rounded = Math.floor(bonusSeats);
  const { error: upsertErr } = await admin
    .from("owner_seat_grants")
    .upsert(
      { owner_id: target.ctx.userId, bonus_seats: rounded },
      { onConflict: "owner_id" },
    );
  if (upsertErr) return { ok: false, error: upsertErr.message };

  revalidatePath("/account");
  return { ok: true, row: await buildBonusRow(target.ctx) };
}

export async function setCoachBonusMessagesByEmailAction(
  email: string,
  bonusMessages: number,
): Promise<{ ok: true; row: CoachBonusRow } | { ok: false; error: string }> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;
  if (!Number.isFinite(bonusMessages) || bonusMessages < 0 || bonusMessages > 100000) {
    return { ok: false, error: "Bonus messages must be between 0 and 100000." };
  }
  const target = await resolveGrantTarget(email, "messages");
  if (!target.ok) return target;

  const admin = createServiceRoleClient();
  const rounded = Math.floor(bonusMessages);
  const { error: upsertErr } = await admin
    .from("owner_seat_grants")
    .upsert(
      { owner_id: target.ctx.userId, bonus_messages: rounded },
      { onConflict: "owner_id" },
    );
  if (upsertErr) return { ok: false, error: upsertErr.message };

  return { ok: true, row: await buildBonusRow(target.ctx) };
}
