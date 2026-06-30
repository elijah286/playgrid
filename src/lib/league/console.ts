import "server-only";

import { createClient } from "@/lib/supabase/server";
import { isUnrostered, type RegistrationStatus } from "./registration";

/**
 * Operator-console data access (Track B). Read paths run as the signed-in user,
 * so RLS scopes everything to leagues they belong to. Aggregation is split into
 * a pure `summarizeRegistrations` (unit-tested) + thin Supabase fetches.
 */

/** A league's sport (RLS-scoped to leagues the caller belongs to), or null. */
export async function getLeagueSport(leagueId: string): Promise<string | null> {
  const supabase = await createClient();
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

/** Leagues the current user belongs to (RLS-filtered), with their roles. */
export async function getMyLeagues(): Promise<LeagueListItem[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: members } = await supabase
    .from("league_members")
    .select("league_id, role")
    .eq("user_id", user.id);
  if (!members || members.length === 0) return [];

  const rolesByLeague = new Map<string, string[]>();
  for (const m of members) {
    const id = m.league_id as string;
    rolesByLeague.set(id, [...(rolesByLeague.get(id) ?? []), m.role as string]);
  }

  const { data: leagues } = await supabase
    .from("leagues")
    .select("id, name, sport")
    .in("id", [...rolesByLeague.keys()]);

  return (leagues ?? []).map((l) => ({
    id: l.id as string,
    name: l.name as string,
    sport: l.sport as string,
    roles: rolesByLeague.get(l.id as string) ?? [],
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
 * Portfolio rollup across every league the operator belongs to. Bounded by
 * design: 4 grouped fetches total (leagues + teams + registrations + windows),
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

  const { data: members } = await supabase
    .from("league_members")
    .select("league_id")
    .eq("user_id", user.id);
  const ids = [...new Set((members ?? []).map((m) => m.league_id as string))];
  if (ids.length === 0) return { leagues: [], totals: emptyTotals() };

  const [leaguesR, teamsR, regsR, windowsR] = await Promise.all([
    supabase.from("leagues").select("id, name, sport, settings").in("id", ids),
    supabase.from("teams").select("league_id, head_coach_name").in("league_id", ids),
    supabase
      .from("player_registrations")
      .select("league_id, status, payment_status, fee_cents")
      .in("league_id", ids),
    supabase.from("registration_windows").select("league_id, is_open, closes_at").in("league_id", ids),
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
): Promise<LeagueDashboard | null> {
  const supabase = await createClient();

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
