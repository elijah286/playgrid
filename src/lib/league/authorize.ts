import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { isLeagueAdmin } from "@/lib/league/access";
import {
  grantsCover,
  scopeFromColumns,
  type Capability,
} from "@/lib/league/access-control";

type LeagueDb = Awaited<ReturnType<typeof createClient>>;

export type LeagueGate =
  | { ok: true; supabase: LeagueDb; userId: string; viaGrant: boolean }
  | { ok: false; error: string };

/**
 * Does this email hold `capability` for `leagueId` through an access grant?
 * A grant applies when its owner owns the league, the email matches, the grant
 * is active, it includes the capability, and its scope covers the league.
 */
export async function hasCapabilityViaGrant(
  email: string | null | undefined,
  capability: Capability,
  leagueId: string,
): Promise<boolean> {
  const e = (email ?? "").trim().toLowerCase();
  if (!e) return false;
  const admin = createServiceRoleClient();

  const { data: league } = await admin
    .from("leagues")
    .select("created_by, sport")
    .eq("id", leagueId)
    .maybeSingle();
  if (!league?.created_by) return false;

  const { data: grantRows } = await admin
    .from("league_access_grants")
    .select("capabilities, scope_kind, scope_leagues, scope_sport, scope_group_id")
    .eq("owner_id", league.created_by as string)
    .eq("member_email", e)
    .eq("status", "active");
  if (!grantRows || grantRows.length === 0) return false;

  const { data: gm } = await admin
    .from("league_group_members")
    .select("group_id")
    .eq("league_id", leagueId);
  const groupIds = (gm ?? []).map((x) => x.group_id as string);

  const grants = grantRows.map((g) => ({
    capabilities: (g.capabilities as string[]) ?? [],
    scope: scopeFromColumns(g as Parameters<typeof scopeFromColumns>[0]),
  }));
  return grantsCover(grants, capability, { id: leagueId, sport: league.sport as string, groupIds });
}

/** True if the current user may perform `capability` on `leagueId` — the owner/
 *  operator always can (backward-compatible); others only via a matching grant. */
export async function can(capability: Capability, leagueId: string): Promise<boolean> {
  if (await isLeagueAdmin(leagueId)) return true;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  return hasCapabilityViaGrant(user.email, capability, leagueId);
}

/**
 * Gate a league write on a capability. Returns the right DB client to act with:
 * the cookie client for owners (RLS-natural, unchanged behavior) or the
 * service-role client for grant-authorized members (the gate is the authority).
 * Drop-in for the old `gateAdmin` — actions keep using `gate.supabase`.
 */
export async function gateLeagueCapability(
  leagueId: string,
  capability: Capability,
): Promise<LeagueGate> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  if (await isLeagueAdmin(leagueId)) {
    return { ok: true, supabase, userId: user.id, viaGrant: false };
  }
  if (await hasCapabilityViaGrant(user.email, capability, leagueId)) {
    return {
      ok: true,
      supabase: createServiceRoleClient() as unknown as LeagueDb,
      userId: user.id,
      viaGrant: true,
    };
  }
  return { ok: false, error: "You don't have permission to do that." };
}
