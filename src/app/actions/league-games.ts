"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { gateLeagueCapability } from "@/lib/league/authorize";
import {
  computeStandings,
  sportAllowsTies,
  type DivisionStandings,
} from "@/lib/league/standings";

export type GameRow = {
  id: string;
  homeTeamId: string;
  homeTeamName: string;
  awayTeamId: string;
  awayTeamName: string;
  divisionName: string | null;
  startsAt: string | null;
  location: string | null;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
};

export type GamesTeam = {
  id: string;
  name: string;
  divisionId: string | null;
  divisionName: string | null;
};

export type GamesBoard = {
  teams: GamesTeam[];
  games: GameRow[];
  standings: DivisionStandings[];
  sport: string;
};

// Schedule + score writes require manage_schedule (owners always have it).
function gateAdmin(leagueId: string) {
  return gateLeagueCapability(leagueId, "manage_schedule");
}

export async function getGamesBoardAction(leagueId: string) {
  const gate = await gateAdmin(leagueId);
  if (!gate.ok) return { ok: false as const, error: gate.error, board: null };
  const supabase = gate.supabase;

  const [teamsRes, divsRes, gamesRes, leagueRes] = await Promise.all([
    supabase
      .from("teams")
      .select("id, name, league_division_id")
      .eq("league_id", leagueId)
      .order("name", { ascending: true }),
    supabase.from("league_divisions").select("id, name").eq("league_id", leagueId),
    supabase
      .from("league_games")
      .select(
        "id, home_team_id, away_team_id, division_id, starts_at, location, home_score, away_score, status",
      )
      .eq("league_id", leagueId)
      .order("starts_at", { ascending: true, nullsFirst: false })
      .limit(2000),
    supabase.from("leagues").select("sport").eq("id", leagueId).maybeSingle(),
  ]);
  const sport = (leagueRes.data?.sport as string | null) ?? "football";

  const divName = new Map<string, string>(
    (divsRes.data ?? []).map((d) => [d.id as string, d.name as string]),
  );
  const teamName = new Map<string, string>(
    (teamsRes.data ?? []).map((t) => [t.id as string, t.name as string]),
  );

  const teams: GamesTeam[] = (teamsRes.data ?? []).map((t) => ({
    id: t.id as string,
    name: t.name as string,
    divisionId: (t.league_division_id as string | null) ?? null,
    divisionName: t.league_division_id ? divName.get(t.league_division_id as string) ?? null : null,
  }));

  // Label a game by the home team's CURRENT division (not the division stamped
  // at create time, which goes stale if the team is later reassigned).
  const teamDivisionName = new Map<string, string | null>(
    teams.map((t) => [t.id, t.divisionName]),
  );

  const rawGames = gamesRes.data ?? [];
  const games: GameRow[] = rawGames.map((gm) => ({
    id: gm.id as string,
    homeTeamId: gm.home_team_id as string,
    homeTeamName: teamName.get(gm.home_team_id as string) ?? "Unknown",
    awayTeamId: gm.away_team_id as string,
    awayTeamName: teamName.get(gm.away_team_id as string) ?? "Unknown",
    divisionName: teamDivisionName.get(gm.home_team_id as string) ?? null,
    startsAt: (gm.starts_at as string | null) ?? null,
    location: (gm.location as string | null) ?? null,
    homeScore: (gm.home_score as number | null) ?? null,
    awayScore: (gm.away_score as number | null) ?? null,
    status: gm.status as string,
  }));

  const standings = computeStandings(
    teams,
    rawGames.map((gm) => ({
      homeTeamId: gm.home_team_id as string,
      awayTeamId: gm.away_team_id as string,
      homeScore: (gm.home_score as number | null) ?? null,
      awayScore: (gm.away_score as number | null) ?? null,
      status: gm.status as string,
    })),
    sport,
  );

  return { ok: true as const, board: { teams, games, standings, sport } as GamesBoard };
}

export async function createGameAction(
  leagueId: string,
  input: { homeTeamId: string; awayTeamId: string; startsAt: string | null; location: string | null },
) {
  const gate = await gateAdmin(leagueId);
  if (!gate.ok) return gate;
  if (!input.homeTeamId || !input.awayTeamId) {
    return { ok: false as const, error: "Pick both teams." };
  }
  if (input.homeTeamId === input.awayTeamId) {
    return { ok: false as const, error: "A team can't play itself." };
  }

  // Both teams must belong to this league.
  const { data: teams } = await gate.supabase
    .from("teams")
    .select("id, league_division_id")
    .eq("league_id", leagueId)
    .in("id", [input.homeTeamId, input.awayTeamId]);
  if (!teams || teams.length !== 2) {
    return { ok: false as const, error: "Both teams must be in this league." };
  }
  const home = teams.find((t) => t.id === input.homeTeamId);

  const { error } = await gate.supabase.from("league_games").insert({
    league_id: leagueId,
    division_id: (home?.league_division_id as string | null) ?? null,
    home_team_id: input.homeTeamId,
    away_team_id: input.awayTeamId,
    starts_at: input.startsAt || null,
    location: input.location?.trim() || null,
    status: "scheduled",
  });
  if (error) return { ok: false as const, error: error.message };
  revalidatePath(`/league/${leagueId}/games`);
  return { ok: true as const };
}

export async function setGameScoreAction(
  leagueId: string,
  gameId: string,
  homeScore: number,
  awayScore: number,
) {
  const gate = await gateAdmin(leagueId);
  if (!gate.ok) return gate;
  if (
    !Number.isInteger(homeScore) ||
    !Number.isInteger(awayScore) ||
    homeScore < 0 ||
    awayScore < 0
  ) {
    return { ok: false as const, error: "Scores must be whole numbers, 0 or more." };
  }
  // Some sports can't end in a tie (basketball, baseball, volleyball). Only the
  // equal-score case needs the sport lookup.
  if (homeScore === awayScore) {
    const { data: league } = await gate.supabase
      .from("leagues")
      .select("sport")
      .eq("id", leagueId)
      .maybeSingle();
    if (!sportAllowsTies((league?.sport as string | null) ?? "football")) {
      return { ok: false as const, error: "This sport can't end in a tie — enter a winner." };
    }
  }
  const { data: updated, error } = await gate.supabase
    .from("league_games")
    .update({ home_score: homeScore, away_score: awayScore, status: "final" })
    .eq("id", gameId)
    .eq("league_id", leagueId)
    .select("id");
  if (error) return { ok: false as const, error: error.message };
  if (!updated || updated.length === 0) {
    return { ok: false as const, error: "That game no longer exists." };
  }
  revalidatePath(`/league/${leagueId}/games`);
  return { ok: true as const };
}

export async function deleteGameAction(leagueId: string, gameId: string) {
  const gate = await gateAdmin(leagueId);
  if (!gate.ok) return gate;
  const { data: deleted, error } = await gate.supabase
    .from("league_games")
    .delete()
    .eq("id", gameId)
    .eq("league_id", leagueId)
    .select("id");
  if (error) return { ok: false as const, error: error.message };
  if (!deleted || deleted.length === 0) {
    return { ok: false as const, error: "That game no longer exists." };
  }
  revalidatePath(`/league/${leagueId}/games`);
  return { ok: true as const };
}
