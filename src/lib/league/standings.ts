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
};

export type DivisionStandings = {
  divisionId: string | null;
  divisionName: string | null;
  rows: StandingsRow[];
};

/**
 * Derive standings from FINAL games. Pure + deterministic. A game only counts
 * when it's final with both scores set and both teams still exist. Teams are
 * grouped by division and ranked by wins, then point differential, then points
 * scored, then name.
 */
export function computeStandings(
  teams: StandingsTeam[],
  games: StandingsGame[],
): DivisionStandings[] {
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

  for (const r of byTeam.values()) r.diff = r.pointsFor - r.pointsAgainst;

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

  for (const d of divisions.values()) {
    d.rows.sort(
      (a, b) =>
        b.wins - a.wins ||
        b.diff - a.diff ||
        b.pointsFor - a.pointsFor ||
        a.teamName.localeCompare(b.teamName),
    );
  }

  return [...divisions.values()].sort((a, b) => {
    if (!a.divisionName && b.divisionName) return 1; // ungrouped teams last
    if (a.divisionName && !b.divisionName) return -1;
    const byName = (a.divisionName ?? "").localeCompare(b.divisionName ?? "");
    if (byName !== 0) return byName;
    // Stable tiebreaker when two divisions share a name.
    return (a.divisionId ?? "").localeCompare(b.divisionId ?? "");
  });
}
