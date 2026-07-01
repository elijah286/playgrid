import "server-only";

import { cookies } from "next/headers";

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { scopeFromColumns, scopeIncludesLeague } from "./access-control";
import { isUnrostered, type RegistrationStatus } from "./registration";

/**
 * Operator-console data access (Track B). Read paths run as the signed-in user,
 * so RLS scopes everything to leagues they belong to. Aggregation is split into
 * a pure `summarizeRegistrations` (unit-tested) + thin Supabase fetches.
 */

/** A league's sport (RLS-scoped to leagues the caller belongs to), or null. */
export async function getLeagueSport(
  leagueId: string,
  db?: Awaited<ReturnType<typeof createClient>>,
): Promise<string | null> {
  // Accept a caller-supplied client so a delegated member (who can't RLS-read the
  // league) can pass the service-role client from resolveLeagueView().
  const supabase = db ?? (await createClient());
  const { data } = await supabase
    .from("leagues")
    .select("sport")
    .eq("id", leagueId)
    .maybeSingle();
  return (data?.sport as string | null) ?? null;
}

export type LeagueListItem = {
  id: string;
  name: string;
  sport: string;
  location: string | null;
  roles: string[];
};

export type RegistrationSummary = {
  total: number;
  byStatus: Record<RegistrationStatus, number>;
  /** Approved or waitlisted — registrations that still need a roster home. */
  unrostered: number;
  /** Submitted — awaiting an operator decision. */
  needsReview: number;
};

const EMPTY_STATUS_COUNTS: Record<RegistrationStatus, number> = {
  submitted: 0,
  approved: 0,
  rostered: 0,
  waitlisted: 0,
  rejected: 0,
  withdrawn: 0,
};

export function summarizeRegistrations(
  rows: { status: RegistrationStatus }[],
): RegistrationSummary {
  const byStatus: Record<RegistrationStatus, number> = { ...EMPTY_STATUS_COUNTS };
  let unrostered = 0;
  for (const r of rows) {
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    if (isUnrostered(r.status)) unrostered += 1;
  }
  return {
    total: rows.length,
    byStatus,
    unrostered,
    needsReview: byStatus.submitted,
  };
}

/**
 * ORGANIZATION CONTEXT
 *
 * An "organization" is a portfolio root, identified by its owner (the user who
 * created the leagues — `leagues.created_by`). A user can act in:
 *   - their OWN org (the leagues they created), and/or
 *   - any DELEGATED org they hold an active access grant in (a different owner).
 *
 * Everything portfolio-level (the dashboard rollup, the rail's league list) is
 * scoped to exactly ONE active org at a time, so figures from two different
 * organizations never blend — most importantly revenue. The active org is
 * cookie-driven; the org switcher sets it. Default = own org, else the first
 * delegated org. This is the same multi-tenancy metaphor as Slack/Stripe/GitHub.
 */
export type LeagueOrg = { ownerId: string; label: string; isOwn: boolean };

/** Cookie holding the active org's owner id. Read here; written by the switcher
 *  action (`setActiveOrgAction`). */
export const ACTIVE_ORG_COOKIE = "league_active_org";

/** Pure: choose the active org from the cookie's wanted id, falling back to the
 *  user's own org, then the first available. Separated out so it's unit-tested. */
export function pickActiveOrg(orgs: LeagueOrg[], wanted: string | null): LeagueOrg | null {
  if (orgs.length === 0) return null;
  return (
    (wanted ? orgs.find((o) => o.ownerId === wanted) : undefined) ??
    orgs.find((o) => o.isOwn) ??
    orgs[0]
  );
}

/**
 * Every organization the user can act in: their own (only if they actually own
 * leagues) plus one entry per distinct grantor of an active access grant.
 */
