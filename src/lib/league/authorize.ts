import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import {
  getCurrentLeagueMemberships,
  isLeagueAdmin,
  isLeagueAdminRole,
} from "@/lib/league/access";
import {
  decideLeagueView,
  grantsCover,
  isCapability,
  scopeFromColumns,
  scopeIncludesLeague,
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

/** The union of capabilities this email holds on `leagueId` through active grants
 *  (empty if none). Used to scope Leo's tools for a delegated member. */
export async function capabilitiesForLeague(
  email: string | null | undefined,
  leagueId: string,
): Promise<Capability[]> {
  const e = (email ?? "").trim().toLowerCase();
  if (!e) return [];
  const admin = createServiceRoleClient();

  const { data: league } = await admin
    .from("leagues")
    .select("created_by, sport")
    .eq("id", leagueId)
    .maybeSingle();
  if (!league?.created_by) return [];

  const { data: grantRows } = await admin
    .from("league_access_grants")
    .select("capabilities, scope_kind, scope_leagues, scope_sport, scope_group_id")
    .eq("owner_id", league.created_by as string)
    .eq("member_email", e)
    .eq("status", "active");
  if (!grantRows || grantRows.length === 0) return [];

  const { data: gm } = await admin
    .from("league_group_members")
    .select("group_id")
    .eq("league_id", leagueId);
  const leagueFacts = {
    id: leagueId,
    sport: league.sport as string,
    groupIds: (gm ?? []).map((x) => x.group_id as string),
  };

  const caps = new Set<Capability>();
  for (const g of grantRows) {
    const scope = scopeFromColumns(g as Parameters<typeof scopeFromColumns>[0]);
    if (scopeIncludesLeague(scope, leagueFacts)) {
      for (const c of (g.capabilities as string[]) ?? []) if (isCapability(c)) caps.add(c);
    }
  }
  return [...caps];
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

export type LeagueViewAccess = {
  userId: string;
  email: string | null;
  /** The client to read with: the cookie client for a member (RLS-natural) or
   *  the service-role client for a delegated member (the grant is the authority,
   *  exactly as the portfolio landing treats `accessibleLeagues()`). */
  db: LeagueDb;
  /** Admin-role member OR any delegated member (delegates are managers). Drives
   *  admin-only UI (e.g. showing Leo); it does NOT re-gate the page. */
  isAdmin: boolean;
  viaGrant: boolean;
  /** The delegate's capabilities on this league ([] for a member — they read via
   *  RLS, so no capability set is needed). */
  capabilities: Capability[];
};

/**
 * Authorize VIEWING a league console page, and hand back the right DB client.
 *
 * This is the read-side twin of `gateLeagueCapability`. The org-context landing
 * lists a delegate's leagues via `accessibleLeagues()` + service-role, but the
 * per-league pages historically gated on raw `league_members` — so a delegated
 * member saw the portfolio yet 404'd on every drill-down. This resolver closes
 * that gap: members keep their exact gate and RLS-bound client; a delegated
 * member is admitted by a covering grant and reads via the service role.
 *
 * Returns null when the user has no access at all, so the page can `notFound()`.
 * Pass `memberAdminOnly` to preserve an admin-only member gate, and
 * `delegateCapability` for the capability a delegate must hold (omit it on the
 * league home, where any covering grant suffices).
 */
export async function resolveLeagueView(
  leagueId: string,
  opts?: { memberAdminOnly?: boolean; delegateCapability?: Capability },
): Promise<LeagueViewAccess | null> {
  if (!hasSupabaseEnv()) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const memberships = await getCurrentLeagueMemberships();
  const membership = memberships.find((m) => m.leagueId === leagueId);
  const isMember = !!membership;
  const isAdminMember = !!membership && isLeagueAdminRole(membership.role);

  // Only pay for the grant lookup when the user isn't already a member.
  const delegateCapabilities = isMember
    ? []
    : await capabilitiesForLeague(user.email, leagueId);

  const decision = decideLeagueView({ isMember, isAdminMember, delegateCapabilities }, opts);
  if (!decision) return null;

  return {
    userId: user.id,
    email: user.email ?? null,
    db:
      decision.via === "delegate"
        ? (createServiceRoleClient() as unknown as LeagueDb)
        : supabase,
    isAdmin: decision.isAdmin,
    viaGrant: decision.via === "delegate",
    capabilities: delegateCapabilities,
  };
}
