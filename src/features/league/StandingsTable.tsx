import type { DivisionStandings } from "@/lib/league/standings";

export function StandingsTable({ standings }: { standings: DivisionStandings[] }) {
  const hasAny = standings.some((d) => d.rows.length > 0);
  if (!hasAny) {
    return (
      <p className="rounded-2xl border border-border px-4 py-6 text-sm text-muted">
        Standings appear once games are marked final.
      </p>
    );
  }

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
                  <th className="px-2 py-2 text-center">T</th>
                  <th className="px-2 py-2 text-center tabular-nums">PF</th>
                  <th className="px-2 py-2 text-center tabular-nums">PA</th>
                  <th className="px-3 py-2 text-center tabular-nums">Diff</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {d.rows.map((r) => (
                  <tr key={r.teamId}>
                    <td className="px-4 py-2 font-medium text-foreground">{r.teamName}</td>
                    <td className="px-2 py-2 text-center tabular-nums">{r.wins}</td>
                    <td className="px-2 py-2 text-center tabular-nums">{r.losses}</td>
                    <td className="px-2 py-2 text-center tabular-nums">{r.ties}</td>
                    <td className="px-2 py-2 text-center tabular-nums text-muted">{r.pointsFor}</td>
                    <td className="px-2 py-2 text-center tabular-nums text-muted">{r.pointsAgainst}</td>
                    <td className="px-3 py-2 text-center tabular-nums">
                      {r.diff > 0 ? `+${r.diff}` : r.diff}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
    </div>
  );
}
