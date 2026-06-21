import "server-only";

import { createClient } from "@/lib/supabase/server";
import { isUnrostered, type RegistrationStatus } from "./registration";

/**
 * Operator-console data access (Track B). Read paths run as the signed-in user,
 * so RLS scopes everything to leagues they belong to. Aggregation is split into
 * a pure `summarizeRegistrations` (unit-tested) + thin Supabase fetches.
 */

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

export type LeagueDashboard = {
  league: { id: string; name: string; sport: string };
  divisions: number;
  teams: number;
  teamsWithoutCoach: number;
  coaches: number;
  registrations: RegistrationSummary;
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

  const [divs, teams, regs, coaches] = await Promise.all([
    supabase.from("league_divisions").select("id").eq("league_id", leagueId),
    supabase.from("teams").select("id, head_coach_name").eq("league_id", leagueId),
    supabase.from("player_registrations").select("status").eq("league_id", leagueId),
    supabase
      .from("league_members")
      .select("user_id")
      .eq("league_id", leagueId)
      .eq("role", "coach"),
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
  };
}
