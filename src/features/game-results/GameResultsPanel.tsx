"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { listGameResultsAction, type GameResultRow } from "@/app/actions/game-results";

type KindFilter = "all" | "game" | "scrimmage";

export function GameResultsPanel({ playbookId }: { playbookId: string }) {
  const [games, setGames] = useState<GameResultRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");

  useEffect(() => {
    let cancelled = false;
    listGameResultsAction(playbookId).then((res) => {
      if (cancelled) return;
      if (res.ok) setGames(res.games);
      else setError(res.error);
    });
    return () => {
      cancelled = true;
    };
  }, [playbookId]);

  const filtered = useMemo(() => {
    if (!games) return null;
    if (kindFilter === "all") return games;
    return games.filter((g) => g.kind === kindFilter);
  }, [games, kindFilter]);

  if (error) {
    return (
      <p className="rounded-2xl border border-border bg-surface-raised p-4 text-sm text-muted">
        {error}
      </p>
    );
  }

  if (games == null) {
    return (
      <p className="rounded-2xl border border-border bg-surface-raised p-4 text-sm text-muted">
        Loading games…
      </p>
    );
  }

  if (games.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-surface-raised p-8 text-center">
        <p className="text-sm font-semibold text-foreground">No games yet</p>
        <p className="mt-1 text-sm text-muted">
          Run a game from Game Mode to see results here.
        </p>
        <Link
          href={`/playbooks/${playbookId}/game`}
          className="mt-4 inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Open Game Mode
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <KindToggle value={kindFilter} onChange={setKindFilter} />
      {filtered && filtered.length === 0 ? (
        <p className="rounded-2xl border border-border bg-surface-raised p-4 text-sm text-muted">
          No {kindFilter === "game" ? "games" : "scrimmages"} yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {(filtered ?? []).map((g) => (
            <GameRow key={g.id} playbookId={playbookId} game={g} />
          ))}
        </ul>
      )}
    </div>
  );
}

function KindToggle({
  value,
  onChange,
}: {
  value: KindFilter;
  onChange: (v: KindFilter) => void;
}) {
  const options: { value: KindFilter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "game", label: "Games" },
    { value: "scrimmage", label: "Scrimmages" },
  ];
  return (
    <div
      role="radiogroup"
      aria-label="Filter by kind"
      className="inline-flex overflow-hidden rounded-lg ring-1 ring-border"
    >
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={
              "px-3 py-1.5 text-xs font-medium transition-colors " +
              (active
                ? "bg-primary text-primary-foreground"
                : "bg-surface text-foreground hover:bg-surface-hover")
            }
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function GameRow({
  playbookId,
  game,
}: {
  playbookId: string;
  game: GameResultRow;
}) {
  const date = new Date(game.startedAt);
  const dateLabel = date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const successPct =
    game.callCount > 0 ? Math.round((game.upCount / game.callCount) * 100) : null;
  const score =
    game.scoreUs != null && game.scoreThem != null
      ? `${game.scoreUs}–${game.scoreThem}`
      : null;
  return (
    <li>
      <Link
        href={`/playbooks/${playbookId}/games/${game.id}`}
        className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface-raised p-4 hover:bg-surface-hover"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">
              {dateLabel}
            </span>
            <KindBadge kind={game.kind} />
          </div>
          <p className="mt-0.5 truncate text-sm text-muted">
            {game.opponent ? `vs ${game.opponent}` : "No opponent recorded"}
          </p>
        </div>
        <div className="flex items-center gap-6 text-sm">
          {score && (
            <div>
              <p className="text-xs text-muted">Score</p>
              <p className="font-semibold tabular-nums text-foreground">{score}</p>
            </div>
          )}
          <div>
            <p className="text-xs text-muted">Plays</p>
            <p className="font-semibold tabular-nums text-foreground">
              {game.callCount}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted">Success</p>
            <p className="font-semibold tabular-nums text-foreground">
              {successPct != null ? `${successPct}%` : "—"}
            </p>
          </div>
        </div>
      </Link>
    </li>
  );
}

function KindBadge({ kind }: { kind: "game" | "scrimmage" }) {
  const label = kind === "scrimmage" ? "Scrimmage" : "Game";
  const cls =
    kind === "scrimmage"
      ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
      : "bg-primary/10 text-primary";
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}
    >
      {label}
    </span>
  );
}