export async function getAccessibleOrgs(
  userId: string,
  email: string | null,
): Promise<LeagueOrg[]> {
  const admin = createServiceRoleClient();
  const orgs: LeagueOrg[] = [];

  // Own org — present only if the user has created at least one league.
  const { data: own } = await admin
    .from("leagues")
    .select("id")
    .eq("created_by", userId)
    .limit(1);
  if ((own?.length ?? 0) > 0) {
    const { data: org } = await admin
      .from("organizations")
      .select("name")
      .eq("owner_id", userId)
      .maybeSingle();
    orgs.push({ ownerId: userId, label: (org?.name as string) || "My organization", isOwn: true });
  }

  // Delegated orgs — one per distinct grantor (owner) of an active grant.
  const e = email?.trim().toLowerCase();
  if (e) {
    const { data: grants } = await admin
      .from("league_access_grants")
      .select("owner_id")
      .eq("member_email", e)
      .eq("status", "active");
    const grantorIds = [
      ...new Set((grants ?? []).map((g) => g.owner_id as string)),
    ].filter((id) => id !== userId);
    if (grantorIds.length > 0) {
      const [{ data: gOrgs }, { data: profiles }] = await Promise.all([
        admin.from("organizations").select("owner_id, name").in("owner_id", grantorIds),
        admin.from("profiles").select("id, display_name").in("id", grantorIds),
      ]);
      const orgName = new Map((gOrgs ?? []).map((o) => [o.owner_id as string, o.name as string]));
      const profName = new Map(
        (profiles ?? []).map((p) => [p.id as string, p.display_name as string | null]),
      );
      for (const gid of grantorIds) {
        const nm = profName.get(gid);
        const on = orgName.get(gid);
        const label = nm
          ? `${nm}'s organization`
          : on && on !== "My organization"
            ? on
            : "Delegated organization";
        orgs.push({ ownerId: gid, label, isOwn: false });
      }
    }
  }

  return orgs;
}

/** Resolve the active org from the cookie (+ defaults), alongside the full list. */
export async function resolveActiveOrg(
  userId: string,
  email: string | null,
): Promise<{ activeOrgId: string | null; orgs: LeagueOrg[] }> {
  const orgs = await getAccessibleOrgs(userId, email);
  const cookieStore = await cookies();
  const wanted = cookieStore.get(ACTIVE_ORG_COOKIE)?.value ?? null;
  const active = pickActiveOrg(orgs, wanted);
  return { activeOrgId: active?.ownerId ?? null, orgs };
}

/**
 * League ids the user can access WITHIN one organization. For the user's own org
 * that's every league they created; for a delegated org it's the leagues that
 * owner's leagues which the user's grants from that owner scope to. Service-role
 * because a delegate isn't a league_member and can't RLS-read those leagues.
 */
export async function accessibleLeaguesInOrg(
  userId: string,
  email: string | null,
  orgOwnerId: string | null,
): Promise<{ leagueIds: string[]; rolesByLeague: Map<string, string[]> }> {
  const rolesByLeague = new Map<string, string[]>();
  if (!orgOwnerId) return { leagueIds: [], rolesByLeague };

  const admin = createServiceRoleClient();
  const { data: orgLeagues } = await admin
    .from("leagues")
    .select("id, sport")
    .eq("created_by", orgOwnerId);
  if (!orgLeagues || orgLeagues.length === 0) return { leagueIds: [], rolesByLeague };

  // Own org: full access to every league you created (roles from memberships).
  if (orgOwnerId === userId) {
    const ids = orgLeagues.map((l) => l.id as string);
    const { data: members } = await admin
      .from("league_members")
      .select("league_id, role")
      .eq("user_id", userId)
      .in("league_id", ids);
    for (const m of members ?? []) {
      const id = m.league_id as string;
      rolesByLeague.set(id, [...(rolesByLeague.get(id) ?? []), m.role as string]);
    }
    return { leagueIds: ids, rolesByLeague };
  }

  // Delegated org: only the leagues this user's grants from this owner cover.
  const e = email?.trim().toLowerCase();
  if (!e) return { leagueIds: [], rolesByLeague };
  const { data: grants } = await admin
    .from("league_access_grants")
    .select("scope_kind, scope_leagues, scope_sport, scope_group_id")
    .eq("member_email", e)
    .eq("owner_id", orgOwnerId)
    .eq("status", "active");
  if (!grants || grants.length === 0) return { leagueIds: [], rolesByLeague };

  const lgIds = orgLeagues.map((l) => l.id as string);
  const groupsByLeague = new Map<string, string[]>();
  const { data: gms } = await admin
    .from("league_group_members")
    .select("league_id, group_id")
    .in("league_id", lgIds);
  for (const gm of gms ?? []) {
    const a = groupsByLeague.get(gm.league_id as string) ?? [];
    a.push(gm.group_id as string);
    groupsByLeague.set(gm.league_id as string, a);
  }

  const ids: string[] = [];
  for (const l of orgLeagues) {
    const lg = {
      id: l.id as string,
      sport: l.sport as string,
      groupIds: groupsByLeague.get(l.id as string) ?? [],
    };
    if (
      grants.some((g) =>
        scopeIncludesLeague(scopeFromColumns(g as Parameters<typeof scopeFromColumns>[0]), lg),
      )
    ) {
      ids.push(l.id as string);
    }
  }
  return { leagueIds: ids, rolesByLeague };
}

