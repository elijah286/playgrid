import type { DivisionStandings } from "@/lib/league/standings";
import { sportStandingsConfig } from "@/lib/league/standings";
import { sportConfig } from "@/lib/league/sportConfig";

function fmtPct(p: number): string {
  // Baseball/basketball convention: .750, 1.000
  const s = p.toFixed(3);
  return s.startsWith("0") ? s.slice(1) : s;
}

export function StandingsTable({
  standings,
  sport,
}: {
  standings: DivisionStandings[];
  sport?: string;
}) {
  const hasAny = standings.some((d) => d.rows.length > 0);
  if (!hasAny) {
    return (
      <p className="rounded-2xl border border-border px-4 py-6 text-sm text-muted">
        Standings appear once games are marked final.
      </p>
    );
  }

  const config = sportStandingsConfig(sport);
  const abbr = (sportConfig(sport).scoreNoun[0] ?? "p").toUpperCase();
  const showTies = config.allowsTies;
  const showPct = config.rankingRule === "win_pct";
  const showPts = config.usesTablePoints;

  return (
    <div className="space-y-5">
      {standings
        .filter((d) => d.rows.length > 0)
        .map((d) => (
          <div key={d.divisionId ?? "__none__"} className="overflow-hidden rounded-2xl border border-border">
            <div className="border-b border-border bg-foreground/5 px-4 py-2 text-sm font-semibold text-foreground">
              {d.divisionName ?? "Teams"}
            </div>
            <table className="w-full text-left text-sm">
              <thead className="text-xs font-semibold uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-2">Team</th>
                  <th className="px-2 py-2 text-center">W</th>
                  <th className="px-2 py-2 text-center">L</th>
                  {showTies ? <th className="px-2 py-2 text-center">T</th> : null}
                  {showPct ? <th className="px-2 py-2 text-center tabular-nums">Pct</th> : null}
                  <th className="px-2 py-2 text-center tabular-nums">{abbr}F</th>
                  <th className="px-2 py-2 text-center tabular-nums">{abbr}A</th>
                  <th className="px-3 py-2 text-center tabular-nums">Diff</th>
                  {showPts ? <th className="px-3 py-2 text-center tabular-nums">Pts</th> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {d.rows.map((r) => (
                  <tr key={r.teamId}>
                    <td className="px-4 py-2 font-medium text-foreground">{r.teamName}</td>
                    <td className="px-2 py-2 text-center tabular-nums">{r.wins}</td>
                    <td className="px-2 py-2 text-center tabular-nums">{r.losses}</td>
                    {showTies ? (
                      <td className="px-2 py-2 text-center tabular-nums">{r.ties}</td>
                    ) : null}
                    {showPct ? (
                      <td className="px-2 py-2 text-center tabular-nums">{fmtPct(r.winPct)}</td>
                    ) : null}
                    <td className="px-2 py-2 text-center tabular-nums text-muted">{r.pointsFor}</td>
                    <td className="px-2 py-2 text-center tabular-nums text-muted">{r.pointsAgainst}</td>
                    <td className="px-3 py-2 text-center tabular-nums">
                      {r.diff > 0 ? `+${r.diff}` : r.diff}
                    </td>
                    {showPts ? (
                      <td className="px-3 py-2 text-center font-semibold tabular-nums">
                        {r.tablePoints}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
    </div>
  );
}
