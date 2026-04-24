"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, Lock } from "lucide-react";
import {
  listGameResultsForPlayAction,
  type PlayGameResultRow,
} from "@/app/actions/game-results";

type Props = {
  playbookId: string;
  playId: string;
  /** Coach+ entitlement. When false the card shows an upgrade CTA. */
  canUseGameMode: boolean;
};

export function PlayResultsCard({
  playbookId,
  playId,
  canUseGameMode,
}: Props) {
  if (!canUseGameMode) {
    return <LockedCard />;
  }
  return <UnlockedCard playbookId={playbookId} playId={playId} />;
}

function UnlockedCard({
  playbookId,
  playId,
}: {
  playbookId: string;
  playId: string;
}) {
  const [games, setGames] = useState<PlayGameResultRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setGames(null);
    setError(null);
    listGameResultsForPlayAction(playbookId, playId).then((res) => {
      if (cancelled) return;
      if (res.ok) setGames(res.games);
      else setError(res.error);
    });
    return () => {
      cancelled = true;
    };
  }, [playbookId, playId]);

  const totalCalls = games?.reduce((n, g) => n + g.callCount, 0) ?? 0;
  const totalUp = games?.reduce((n, g) => n + g.upCount, 0) ?? 0;
  const overallPct =
    totalCalls > 0 ? Math.round((totalUp / totalCalls) * 100) : null;

  return (
    <div className="flex max-h-[360px] min-h-0 flex-col rounded-xl border border-border bg-surface-inset/50">
      <div className="flex items-center justify-between gap-2 px-3 pt-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">
          Results
        </p>
        {overallPct != null && (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-primary">
            {overallPct}% · {totalCalls}
          </span>
        )}
      </div>

      <p className="px-3 pt-1 text-[11px] font-medium text-muted">
        Games where this play was called
      </p>

      <div className="mt-2 min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {error && (
          <p className="px-2 py-4 text-center text-xs text-muted">{error}</p>
        )}
        {!error && games == null && (
          <p className="px-2 py-4 text-center text-xs text-muted">Loading…</p>
        )}
        {!error && games != null && games.length === 0 && (
          <p className="px-2 py-4 text-center text-xs text-muted">
            Not called in any games yet.
          </p>
        )}
        {!error && games != null && games.length > 0 && (
          <ul className="space-y-0.5">
            {games.map((g) => (
              <GameRow
                key={g.sessionId}
                game={g}
                playbookId={playbookId}
                playId={playId}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function GameRow({
  game,
  playbookId,
  playId,
}: {
  game: PlayGameResultRow;
  playbookId: string;
  playId: string;
}) {
  const date = new Date(game.startedAt);
  const dateLabel = date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  const pct =
    game.callCount > 0 ? Math.round((game.upCount / game.callCount) * 100) : null;
  const score =
    game.scoreUs != null && game.scoreThem != null
      ? `${game.scoreUs}–${game.scoreThem}`
      : null;
  const title = game.opponent
    ? `vs ${game.opponent}`
    : game.kind === "scrimmage"
      ? "Scrimmage"
      : "Game";

  return (
    <li>
      <Link
        href={`/playbooks/${playbookId}/games/${game.sessionId}?play=${playId}`}
        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-surface-inset"
      >
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium text-foreground">{title}</div>
          <div className="truncate text-[11px] text-muted">
            {dateLabel}
            {score ? ` · ${score}` : ""}
            {" · "}
            {game.callCount} {game.callCount === 1 ? "call" : "calls"}
          </div>
        </div>
        <span className="shrink-0 font-mono tabular-nums text-[11px] text-muted">
          {pct != null ? `${pct}%` : "—"}
        </span>
        <ChevronRight className="size-3 shrink-0 text-muted" />
      </Link>
    </li>
  );
}

function LockedCard() {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="rounded-xl border border-border bg-surface-inset/50">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-3 text-left"
        aria-expanded={expanded}
      >
        <span className="flex items-center gap-1.5">
          <Lock className="size-3.5 text-muted" />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted">
            Results
          </span>
        </span>
        <ChevronDown
          className={`size-3.5 text-muted transition-transform ${
            expanded ? "rotate-180" : ""
          }`}
        />
      </button>
      {expanded && (
        <div className="border-t border-border px-3 py-3">
          <p className="text-xs text-muted">
            See how often this play was called and how well it worked across
            every game and scrimmage. Results are powered by Game Mode, which
            requires a Team Coach plan.
          </p>
          <Link
            href="/pricing?upgrade=game-mode"
            className="mt-3 inline-flex h-8 items-center justify-center rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Upgrade to Team Coach
          </Link>
        </div>
      )}
    </div>
  );
}