/**
 * League ids the user can access in the ACTIVE org (cookie-resolved). This is the
 * portfolio-scoped set every rollup uses, so two orgs' figures never blend.
 */
export async function accessibleLeagues(
  userId: string,
  email: string | null,
): Promise<{ leagueIds: string[]; rolesByLeague: Map<string, string[]> }> {
  const { activeOrgId } = await resolveActiveOrg(userId, email);
  return accessibleLeaguesInOrg(userId, email, activeOrgId);
}

/** Hydrate a set of league ids into list items (service-role; delegate-safe). */
async function hydrateLeagues(
  leagueIds: string[],
  rolesByLeague: Map<string, string[]>,
): Promise<LeagueListItem[]> {
  if (leagueIds.length === 0) return [];
  const admin = createServiceRoleClient();
  const { data: leagues } = await admin
    .from("leagues")
    .select("id, name, sport, settings")
    .in("id", leagueIds);
  return (leagues ?? []).map((l) => ({
    id: l.id as string,
    name: l.name as string,
    sport: l.sport as string,
    location: ((l.settings ?? {}) as { location?: string }).location ?? null,
    roles: rolesByLeague.get(l.id as string) ?? [],
  }));
}

/** Leagues the current user can access in the ACTIVE org, with their roles. */
export async function getMyLeagues(): Promise<LeagueListItem[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { leagueIds, rolesByLeague } = await accessibleLeagues(user.id, user.email ?? null);
  return hydrateLeagues(leagueIds, rolesByLeague);
}

/**
 * One-shot nav payload for the league layout: the org list (for the switcher),
 * the active org, and the active org's leagues (for the rail). Resolves the
 * active org once and reuses it, so the layout doesn't pay for it twice.
 */
export async function getLeagueNavData(): Promise<{
  orgs: LeagueOrg[];
  activeOrgId: string | null;
  leagues: LeagueListItem[];
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { orgs: [], activeOrgId: null, leagues: [] };

  const { activeOrgId, orgs } = await resolveActiveOrg(user.id, user.email ?? null);
  const { leagueIds, rolesByLeague } = await accessibleLeaguesInOrg(
    user.id,
    user.email ?? null,
    activeOrgId,
  );
  const leagues = await hydrateLeagues(leagueIds, rolesByLeague);
  return { orgs, activeOrgId, leagues };
}

/**
 * Leagues in the user's OWN organization (those they created), regardless of the
 * active-org selection. The People & access page uses this: you grant access to
 * the leagues you own, never to a delegated org's leagues.
 */
export async function ownOrgLeagues(): Promise<LeagueListItem[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const admin = createServiceRoleClient();
  const { data: leagues } = await admin
    .from("leagues")
    .select("id, name, sport, settings")
    .eq("created_by", user.id);
  return (leagues ?? []).map((l) => ({
    id: l.id as string,
    name: l.name as string,
    sport: l.sport as string,
    location: ((l.settings ?? {}) as { location?: string }).location ?? null,
    roles: ["operator"],
  }));
}

// Approximate per-team capacity for fill-rate math when divisions don't pin a
// max_roster_size. Fill is "rostered ÷ (teams × DEFAULT_ROSTER)".
const DEFAULT_ROSTER = 12;

export type PortfolioStatus = "open" | "rostering" | "setup" | "closed";

export type PortfolioLeagueRow = {
  id: string;
  name: string;
  sport: string;
  /** Football sub-type (flag/tackle/7v7) from settings, or null. */
  variant: string | null;
  location: string | null;
  group: string | null;
  teams: number;
  teamsWithoutCoach: number;
  registrations: number;
  rostered: number;
  capacity: number;
  fillPct: number;
  needsReview: number;
  unrostered: number;
  revenuePaidCents: number;
  revenueUnpaidCents: number;
  isOpen: boolean;
  closesAt: string | null;
  status: PortfolioStatus;
  /** Open work items for this league (pending + coachless teams + unrostered). */
  attention: number;
};

export type PortfolioTotals = {
  leagues: number;
  teams: number;
  teamsWithoutCoach: number;
  registrations: number;
  needsReview: number;
  unrostered: number;
  rostered: number;
  capacity: number;
  fillPct: number;
  revenuePaidCents: number;
  revenueUnpaidCents: number;
  cities: number;
  sports: number;
  windowsClosingSoon: number;
};

export type PortfolioSummary = { leagues: PortfolioLeagueRow[]; totals: PortfolioTotals };

