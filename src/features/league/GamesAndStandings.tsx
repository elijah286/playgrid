"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import {
  createGameAction,
  deleteGameAction,
  getGamesBoardAction,
  setGameScoreAction,
  type GamesBoard,
  type GameRow,
} from "@/app/actions/league-games";
import { StandingsTable } from "./StandingsTable";

type Msg = { kind: "error" | "success"; text: string } | null;
type Scores = Record<string, { home: string; away: string }>;

function fmtDateTime(iso: string | null) {
  if (!iso) return "TBD";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "TBD";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function initScores(games: GameRow[]): Scores {
  const m: Scores = {};
  for (const g of games) {
    m[g.id] = {
      home: g.homeScore == null ? "" : String(g.homeScore),
      away: g.awayScore == null ? "" : String(g.awayScore),
    };
  }
  return m;
}

const selectCls =
  "rounded-lg border border-border bg-surface px-2 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";

export function GamesAndStandings({
  leagueId,
  initial,
}: {
  leagueId: string;
  initial: GamesBoard;
}) {
  const [board, setBoard] = useState(initial);
  const [scores, setScores] = useState<Scores>(() => initScores(initial.games));
  const [form, setForm] = useState({ homeTeamId: "", awayTeamId: "", startsAt: "", location: "" });
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, startTransition] = useTransition();

  function refresh() {
    startTransition(async () => {
      const r = await getGamesBoardAction(leagueId);
      if (r.ok && r.board) {
        const nb = r.board;
        setBoard(nb);
        // Merge: seed any newly-added games but preserve in-progress edits the
        // operator may be typing in other rows.
        setScores((prev) => ({ ...initScores(nb.games), ...prev }));
      }
    });
  }

  function create() {
    if (!form.homeTeamId || !form.awayTeamId) {
      setMsg({ kind: "error", text: "Pick both teams." });
      return;
    }
    setMsg(null);
    startTransition(async () => {
      const r = await createGameAction(leagueId, {
        homeTeamId: form.homeTeamId,
        awayTeamId: form.awayTeamId,
        startsAt: form.startsAt || null,
        location: form.location || null,
      });
      if (!r.ok) {
        setMsg({ kind: "error", text: r.error });
        return;
      }
      setForm({ homeTeamId: "", awayTeamId: "", startsAt: "", location: "" });
      refresh();
    });
  }

  function saveScore(gameId: string) {
    const s = scores[gameId];
    const homeRaw = (s?.home ?? "").trim();
    const awayRaw = (s?.away ?? "").trim();
    const hs = Number(homeRaw);
    const as = Number(awayRaw);
    if (
      homeRaw === "" ||
      awayRaw === "" ||
      !Number.isInteger(hs) ||
      !Number.isInteger(as) ||
      hs < 0 ||
      as < 0
    ) {
      setMsg({ kind: "error", text: "Enter whole-number scores (0 or more) for both teams." });
      return;
    }
    setMsg(null);
    startTransition(async () => {
      const r = await setGameScoreAction(leagueId, gameId, hs, as);
      if (!r.ok) {
        setMsg({ kind: "error", text: r.error });
        return;
      }
      refresh();
    });
  }

  function remove(gameId: string) {
    if (!globalThis.confirm("Delete this game?")) return;
    setMsg(null);
    startTransition(async () => {
      const r = await deleteGameAction(leagueId, gameId);
      if (!r.ok) {
        setMsg({ kind: "error", text: r.error });
        return;
      }
      refresh();
    });
  }

  const noTeams = board.teams.length === 0;

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-2 text-sm font-semibold text-foreground">Schedule a game</h2>
        {noTeams ? (
          <p className="rounded-2xl border border-border px-4 py-6 text-sm text-muted">
            Create teams first on the{" "}
            <Link href={`/league/${leagueId}/teams`} className="text-primary hover:underline">
              Teams
            </Link>{" "}
            page.
          </p>
        ) : (
          <div className="rounded-2xl border border-border p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="font-medium text-foreground">Home</span>
                <select
                  value={form.homeTeamId}
                  onChange={(e) => setForm({ ...form, homeTeamId: e.target.value })}
                  className={`mt-1 w-full ${selectCls}`}
                >
                  <option value="">Select team…</option>
                  {board.teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                      {t.divisionName ? ` · ${t.divisionName}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="font-medium text-foreground">Away</span>
                <select
                  value={form.awayTeamId}
                  onChange={(e) => setForm({ ...form, awayTeamId: e.target.value })}
                  className={`mt-1 w-full ${selectCls}`}
                >
                  <option value="">Select team…</option>
                  {board.teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                      {t.divisionName ? ` · ${t.divisionName}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="font-medium text-foreground">Date &amp; time</span>
                <input
                  type="datetime-local"
                  value={form.startsAt}
                  onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
                  className={`mt-1 w-full ${selectCls}`}
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-foreground">Location</span>
                <input
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  placeholder="Field 3"
                  className={`mt-1 w-full ${selectCls}`}
                />
              </label>
            </div>
            <button
              type="button"
              disabled={pending}
              onClick={create}
              className="mt-3 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50"
            >
              {pending ? "Saving…" : "Schedule game"}
            </button>
          </div>
        )}
        {msg ? (
          <p
            className={`mt-3 text-sm ${
              msg.kind === "error" ? "text-amber-700 dark:text-amber-300" : "text-emerald-700 dark:text-emerald-300"
            }`}
          >
            {msg.text}
          </p>
        ) : null}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-foreground">
          Games{board.games.length > 0 ? ` (${board.games.length})` : ""}
        </h2>
        {board.games.length === 0 ? (
          <p className="rounded-2xl border border-border px-4 py-6 text-sm text-muted">
            No games scheduled yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {board.games.map((gm) => (
              <li key={gm.id} className="rounded-2xl border border-border bg-surface-raised p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="font-semibold text-foreground">
                      {gm.homeTeamName} <span className="text-muted">vs</span> {gm.awayTeamName}
                    </span>
                    {gm.status === "final" ? (
                      <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                        Final
                      </span>
                    ) : null}
                    <div className="mt-0.5 text-xs text-muted">
                      {fmtDateTime(gm.startsAt)}
                      {gm.location ? ` · ${gm.location}` : ""}
                      {gm.divisionName ? ` · ${gm.divisionName}` : ""}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => remove(gm.id)}
                    className="rounded-md px-1.5 text-xs text-muted hover:bg-foreground/5 hover:text-foreground disabled:opacity-40"
                    aria-label="Delete game"
                    title="Delete game"
                  >
                    ✕
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={scores[gm.id]?.home ?? ""}
                    onChange={(e) =>
                      setScores((s) => ({ ...s, [gm.id]: { ...s[gm.id], home: e.target.value } }))
                    }
                    className={`w-16 text-center ${selectCls}`}
                    aria-label={`${gm.homeTeamName} score`}
                  />
                  <span className="text-xs text-muted">—</span>
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={scores[gm.id]?.away ?? ""}
                    onChange={(e) =>
                      setScores((s) => ({ ...s, [gm.id]: { ...s[gm.id], away: e.target.value } }))
                    }
                    className={`w-16 text-center ${selectCls}`}
                    aria-label={`${gm.awayTeamName} score`}
                  />
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => saveScore(gm.id)}
                    className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-foreground/5 disabled:opacity-50"
                  >
                    {gm.status === "final" ? "Update score" : "Save score"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-foreground">Standings</h2>
        <StandingsTable standings={board.standings} />
      </section>
    </div>
  );
}
