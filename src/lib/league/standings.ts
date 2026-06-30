export type StandingsGame = {
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
};

export type StandingsTeam = {
  id: string;
  name: string;
  divisionId: string | null;
  divisionName: string | null;
};

export type StandingsRow = {
  teamId: string;
  teamName: string;
  played: number;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  diff: number;
  /** League-table points (soccer 3/1/0). 0 for sports that don't use a table. */
  tablePoints: number;
  /** (wins + ½·ties) / played, or 0 when unplayed. */
  winPct: number;
};

export type DivisionStandings = {
  divisionId: string | null;
  divisionName: string | null;
  rows: StandingsRow[];
};

// How a sport ranks its table. The default (football) ranks by wins then point
// differential; soccer uses table points; basketball/baseball use win %.
export type StandingsRankingRule = "wins_diff" | "table_points" | "win_pct";

export type SportStandingsConfig = {
  rankingRule: StandingsRankingRule;
  /** Whether a drawn result is legal. Basketball/baseball/volleyball: false. */
  allowsTies: boolean;
  /** Show a league-table points column (soccer). */
  usesTablePoints: boolean;
  /** Table points for a win / a draw (only meaningful when usesTablePoints). */
  winPoints: number;
  drawPoints: number;
};

const DEFAULT_CONFIG: SportStandingsConfig = {
  rankingRule: "wins_diff",
  allowsTies: true,
  usesTablePoints: false,
  winPoints: 0,
  drawPoints: 0,
};

const CONFIG_BY_SPORT: Record<string, SportStandingsConfig> = {
  football: DEFAULT_CONFIG,
  soccer: {
    rankingRule: "table_points",
    allowsTies: true,
    usesTablePoints: true,
    winPoints: 3,
    drawPoints: 1,
  },
  basketball: { rankingRule: "win_pct", allowsTies: false, usesTablePoints: false, winPoints: 0, drawPoints: 0 },
  baseball: { rankingRule: "win_pct", allowsTies: false, usesTablePoints: false, winPoints: 0, drawPoints: 0 },
  volleyball: { rankingRule: "win_pct", allowsTies: false, usesTablePoints: false, winPoints: 0, drawPoints: 0 },
  other: DEFAULT_CONFIG,
};

export function sportStandingsConfig(sport: string | null | undefined): SportStandingsConfig {
  return (sport && CONFIG_BY_SPORT[sport]) || DEFAULT_CONFIG;
}

/** Whether a tie/draw is a legal result for this sport (gate at score-write). */
export function sportAllowsTies(sport: string | null | undefined): boolean {
  return sportStandingsConfig(sport).allowsTies;
}

function comparator(
  config: SportStandingsConfig,
): (a: StandingsRow, b: StandingsRow) => number {
  const byName = (a: StandingsRow, b: StandingsRow) => a.teamName.localeCompare(b.teamName);
  if (config.rankingRule === "table_points") {
    return (a, b) =>
      b.tablePoints - a.tablePoints || b.diff - a.diff || b.pointsFor - a.pointsFor || byName(a, b);
  }
  if (config.rankingRule === "win_pct") {
    return (a, b) =>
      b.winPct - a.winPct || b.diff - a.diff || b.pointsFor - a.pointsFor || byName(a, b);
  }
  return (a, b) => b.wins - a.wins || b.diff - a.diff || b.pointsFor - a.pointsFor || byName(a, b);
}

/**
 * Derive standings from FINAL games. Pure + deterministic. A game only counts
 * when it's final with both scores set and both teams still exist. Teams are
 * grouped by division and ranked by the sport's rule (default: wins → point
 * differential → points scored → name).
 */
export function computeStandings(
  teams: StandingsTeam[],
  games: StandingsGame[],
  sport?: string | null,
): DivisionStandings[] {
  const config = sportStandingsConfig(sport);
  const teamDiv = new Map<string, string | null>(teams.map((t) => [t.id, t.divisionId ?? null]));

  const byTeam = new Map<string, StandingsRow>();
  for (const t of teams) {
    byTeam.set(t.id, {
      teamId: t.id,
      teamName: t.name,
      played: 0,
      wins: 0,
      losses: 0,
      ties: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      diff: 0,
      tablePoints: 0,
      winPct: 0,
    });
  }

  for (const g of games) {
    if (g.status !== "final" || g.homeScore == null || g.awayScore == null) continue;
    const home = byTeam.get(g.homeTeamId);
    const away = byTeam.get(g.awayTeamId);
    if (!home || !away) continue; // a team was deleted — skip the game
    // Only intra-division games count toward divisional standings; a
    // cross-division game (e.g. an exhibition) would otherwise pollute two
    // separate divisions' tables off one result.
    if ((teamDiv.get(g.homeTeamId) ?? null) !== (teamDiv.get(g.awayTeamId) ?? null)) continue;

    home.played += 1;
    away.played += 1;
    home.pointsFor += g.homeScore;
    home.pointsAgainst += g.awayScore;
    away.pointsFor += g.awayScore;
    away.pointsAgainst += g.homeScore;

    if (g.homeScore > g.awayScore) {
      home.wins += 1;
      away.losses += 1;
    } else if (g.homeScore < g.awayScore) {
      away.wins += 1;
      home.losses += 1;
    } else {
      home.ties += 1;
      away.ties += 1;
    }
  }

  for (const r of byTeam.values()) {
    r.diff = r.pointsFor - r.pointsAgainst;
    r.tablePoints = r.wins * config.winPoints + r.ties * config.drawPoints;
    r.winPct = r.played > 0 ? (r.wins + 0.5 * r.ties) / r.played : 0;
  }

  const divisions = new Map<string, DivisionStandings>();
  for (const t of teams) {
    const key = t.divisionId ?? "__none__";
    if (!divisions.has(key)) {
      divisions.set(key, {
        divisionId: t.divisionId ?? null,
        divisionName: t.divisionName ?? null,
        rows: [],
      });
    }
    const row = byTeam.get(t.id);
    if (row) divisions.get(key)!.rows.push(row);
  }

  const cmp = comparator(config);
  for (const d of divisions.values()) d.rows.sort(cmp);

  return [...divisions.values()].sort((a, b) => {
    if (!a.divisionName && b.divisionName) return 1; // ungrouped teams last
    if (a.divisionName && !b.divisionName) return -1;
    const byName = (a.divisionName ?? "").localeCompare(b.divisionName ?? "");
    if (byName !== 0) return byName;
    // Stable tiebreaker when two divisions share a name.
    return (a.divisionId ?? "").localeCompare(b.divisionId ?? "");
  });
}
