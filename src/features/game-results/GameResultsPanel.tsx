"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { CalendarPlus, Link2, Link2Off, Pencil, Trash2 } from "lucide-react";
import {
  deleteGameSessionAction,
  deleteScheduledEventAction,
  listGamesAction,
  listSchedulableEventsAction,
  setSessionCalendarEventAction,
  updateGameOutcomeAction,
  type GameRow as GameRowData,
} from "@/app/actions/game-results";
import { useToast } from "@/components/ui";

type KindFilter = "all" | "game" | "scrimmage";

type ScheduledOption = {
  id: string;
  startsAt: string;
  opponent: string | null;
  homeAway: "home" | "away" | "neutral" | null;
  locationName: string | null;
};

export function GameResultsPanel({ playbookId }: { playbookId: string }) {
  const [games, setGames] = useState<GameRowData[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [pendingDelete, setPendingDelete] = useState<GameRowData | null>(null);
  const [linkTarget, setLinkTarget] = useState<GameRowData | null>(null);
  const [editTarget, setEditTarget] = useState<GameRowData | null>(null);
  const [deleting, startDelete] = useTransition();
  const { toast } = useToast();

  function refresh() {
    listGamesAction(playbookId).then((res) => {
      if (res.ok) setGames(res.games);
      else setError(res.error);
    });
  }

  useEffect(() => {
    let cancelled = false;
    listGamesAction(playbookId).then((res) => {
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
      const res = target.sessionId
        ? await deleteGameSessionAction(playbookId, target.sessionId)
        : target.eventId
          ? await deleteScheduledEventAction(playbookId, target.eventId)
          : { ok: false as const, error: "Nothing to delete." };
      if (!res.ok) {
        toast(res.error, "error");
        return;
      }
      setPendingDelete(null);
      toast(
        target.kind === "scrimmage" ? "Scrimmage deleted." : "Game deleted.",
        "success",
      );
      refresh();
    });
  };

  async function handleUnlink(row: GameRowData) {
    if (!row.sessionId) return;
    const res = await setSessionCalendarEventAction(
      playbookId,
      row.sessionId,
      null,
    );
    if (!res.ok) {
      toast(res.error, "error");
      return;
    }
    toast("Unlinked from schedule.", "success");
    refresh();
  }

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
          Schedule a game from the Calendar tab, or run one from Game Mode to
          see it here.
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
            <GameListItem
              key={g.rowId}
              playbookId={playbookId}
              game={g}
              onEdit={() => setEditTarget(g)}
              onDelete={() => setPendingDelete(g)}
              onLink={() => setLinkTarget(g)}
              onUnlink={() => handleUnlink(g)}
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
      {editTarget && (
        <EditGameDialog
          playbookId={playbookId}
          game={editTarget}
          onClose={(saved) => {
            setEditTarget(null);
            if (saved) refresh();
          }}
        />
      )}
      {linkTarget && linkTarget.sessionId && (
        <LinkScheduledDialog
          playbookId={playbookId}
          sessionId={linkTarget.sessionId}
          kind={linkTarget.kind}
          onClose={(linked) => {
            setLinkTarget(null);
            if (linked) refresh();
          }}
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
  game: GameRowData;
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

function LinkScheduledDialog({
  playbookId,
  sessionId,
  kind,
  onClose,
}: {
  playbookId: string;
  sessionId: string;
  kind: "game" | "scrimmage";
  onClose: (linked: boolean) => void;
}) {
  const [options, setOptions] = useState<ScheduledOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { toast } = useToast();

  useEffect(() => {
    listSchedulableEventsAction(playbookId, kind).then((res) => {
      if (res.ok) setOptions(res.events);
      else setError(res.error);
    });
  }, [playbookId, kind]);

  function pick(eventId: string) {
    startTransition(async () => {
      const res = await setSessionCalendarEventAction(
        playbookId,
        sessionId,
        eventId,
      );
      if (!res.ok) {
        toast(res.error, "error");
        return;
      }
      toast("Linked to schedule.", "success");
      onClose(true);
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4"
      onClick={() => onClose(false)}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-border bg-surface-raised p-5 shadow-elevated"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-foreground">
          Link to scheduled {kind}
        </h2>
        <p className="mt-1 text-sm text-muted">
          Pick an event from the calendar to attach this session to.
        </p>
        {error && (
          <p className="mt-3 rounded-lg bg-rose-500/10 p-2 text-sm text-rose-700">
            {error}
          </p>
        )}
        {options == null && !error && (
          <p className="mt-4 text-sm text-muted">Loading…</p>
        )}
        {options && options.length === 0 && (
          <p className="mt-4 rounded-lg border border-dashed border-border p-4 text-sm text-muted">
            No unlinked {kind === "scrimmage" ? "scrimmages" : "games"} on the
            schedule.
          </p>
        )}
        {options && options.length > 0 && (
          <ul className="mt-4 max-h-80 space-y-2 overflow-y-auto">
            {options.map((o) => {
              const date = new Date(o.startsAt);
              const dateLabel = date.toLocaleDateString(undefined, {
                weekday: "short",
                month: "short",
                day: "numeric",
                year: "numeric",
              });
              const timeLabel = date.toLocaleTimeString(undefined, {
                hour: "numeric",
                minute: "2-digit",
              });
              return (
                <li key={o.id}>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => pick(o.id)}
                    className="flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-surface p-3 text-left hover:bg-surface-hover disabled:opacity-60"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">
                        {dateLabel} · {timeLabel}
                      </p>
                      <p className="truncate text-xs text-muted">
                        {[
                          o.opponent ? `vs ${o.opponent}` : null,
                          o.homeAway ? capitalize(o.homeAway) : null,
                          o.locationName,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "No details"}
                      </p>
                    </div>
                    <Link2 className="size-4 shrink-0 text-muted" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={() => onClose(false)}
            disabled={pending}
            className="inline-flex h-9 items-center justify-center rounded-lg border border-border bg-surface px-3 text-sm font-semibold text-foreground hover:bg-surface-hover"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
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

function GameListItem({
  playbookId,
  game,
  onEdit,
  onDelete,
  onLink,
  onUnlink,
}: {
  playbookId: string;
  game: GameRowData;
  onEdit: () => void;
  onDelete: () => void;
  onLink: () => void;
  onUnlink: () => void;
}) {
  const date = new Date(game.when);
  const dateLabel = date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const timeLabel = date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  const isFuture = game.status === "scheduled" && date.getTime() > Date.now();
  const successPct =
    game.callCount > 0 ? Math.round((game.upCount / game.callCount) * 100) : null;
  const score =
    game.scoreUs != null && game.scoreThem != null
      ? `${game.scoreUs}–${game.scoreThem}`
      : null;
  const detailHref = game.sessionId
    ? `/playbooks/${playbookId}/games/${game.sessionId}`
    : null;
  const subtitleParts: string[] = [];
  if (game.opponent) subtitleParts.push(`vs ${game.opponent}`);
  if (game.homeAway) subtitleParts.push(capitalize(game.homeAway));
  if (game.locationName) subtitleParts.push(game.locationName);
  const subtitle = subtitleParts.join(" · ") || "No opponent recorded";

  const card = (
    <div
      className={
        "flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4 pr-40 transition-colors " +
        (isFuture
          ? "border-dashed border-border bg-surface-raised/60 opacity-70"
          : detailHref
            ? "border-border bg-surface-raised hover:bg-surface-hover"
            : "border-border bg-surface-raised")
      }
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-foreground">
            {dateLabel} · {timeLabel}
          </span>
          <KindBadge kind={game.kind} />
          <StatusBadge
            status={game.status}
            isPast={date.getTime() <= Date.now()}
            hasScore={game.scoreUs != null && game.scoreThem != null}
          />
        </div>
        <p className="mt-0.5 truncate text-sm text-muted">{subtitle}</p>
      </div>
      <div className="flex items-center gap-6 text-sm">
        {score && (
          <div>
            <p className="text-xs text-muted">Score</p>
            <p className="flex items-center gap-1.5 font-semibold tabular-nums text-foreground">
              <ResultBadge us={game.scoreUs!} them={game.scoreThem!} />
              {score}
            </p>
          </div>
        )}
        {game.sessionId && (
          <>
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
          </>
        )}
      </div>
    </div>
  );

  return (
    <li className="relative">
      {detailHref ? (
        <Link href={detailHref} className="block">
          {card}
        </Link>
      ) : (
        card
      )}
      <div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-1">
        {game.sessionId && game.eventId && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onUnlink();
            }}
            aria-label="Unlink from schedule"
            title="Unlink from schedule"
            className="inline-flex size-9 items-center justify-center rounded-lg border border-border bg-surface text-muted hover:text-foreground"
          >
            <Link2Off className="size-4" />
          </button>
        )}
        {game.sessionId && !game.eventId && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onLink();
            }}
            aria-label="Link to scheduled game"
            title="Link to scheduled game"
            className="inline-flex size-9 items-center justify-center rounded-lg border border-border bg-surface text-muted hover:text-foreground"
          >
            <CalendarPlus className="size-4" />
          </button>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onEdit();
          }}
          aria-label={`Edit ${game.kind}`}
          title="Edit opponent and score"
          className="inline-flex size-9 items-center justify-center rounded-lg border border-border bg-surface text-muted hover:text-foreground"
        >
          <Pencil className="size-4" />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDelete();
          }}
          aria-label={`Delete ${game.kind}`}
          className="inline-flex size-9 items-center justify-center rounded-lg border border-border bg-surface text-muted hover:border-rose-500/50 hover:text-rose-600"
        >
          <Trash2 className="size-4" />
        </button>
      </div>
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

function ResultBadge({ us, them }: { us: number; them: number }) {
  const { letter, cls } =
    us > them
      ? { letter: "W", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" }
      : us < them
        ? { letter: "L", cls: "bg-rose-500/15 text-rose-700 dark:text-rose-300" }
        : { letter: "T", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300" };
  return (
    <span
      className={`inline-flex size-5 items-center justify-center rounded-full text-[10px] font-bold ${cls}`}
      aria-label={us > them ? "Win" : us < them ? "Loss" : "Tie"}
    >
      {letter}
    </span>
  );
}

function StatusBadge({
  status,
  isPast,
  hasScore,
}: {
  status: "scheduled" | "active" | "ended";
  isPast: boolean;
  hasScore: boolean;
}) {
  if (status === "active") {
    return (
      <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
        Live
      </span>
    );
  }
  if (status === "ended") return null;
  // scheduled: future → "Scheduled"; past with no session → "Final" if a
  // score was entered, otherwise "Complete".
  if (!isPast) {
    return (
      <span className="rounded-full bg-slate-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-300">
        Scheduled
      </span>
    );
  }
  return (
    <span className="rounded-full bg-slate-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-300">
      {hasScore ? "Final" : "Complete"}
    </span>
  );
}

function EditGameDialog({
  playbookId,
  game,
  onClose,
}: {
  playbookId: string;
  game: GameRowData;
  onClose: (saved: boolean) => void;
}) {
  const [opponent, setOpponent] = useState(game.opponent ?? "");
  const [scoreUs, setScoreUs] = useState<string>(
    game.scoreUs == null ? "" : String(game.scoreUs),
  );
  const [scoreThem, setScoreThem] = useState<string>(
    game.scoreThem == null ? "" : String(game.scoreThem),
  );
  const [pending, startTransition] = useTransition();
  const { toast } = useToast();

  function save() {
    const us = scoreUs.trim() === "" ? null : Number(scoreUs);
    const them = scoreThem.trim() === "" ? null : Number(scoreThem);
    if (us != null && !Number.isFinite(us)) {
      toast("Our score must be a number.", "error");
      return;
    }
    if (them != null && !Number.isFinite(them)) {
      toast("Opponent score must be a number.", "error");
      return;
    }
    startTransition(async () => {
      const res = await updateGameOutcomeAction(playbookId, {
        sessionId: game.sessionId,
        eventId: game.eventId,
        opponent: opponent.trim() || null,
        scoreUs: us,
        scoreThem: them,
      });
      if (!res.ok) {
        toast(res.error, "error");
        return;
      }
      toast("Saved.", "success");
      onClose(true);
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4"
      onClick={() => onClose(false)}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-border bg-surface-raised p-5 shadow-elevated"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-foreground">
          Edit {game.kind === "scrimmage" ? "scrimmage" : "game"}
        </h2>
        <div className="mt-4 space-y-3">
          <label className="block text-sm">
            <span className="text-xs font-medium uppercase tracking-wide text-muted">
              Opponent
            </span>
            <input
              type="text"
              value={opponent}
              onChange={(e) => setOpponent(e.target.value)}
              placeholder="e.g. Lincoln High"
              className="mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="text-xs font-medium uppercase tracking-wide text-muted">
                Us
              </span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={scoreUs}
                onChange={(e) => setScoreUs(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm tabular-nums text-foreground"
              />
            </label>
            <label className="block text-sm">
              <span className="text-xs font-medium uppercase tracking-wide text-muted">
                Them
              </span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={scoreThem}
                onChange={(e) => setScoreThem(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm tabular-nums text-foreground"
              />
            </label>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => onClose(false)}
            disabled={pending}
            className="inline-flex h-9 items-center justify-center rounded-lg border border-border bg-surface px-3 text-sm font-semibold text-foreground hover:bg-surface-hover"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