function emptyTotals(): PortfolioTotals {
  return {
    leagues: 0, teams: 0, teamsWithoutCoach: 0, registrations: 0, needsReview: 0,
    unrostered: 0, rostered: 0, capacity: 0, fillPct: 0, revenuePaidCents: 0,
    revenueUnpaidCents: 0, cities: 0, sports: 0, windowsClosingSoon: 0,
  };
}

function sum<T>(arr: T[], f: (t: T) => number): number {
  return arr.reduce((s, t) => s + f(t), 0);
}

export type PortfolioInput = {
  leagues: { id: string; name: string; sport: string; settings: unknown }[];
  teams: { league_id: string; head_coach_name: string | null }[];
  regs: { league_id: string; status: string; payment_status: string; fee_cents: number | null }[];
  windows: { league_id: string; is_open: boolean; closes_at: string | null }[];
};

/**
 * Pure aggregation core for the portfolio rollup — separated from I/O so it's
 * deterministically unit-tested. `nowMs` is injected (no `Date.now()` inside)
 * so the "closing soon" window is testable.
 */
export function buildPortfolioSummary(input: PortfolioInput, nowMs: number): PortfolioSummary {
  type Agg = {
    teams: number; noCoach: number; regs: number; rostered: number; needsReview: number;
    unrostered: number; paid: number; unpaid: number; isOpen: boolean; closesAt: string | null;
  };
  const agg = new Map<string, Agg>();
  const get = (id: string): Agg => {
    let a = agg.get(id);
    if (!a) {
      a = { teams: 0, noCoach: 0, regs: 0, rostered: 0, needsReview: 0, unrostered: 0, paid: 0, unpaid: 0, isOpen: false, closesAt: null };
      agg.set(id, a);
    }
    return a;
  };

  for (const t of input.teams) {
    const a = get(t.league_id);
    a.teams += 1;
    if (!t.head_coach_name) a.noCoach += 1;
  }
  for (const r of input.regs) {
    const a = get(r.league_id);
    a.regs += 1;
    if (r.status === "rostered") a.rostered += 1;
    else if (r.status === "submitted") a.needsReview += 1;
    else if (r.status === "approved" || r.status === "waitlisted") a.unrostered += 1;
    const fee = r.fee_cents ?? 0;
    if (r.payment_status === "paid") a.paid += fee;
    else if (r.payment_status === "unpaid") a.unpaid += fee;
  }
  for (const w of input.windows) {
    const a = get(w.league_id);
    if (w.is_open) a.isOpen = true;
    if (w.closes_at && (!a.closesAt || w.closes_at < a.closesAt)) a.closesAt = w.closes_at;
  }

  const soon = nowMs + 7 * 24 * 3600 * 1000;
  const rows: PortfolioLeagueRow[] = input.leagues
    .map((l) => {
      const a = get(l.id);
      const settings = (l.settings ?? {}) as { variant?: string; location?: string; group?: string };
      const capacity = a.teams * DEFAULT_ROSTER;
      const fillPct = capacity > 0 ? a.rostered / capacity : 0;
      const status: PortfolioStatus = a.isOpen ? "open" : fillPct >= 0.45 ? "rostering" : "setup";
      return {
        id: l.id,
        name: l.name,
        sport: l.sport,
        variant: settings.variant ?? null,
        location: settings.location ?? null,
        group: settings.group ?? null,
        teams: a.teams,
        teamsWithoutCoach: a.noCoach,
        registrations: a.regs,
        rostered: a.rostered,
        capacity,
        fillPct,
        needsReview: a.needsReview,
        unrostered: a.unrostered,
        revenuePaidCents: a.paid,
        revenueUnpaidCents: a.unpaid,
        isOpen: a.isOpen,
        closesAt: a.closesAt,
        status,
        attention: a.needsReview + a.noCoach + a.unrostered,
      };
    })
    .sort((x, y) => y.registrations - x.registrations);

  const totals: PortfolioTotals = {
    leagues: rows.length,
    teams: sum(rows, (r) => r.teams),
    teamsWithoutCoach: sum(rows, (r) => r.teamsWithoutCoach),
    registrations: sum(rows, (r) => r.registrations),
    needsReview: sum(rows, (r) => r.needsReview),
    unrostered: sum(rows, (r) => r.unrostered),
    rostered: sum(rows, (r) => r.rostered),
    capacity: sum(rows, (r) => r.capacity),
    fillPct: 0,
    revenuePaidCents: sum(rows, (r) => r.revenuePaidCents),
    revenueUnpaidCents: sum(rows, (r) => r.revenueUnpaidCents),
    cities: new Set(rows.map((r) => r.location).filter(Boolean)).size,
    sports: new Set(rows.map((r) => r.variant || r.sport)).size,
    windowsClosingSoon: rows.filter((r) => r.isOpen && r.closesAt && Date.parse(r.closesAt) <= soon).length,
  };
  totals.fillPct = totals.capacity > 0 ? totals.rostered / totals.capacity : 0;

  return { leagues: rows, totals };
}

