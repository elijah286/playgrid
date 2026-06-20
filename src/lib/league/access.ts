import "server-only";

import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";

/**
 * League platform access layer (Wave 0).
 *
 * Two-layer gate (see docs/league-platform/PLAN.md §1.1, §3.5):
 *   1. Global kill switch — server-only env var `LEAGUE_OPS_ENABLED`. Default ON;
 *      set to "off" to make the entire league surface vanish with no deploy.
 *   2. Scoped membership — a row in `league_members`. Membership IS the allowlist:
 *      every existing user has zero rows, so `hasLeagueAccess()` is false for them
 *      and the surface is invisible. League roles live here, never in profiles.role,
 *      so site-admin (`is_site_admin()`) is unaffected.
 */

export const LEAGUE_MEMBER_ROLES = [
  "operator",
  "league_admin",
  "coach",
  "parent",
  "player",
  "volunteer",
] as const;

export type LeagueMemberRole = (typeof LEAGUE_MEMBER_ROLES)[number];

/** Roles that can administer a league (manage members, divisions, settings). */
export const LEAGUE_ADMIN_ROLES: readonly LeagueMemberRole[] = [
  "operator",
  "league_admin",
];

export type LeagueMembership = { leagueId: string; role: LeagueMemberRole };

/**
 * Global kill switch for the entire league surface. Mirrors the COACH_CAL_*
 * env-gate convention. Default ON; `LEAGUE_OPS_ENABLED=off` disables with no deploy.
 */
export function leagueOpsEnabled(): boolean {
  return process.env.LEAGUE_OPS_ENABLED !== "off";
}

export function isLeagueAdminRole(role: LeagueMemberRole): boolean {
  return LEAGUE_ADMIN_ROLES.includes(role);
}

/**
 * Every league membership for the current user. Returns [] when the kill switch
 * is off, Supabase isn't configured, or the user is signed out — i.e. the
 * surface is fully inert by default.
 */
export async function getCurrentLeagueMemberships(): Promise<LeagueMembership[]> {
  if (!leagueOpsEnabled() || !hasSupabaseEnv()) return [];

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("league_members")
    .select("league_id, role")
    .eq("user_id", user.id);

  return (data ?? []).map((row) => ({
    leagueId: row.league_id as string,
    role: row.role as LeagueMemberRole,
  }));
}

/**
 * The surface gate: does the current user get to see league features at all?
 * True iff the kill switch is on AND the user has at least one membership.
 * Every existing (non-league) user resolves to false → zero league UI and data.
 */
export async function hasLeagueAccess(): Promise<boolean> {
  const memberships = await getCurrentLeagueMemberships();
  return memberships.length > 0;
}

/** Does the current user administer the given league? */
export async function isLeagueAdmin(leagueId: string): Promise<boolean> {
  const memberships = await getCurrentLeagueMemberships();
  return memberships.some(
    (m) => m.leagueId === leagueId && isLeagueAdminRole(m.role),
  );
}
