"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import {
  listGameResultsAction,
  deleteGameSessionAction,
  type GameResultRow,
} from "@/app/actions/game-results";
import { useToast } from "@/components/ui";

type KindFilter = "all" | "game" | "scrimmage";

export function GameResultsPanel({ playbookId }: { playbookId: string }) {
  const [games, setGames] = useState<GameResultRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [pendingDelete, setPendingDelete] = useState<GameResultRow | null>(
    null,
  );
  const [deleting, startDelete] = useTransition();
  const { toast } = useToast();

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

  const confirmDelete = () => {
    if (!pendingDelete) return;
    const target = pendingDelete;
    startDelete(async () => {
      const res = await deleteGameSessionAction(playbookId, target.id);
      if (!res.ok) {
        toast(res.error, "error");
        return;
      }
      setGames((prev) =>
        prev ? prev.filter((g) => g.id !== target.id) : prev,
      );
      setPendingDelete(null);
      toast(
        target.kind === "scrimmage" ? "Scrimmage deleted." : "Game deleted.",
        "success",
      );
    });
  };

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
            <GameRow
              key={g.id}
              playbookId={playbookId}
              game={g}
              onDelete={() => setPendingDelete(g)}
            />
          ))}
        </ul>
      )}
      {pendingDelete && (
        <ConfirmDeleteDialog
          game={pendingDelete}
          busy={deleting}
          onCancel={() => setPendingDelete(null)}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}

function ConfirmDeleteDialog({
  game,
  busy,
  onCancel,
  onConfirm,
}: {
  game: GameResultRow;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const label = game.kind === "scrimmage" ? "scrimmage" : "game";
  const name = game.opponent ? `vs ${game.opponent}` : `this ${label}`;
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-border bg-surface-raised p-5 shadow-elevated"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-foreground">
          Delete {label}?
        </h2>
        <p className="mt-2 text-sm text-muted">
          {name} and all of its play history will be permanently removed. This
          cannot be undone.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="inline-flex h-9 items-center justify-center rounded-lg border border-border bg-surface px-3 text-sm font-semibold text-foreground hover:bg-surface-hover"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="inline-flex h-9 items-center justify-center rounded-lg bg-rose-600 px-3 text-sm font-semibold text-white hover:bg-rose-500 disabled:opacity-60"
          >
            {busy ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
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
  onDelete,
}: {
  playbookId: string;
  game: GameResultRow;
  onDelete: () => void;
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
    <li className="relative">
      <Link
        href={`/playbooks/${playbookId}/games/${game.id}`}
        className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface-raised p-4 pr-14 hover:bg-surface-hover"
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
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onDelete();
        }}
        aria-label={`Delete ${game.kind}`}
        className="absolute right-3 top-1/2 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-lg border border-border bg-surface text-muted hover:border-rose-500/50 hover:text-rose-600"
      >
        <Trash2 className="size-4" />
      </button>
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
