"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";

export type NotificationHealth = {
  platforms: Record<"ios" | "android" | "web", { active: number; disabled: number }>;
  /** Active-token freshness — last_seen_at age buckets. The 90d+ bucket is the
   *  dormant, at-risk population (token may rotate before the app reopens). */
  freshness: { d7: number; d30: number; d90: number; older: number };
  /** disabled_reason → count, for currently soft-disabled tokens. */
  deadReasons: Record<string, number>;
  /** Distinct users with at least one active token vs. users whose only
   *  tokens are now disabled (silently unreachable by push). */
  coverage: { usersReachable: number; usersOnlyDead: number };
  totalRows: number;
  /** True if the row cap was hit and numbers are a floor, not exact. */
  truncated: boolean;
};

const ROW_CAP = 50_000;
const DAY = 24 * 60 * 60 * 1000;

/**
 * Admin-only snapshot of push-token health. Pulls a thin projection of
 * device_tokens and aggregates in JS — fine at current scale; if device_tokens
 * grows past the cap this should move to a SQL aggregate / RPC.
 */
export async function getNotificationHealthAction(): Promise<
  { ok: true; health: NotificationHealth } | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const admin = createServiceRoleClient();
  const { data: prof } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if ((prof?.role as string | null) !== "admin") return { ok: false, error: "Forbidden." };

  const { data: rows } = await admin
    .from("device_tokens")
    .select("user_id, platform, last_seen_at, disabled_at, disabled_reason")
    .limit(ROW_CAP);
  const all = rows ?? [];

  const platforms: NotificationHealth["platforms"] = {
    ios: { active: 0, disabled: 0 },
    android: { active: 0, disabled: 0 },
    web: { active: 0, disabled: 0 },
  };
  const freshness = { d7: 0, d30: 0, d90: 0, older: 0 };
  const deadReasons: Record<string, number> = {};
  const reachableUsers = new Set<string>();
  const usersWithAny = new Set<string>();
  const now = Date.now();

  for (const r of all) {
    const platform = (r.platform as string) in platforms ? (r.platform as "ios" | "android" | "web") : null;
    const userId = r.user_id as string | null;
    if (userId) usersWithAny.add(userId);
    const disabled = r.disabled_at != null;

    if (platform) platforms[platform][disabled ? "disabled" : "active"] += 1;

    if (disabled) {
      const reason = (r.disabled_reason as string | null) ?? "unknown";
      deadReasons[reason] = (deadReasons[reason] ?? 0) + 1;
    } else {
      if (userId) reachableUsers.add(userId);
      const seen = r.last_seen_at ? new Date(r.last_seen_at as string).getTime() : 0;
      const age = now - seen;
      if (age < 7 * DAY) freshness.d7 += 1;
      else if (age < 30 * DAY) freshness.d30 += 1;
      else if (age < 90 * DAY) freshness.d90 += 1;
      else freshness.older += 1;
    }
  }

  let usersOnlyDead = 0;
  for (const u of usersWithAny) if (!reachableUsers.has(u)) usersOnlyDead += 1;

  return {
    ok: true,
    health: {
      platforms,
      freshness,
      deadReasons,
      coverage: { usersReachable: reachableUsers.size, usersOnlyDead },
      totalRows: all.length,
      truncated: all.length >= ROW_CAP,
    },
  };
}