/**
 * Portfolio rollup across the ACTIVE organization's leagues (cookie-resolved via
 * accessibleLeagues), so two orgs' figures — revenue especially — never blend.
 * Bounded by design: 4 grouped fetches total (leagues + teams + registrations + windows),
 * aggregated in memory — cost scales with the operator's data, not the league
 * count, so 5 leagues and 500 cost the same shape. (If one operator ever holds
 * enough leagues that loading raw registration rows is too heavy, push the
 * GROUP BY into a Postgres RPC; this function's return shape stays identical.)
 */
export async function getPortfolioSummary(): Promise<PortfolioSummary> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { leagues: [], totals: emptyTotals() };

  // Accessible leagues in the ACTIVE org. Service-role for the data fetches
  // because grant-only (delegated) leagues aren't readable under the delegate's
  // own RLS — the id set from accessibleLeagues() IS the authority.
  const { leagueIds: ids } = await accessibleLeagues(user.id, user.email ?? null);
  if (ids.length === 0) return { leagues: [], totals: emptyTotals() };

  const admin = createServiceRoleClient();
  const [leaguesR, teamsR, regsR, windowsR] = await Promise.all([
    admin.from("leagues").select("id, name, sport, settings").in("id", ids),
    admin.from("teams").select("league_id, head_coach_name").in("league_id", ids),
    admin
      .from("player_registrations")
      .select("league_id, status, payment_status, fee_cents")
      .in("league_id", ids),
    admin.from("registration_windows").select("league_id, is_open, closes_at").in("league_id", ids),
  ]);

  return buildPortfolioSummary(
    {
      leagues: (leaguesR.data ?? []) as PortfolioInput["leagues"],
      teams: (teamsR.data ?? []) as PortfolioInput["teams"],
      regs: (regsR.data ?? []) as PortfolioInput["regs"],
      windows: (windowsR.data ?? []) as PortfolioInput["windows"],
    },
    Date.now(),
  );
}

export type UpcomingEvent = {
  id: string;
  title: string;
  startsAt: string;
  kind: string;
};

export type LeagueDashboard = {
  league: { id: string; name: string; sport: string };
  divisions: number;
  teams: number;
  teamsWithoutCoach: number;
  coaches: number;
  registrations: RegistrationSummary;
  upcoming: UpcomingEvent[];
};

/** Operational summary for one league. Returns null if not visible to the user. */
export async function loadLeagueDashboard(
  leagueId: string,
  db?: Awaited<ReturnType<typeof createClient>>,
): Promise<LeagueDashboard | null> {
  // A delegated member can't RLS-read this league, so the page passes the
  // service-role client from resolveLeagueView(); members pass their cookie
  // client (or nothing, and we make one — unchanged behavior).
  const supabase = db ?? (await createClient());

  const { data: league } = await supabase
    .from("leagues")
    .select("id, name, sport")
    .eq("id", leagueId)
    .maybeSingle();
  if (!league) return null;

  const nowIso = new Date().toISOString();
  const [divs, teams, regs, coaches, events] = await Promise.all([
    supabase.from("league_divisions").select("id").eq("league_id", leagueId),
    supabase.from("teams").select("id, head_coach_name").eq("league_id", leagueId),
    supabase.from("player_registrations").select("status").eq("league_id", leagueId),
    supabase
      .from("league_members")
      .select("user_id")
      .eq("league_id", leagueId)
      .eq("role", "coach"),
    supabase
      .from("league_events")
      .select("id, title, starts_at, kind")
      .eq("league_id", leagueId)
      .gte("starts_at", nowIso)
      .order("starts_at", { ascending: true })
      .limit(3),
  ]);

  return {
    league: {
      id: league.id as string,
      name: league.name as string,
      sport: league.sport as string,
    },
    divisions: divs.data?.length ?? 0,
    teams: teams.data?.length ?? 0,
    teamsWithoutCoach: (teams.data ?? []).filter((t) => !t.head_coach_name).length,
    coaches: coaches.data?.length ?? 0,
    registrations: summarizeRegistrations(
      (regs.data ?? []) as { status: RegistrationStatus }[],
    ),
    upcoming: (events.data ?? []).map((e) => ({
      id: e.id as string,
      title: e.title as string,
      startsAt: e.starts_at as string,
      kind: e.kind as string,
    })),
  };
}
