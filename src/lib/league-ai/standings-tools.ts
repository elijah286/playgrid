// Standings read tool for Leo — registered in lockstep with per-sport standings.
// Reuses computeStandings, so the ranking is sport-correct for free.

import { createServiceRoleClient } from "@/lib/supabase/admin";
import {
  computeStandings,
  sportStandingsConfig,
  type StandingsGame,
  type StandingsTeam,
} from "@/lib/league/standings";
import type { LeagueTool, LeagueToolResult } from "./types";

const listStandings: LeagueTool = {
  kind: "read",
  def: {
    name: "list_standings",
    description:
      "Current standings by division, ranked the way this league's sport ranks (soccer table points, basketball/baseball win %, football wins→differential). Use to answer 'who's leading?' or 'what are the standings?'.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  handler: async (_input, ctx): Promise<LeagueToolResult> => {
    const admin = createServiceRoleClient();
    const [{ data: league }, { data: teamRows }, { data: divs }, { data: gameRows }] =
      await Promise.all([
        admin.from("leagues").select("sport").eq("id", ctx.leagueId).maybeSingle(),
        admin.from("teams").select("id, name, league_division_id").eq("league_id", ctx.leagueId),
        admin.from("league_divisions").select("id, name").eq("league_id", ctx.leagueId),
        admin
          .from("league_games")
          .select("home_team_id, away_team_id, home_score, away_score, status")
          .eq("league_id", ctx.leagueId)
          .limit(2000),
      ]);

    const sport = (league?.sport as string | null) ?? "football";
    const divName = new Map((divs ?? []).map((d) => [d.id as string, d.name as string]));
    const teams: StandingsTeam[] = (teamRows ?? []).map((t) => ({
      id: t.id as string,
      name: t.name as string,
      divisionId: (t.league_division_id as string | null) ?? null,
      divisionName: t.league_division_id ? divName.get(t.league_division_id as string) ?? null : null,
    }));
    const games: StandingsGame[] = (gameRows ?? []).map((gm) => ({
      homeTeamId: gm.home_team_id as string,
      awayTeamId: gm.away_team_id as string,
      homeScore: (gm.home_score as number | null) ?? null,
      awayScore: (gm.away_score as number | null) ?? null,
      status: gm.status as string,
    }));

    const config = sportStandingsConfig(sport);
    const standings = computeStandings(teams, games, sport).filter((d) =>
      d.rows.some((r) => r.played > 0),
    );
    if (standings.length === 0) {
      return { ok: true, result: "No standings yet — no games have been marked final." };
    }

    const lines = standings.map((d) => {
      const ranked = d.rows
        .filter((r) => r.played > 0)
        .map((r) => {
          const metric =
            config.rankingRule === "table_points"
              ? `${r.tablePoints} pts`
              : config.rankingRule === "win_pct"
                ? r.winPct.toFixed(3)
                : `${r.wins}-${r.losses}${config.allowsTies ? `-${r.ties}` : ""}`;
          return `${r.teamName} (${metric})`;
        })
        .join(", ");
      return `${d.divisionName ?? "Teams"}: ${ranked}`;
    });
    return { ok: true, result: `Standings — ${lines.join("; ")}.` };
  },
};

export const STANDINGS_TOOLS: LeagueTool[] = [listStandings];
