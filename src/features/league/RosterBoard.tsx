"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import {
  assignRegistrationToTeamAction,
  unassignRegistrationAction,
  type RosterBoard as RosterBoardData,
  type RosterPlayer,
} from "@/app/actions/league-roster";

export function RosterBoard({
  leagueId,
  initial,
}: {
  leagueId: string;
  initial: RosterBoardData;
}) {
  const [board, setBoard] = useState(initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function assign(player: RosterPlayer, teamId: string) {
    if (!teamId) return;
    setError(null);
    setBusyId(player.registrationId);
    startTransition(async () => {
      const r = await assignRegistrationToTeamAction(leagueId, player.registrationId, teamId);
      setBusyId(null);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setBoard((b) => ({
        ...b,
        unrostered: b.unrostered.filter((p) => p.registrationId !== player.registrationId),
        teams: b.teams.map((t) =>
          t.id === teamId
            ? { ...t, players: [...t.players, { ...player, status: "rostered" }] }
            : t,
        ),
      }));
    });
  }

  function unassign(player: RosterPlayer, teamId: string) {
    setError(null);
    setBusyId(player.registrationId);
    startTransition(async () => {
      const r = await unassignRegistrationAction(leagueId, player.registrationId);
      setBusyId(null);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setBoard((b) => ({
        ...b,
        unrostered: [...b.unrostered, { ...player, status: "approved" }],
        teams: b.teams.map((t) =>
          t.id === teamId
            ? { ...t, players: t.players.filter((p) => p.registrationId !== player.registrationId) }
            : t,
        ),
      }));
    });
  }

  const noTeams = board.teams.length === 0;

  return (
    <div className="space-y-6">
      {error ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-100 dark:ring-amber-800">
          {error}
        </p>
      ) : null}

      <section>
        <h2 className="mb-2 text-sm font-semibold text-foreground">
          Needs a team{board.unrostered.length > 0 ? ` (${board.unrostered.length})` : ""}
        </h2>
        {board.waitlistedCount > 0 ? (
          <p className="mb-2 text-xs text-muted">
            {board.waitlistedCount} waitlisted —{" "}
            <Link href={`/league/${leagueId}/registration`} className="text-primary hover:underline">
              approve them in the review queue
            </Link>{" "}
            to make them rosterable.
          </p>
        ) : null}
        {noTeams ? (
          <p className="rounded-2xl border border-border px-4 py-6 text-sm text-muted">
            Create teams first on the{" "}
            <Link href={`/league/${leagueId}/teams`} className="text-primary hover:underline">
              Teams
            </Link>{" "}
            page, then assign players here.
          </p>
        ) : board.unrostered.length === 0 ? (
          <p className="rounded-2xl border border-border px-4 py-6 text-sm text-muted">
            Every approved player has a team. New approvals from the review queue show up here.
          </p>
        ) : (
          <ul className="space-y-2">
            {board.unrostered.map((p) => (
              <li
                key={p.registrationId}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface-raised px-4 py-3"
              >
                <div className="min-w-0">
                  <span className="font-medium text-foreground">{p.name}</span>
                  {p.status === "rostered" ? (
                    <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                      team removed
                    </span>
                  ) : null}
                  {p.divisionPreference ? (
                    <span className="ml-2 text-xs text-muted">prefers {p.divisionPreference}</span>
                  ) : null}
                </div>
                <select
                  defaultValue=""
                  disabled={busyId === p.registrationId}
                  onChange={(e) => assign(p, e.target.value)}
                  className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                >
                  <option value="" disabled>
                    Assign to team…
                  </option>
                  {board.teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                      {t.divisionName ? ` · ${t.divisionName}` : ""}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-foreground">Teams</h2>
        {noTeams ? null : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {board.teams.map((t) => (
              <div key={t.id} className="rounded-2xl border border-border p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="font-semibold text-foreground">{t.name}</div>
                  <div className="text-xs text-muted">
                    {t.players.length} {t.players.length === 1 ? "player" : "players"}
                  </div>
                </div>
                {t.divisionName ? (
                  <div className="text-xs text-muted">{t.divisionName}</div>
                ) : null}
                {t.players.length === 0 ? (
                  <p className="mt-3 text-xs text-muted">No players yet.</p>
                ) : (
                  <ul className="mt-3 space-y-1.5">
                    {t.players.map((p) => (
                      <li
                        key={p.registrationId}
                        className="flex items-center justify-between gap-2 text-sm"
                      >
                        <span className="text-foreground">{p.name}</span>
                        <button
                          type="button"
                          disabled={busyId === p.registrationId}
                          onClick={() => unassign(p, t.id)}
                          className="rounded-md px-1.5 text-xs text-muted hover:bg-foreground/5 hover:text-foreground disabled:opacity-40"
                          aria-label={`Remove ${p.name} from ${t.name}`}
                          title="Remove from team"
                        >
                          ✕
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
