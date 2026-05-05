"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowDownUp, Gamepad2, Trash2 } from "lucide-react";
import {
  deleteGameSessionAction,
  deleteScheduledEventAction,
  listGamesAction,
  listLinkableSessionsAction,
  setSessionCalendarEventAction,
  updateGameOutcomeAction,
  updateScheduledEventAction,
  type GameRow as GameRowData,
} from "@/app/actions/game-results";
import { useToast } from "@/components/ui";
import { GameModeUpgradeDialog } from "@/features/game-mode/GameModeUpgradeDialog";

type KindFilter = "all" | "game" | "scrimmage";
type SortOrder = "newest" | "oldest";

export function GameResultsPanel({
  playbookId,
  canUseGameMode = false,
}: {
  playbookId: string;
  canUseGameMode?: boolean;
}) {
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [games, setGames] = useState<GameRowData[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");
  const [pendingDelete, setPendingDelete] = useState<GameRowData | null>(null);
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

  const filtered = useMemo(() => {
    if (!games) return null;
    if (kindFilter === "all") return games;
    return games.filter((g) => g.kind === kindFilter);
  }, [games, kindFilter]);

  // Group filtered rows by date (local timezone) so the date appears once
  // per day instead of being repeated on every card. Within a day, games
  // are sorted by time in the user's chosen order. Day order matches the
  // overall sort: "newest" puts most-recent days first.
  const groups = useMemo<{ key: string; label: string; rows: GameRowData[] }[] | null>(() => {
    if (!filtered) return null;
    const buckets = new Map<string, GameRowData[]>();
    for (const g of filtered) {
      const d = new Date(g.when);
      const key = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
      const arr = buckets.get(key) ?? [];
      arr.push(g);
      buckets.set(key, arr);
    }
    const dir = sortOrder === "newest" ? -1 : 1;
    const out: { key: string; label: string; rows: GameRowData[] }[] = [];
    for (const [key, rows] of buckets) {
      rows.sort((a, b) => dir * (new Date(a.when).getTime() - new Date(b.when).getTime()));
      const sample = new Date(rows[0]!.when);
      out.push({
        key,
        label: sample.toLocaleDateString(undefined, {
          weekday: "short",
          month: "short",
          day: "numeric",
          year: "numeric",
        }),
        rows,
      });
    }
    out.sort((a, b) => {
      const ta = new Date(a.rows[0]!.when).getTime();
      const tb = new Date(b.rows[0]!.when).getTime();
      return dir * (ta - tb);
    });
    return out;
  }, [filtered, sortOrder]);

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
    if (!canUseGameMode) {
      return (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Results</h2>
            <p className="text-sm text-muted">
              Review every called play, win-rate, and tag from your games.
            </p>
          </div>
          <div className="rounded-2xl border border-dashed border-border bg-surface-raised p-8 text-center">
            <div className="mx-auto mb-3 inline-flex size-10 items-center justify-center rounded-lg bg-brand-green text-white">
              <Gamepad2 className="size-5" />
            </div>
            <p className="text-sm font-semibold text-foreground">
              Results are a Team Coach feature
            </p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
              Run games from Game Mode and review every called play, win-rate,
              and tag here after the final whistle.
            </p>
            <button
              type="button"
              onClick={() => setUpgradeOpen(true)}
              className="mt-4 inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              See Team Coach plan
            </button>
          </div>
          <GameModeUpgradeDialog
            open={upgradeOpen}
            onClose={() => setUpgradeOpen(false)}
          />
        </div>
      );
    }
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
      <div className="flex flex-wrap items-center gap-2">
        <KindToggle value={kindFilter} onChange={setKindFilter} />
        <SortToggle value={sortOrder} onChange={setSortOrder} />
      </div>
      {filtered && filtered.length === 0 ? (
        <p className="rounded-2xl border border-border bg-surface-raised p-4 text-sm text-muted">
          No {kindFilter === "game" ? "games" : "scrimmages"} yet.
        </p>
      ) : (
        <div className="space-y-5">
          {(groups ?? []).map((group) => (
            <section key={group.key}>
              <h3 className="px-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
                {group.label}
              </h3>
              <ul className="overflow-hidden rounded-xl border border-border bg-surface-raised divide-y divide-border">
                {group.rows.map((g) => (
                  <GameListItem
                    key={g.rowId}
                    playbookId={playbookId}
                    game={g}
                    onEdit={() => setEditTarget(g)}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
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
          onDelete={() => {
            const target = editTarget;
            setEditTarget(null);
            setPendingDelete(target);
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
      className="fixed inset-0 z-[80] overflow-y-auto bg-black/60"
      onClick={onCancel}
    >
      <div className="flex min-h-full items-center justify-center p-4">
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

function SortToggle({
  value,
  onChange,
}: {
  value: SortOrder;
  onChange: (v: SortOrder) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(value === "newest" ? "oldest" : "newest")}
      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-foreground ring-1 ring-border hover:bg-surface-hover"
      title={`Sort: ${value === "newest" ? "Newest first" : "Oldest first"} — tap to flip`}
    >
      <ArrowDownUp className="size-3.5" aria-hidden="true" />
      {value === "newest" ? "Newest first" : "Oldest first"}
    </button>
  );
}

function GameListItem({
  playbookId,
  game,
  onEdit,
}: {
  playbookId: string;
  game: GameRowData;
  onEdit: () => void;
}) {
  const date = new Date(game.when);
  const timeLabel = date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  const isFuture = game.status === "scheduled" && date.getTime() > Date.now();
  const hasScore = game.scoreUs != null && game.scoreThem != null;
  const detailHref = game.sessionId
    ? `/playbooks/${playbookId}/games/${game.sessionId}`
    : null;

  // vs / @ — universal sports schedule shorthand for home / away. Falls
  // back to "vs" when the side isn't recorded.
  const oppPrefix = game.homeAway === "away" ? "@" : "vs";
  const opponent = game.opponent ?? "TBD";

  const rowCls =
    "flex items-stretch gap-3 px-3 py-2.5 transition-colors " +
    (isFuture ? "opacity-75 " : "") +
    "hover:bg-surface-hover";

  const inner = (
    <div className={rowCls}>
      {/* Time */}
      <div className="flex w-16 shrink-0 flex-col items-end justify-center text-right tabular-nums">
        <span className="text-xs font-semibold text-foreground">{timeLabel}</span>
        {game.kind === "scrimmage" && (
          <span className="text-[9px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
            Scrim
          </span>
        )}
      </div>

      {/* Opponent + meta */}
      <div className="min-w-0 flex-1 self-center">
        <p className="truncate text-sm font-semibold text-foreground">
          <span className="text-muted">{oppPrefix} </span>
          {opponent}
        </p>
        {game.locationName && (
          <p className="truncate text-[11px] text-muted">{game.locationName}</p>
        )}
      </div>

      {/* Right column: result or status */}
      <div className="flex shrink-0 items-center self-center">
        {hasScore ? (
          <ScoreChip us={game.scoreUs!} them={game.scoreThem!} />
        ) : (
          <StatusBadge
            status={game.status}
            isPast={date.getTime() <= Date.now()}
            hasScore={hasScore}
          />
        )}
      </div>
    </div>
  );

  // Sessions get a rich detail page; event-only rows (no session yet)
  // open the inline edit dialog instead — that's the only "more info"
  // surface we have for them, and it carries the delete affordance too.
  return (
    <li>
      {detailHref ? (
        <Link href={detailHref} className="block">
          {inner}
        </Link>
      ) : (
        <button
          type="button"
          onClick={onEdit}
          className="block w-full text-left"
          aria-label={`Edit ${game.kind} vs ${opponent}`}
        >
          {inner}
        </button>
      )}
    </li>
  );
}

function ScoreChip({ us, them }: { us: number; them: number }) {
  const { letter, cls } =
    us > them
      ? { letter: "W", cls: "text-emerald-700 dark:text-emerald-300 bg-emerald-500/15" }
      : us < them
        ? { letter: "L", cls: "text-rose-700 dark:text-rose-300 bg-rose-500/15" }
        : { letter: "T", cls: "text-amber-700 dark:text-amber-300 bg-amber-500/15" };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-bold tabular-nums ${cls}`}
      aria-label={`${us > them ? "Win" : us < them ? "Loss" : "Tie"} ${us}–${them}`}
    >
      <span>{letter}</span>
      <span>{us}–{them}</span>
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

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

// ISO timestamp → "YYYY-MM-DDTHH:mm" in the browser's local tz, for
// <input type="datetime-local">. Matches how the row label is rendered.
function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function fromDatetimeLocal(value: string): string {
  // The empty string would otherwise become "Invalid Date"; let the server reject.
  return new Date(value).toISOString();
}

function linkableLabel(s: {
  startedAt: string;
  opponent: string | null;
  scoreUs: number | null;
  scoreThem: number | null;
}): string {
  const d = new Date(s.startedAt);
  const date = d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  const time = d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  const score =
    s.scoreUs != null && s.scoreThem != null
      ? ` (${s.scoreUs}–${s.scoreThem})`
      : "";
  const opp = s.opponent ? ` vs ${s.opponent}` : "";
  return `${date} · ${time}${opp}${score}`;
}

type LinkableSession = {
  id: string;
  startedAt: string;
  opponent: string | null;
  scoreUs: number | null;
  scoreThem: number | null;
  status: "active" | "ended";
};

function EditGameDialog({
  playbookId,
  game,
  onClose,
  onDelete,
}: {
  playbookId: string;
  game: GameRowData;
  onClose: (saved: boolean) => void;
  onDelete: () => void;
}) {
  const [opponent, setOpponent] = useState(game.opponent ?? "");
  const [scoreUs, setScoreUs] = useState<string>(
    game.scoreUs == null ? "" : String(game.scoreUs),
  );
  const [scoreThem, setScoreThem] = useState<string>(
    game.scoreThem == null ? "" : String(game.scoreThem),
  );
  const [whenLocal, setWhenLocal] = useState<string>(() =>
    game.eventId ? toDatetimeLocal(game.when) : "",
  );
  const [locationName, setLocationName] = useState<string>(
    game.locationName ?? "",
  );
  const [linkSessionId, setLinkSessionId] = useState<string>("");
  const [linkable, setLinkable] = useState<LinkableSession[] | null>(null);
  const [pending, startTransition] = useTransition();
  const { toast } = useToast();

  const canLinkSession = !!game.eventId && !game.sessionId;

  useEffect(() => {
    if (!canLinkSession) return;
    listLinkableSessionsAction(playbookId, game.kind).then((res) => {
      if (res.ok) setLinkable(res.sessions);
    });
  }, [canLinkSession, playbookId, game.kind]);

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
      if (game.eventId) {
        const res = await updateScheduledEventAction(playbookId, game.eventId, {
          startsAt: fromDatetimeLocal(whenLocal),
          locationName: locationName.trim() || null,
        });
        if (!res.ok) {
          toast(res.error, "error");
          return;
        }
      }
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
      if (canLinkSession && linkSessionId) {
        const linkRes = await setSessionCalendarEventAction(
          playbookId,
          linkSessionId,
          game.eventId,
        );
        if (!linkRes.ok) {
          toast(linkRes.error, "error");
          return;
        }
      }
      toast("Saved.", "success");
      onClose(true);
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[80] overflow-y-auto bg-black/60"
      onClick={() => onClose(false)}
    >
      <div className="flex min-h-full items-center justify-center p-4">
      <div
        className="w-full max-w-sm rounded-2xl border border-border bg-surface-raised p-5 shadow-elevated"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-foreground">
          Edit {game.kind === "scrimmage" ? "scrimmage" : "game"}
        </h2>
        <div className="mt-4 space-y-3">
          {game.eventId && (
            <label className="block text-sm">
              <span className="text-xs font-medium uppercase tracking-wide text-muted">
                Date &amp; time
              </span>
              <input
                type="datetime-local"
                value={whenLocal}
                onChange={(e) => setWhenLocal(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
              />
            </label>
          )}
          {game.eventId && (
            <label className="block text-sm">
              <span className="text-xs font-medium uppercase tracking-wide text-muted">
                Location
              </span>
              <input
                type="text"
                value={locationName}
                onChange={(e) => setLocationName(e.target.value)}
                placeholder="e.g. John Gupton Stadium"
                className="mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
              />
            </label>
          )}
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
          {canLinkSession && (
            <label className="block text-sm">
              <span className="text-xs font-medium uppercase tracking-wide text-muted">
                Link to recorded {game.kind === "scrimmage" ? "scrimmage" : "game"}
              </span>
              <select
                value={linkSessionId}
                onChange={(e) => setLinkSessionId(e.target.value)}
                disabled={!linkable || linkable.length === 0}
                className="mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground disabled:opacity-60"
              >
                <option value="">
                  {linkable == null
                    ? "Loading…"
                    : linkable.length === 0
                      ? "No unlinked sessions"
                      : "— None —"}
                </option>
                {(linkable ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {linkableLabel(s)}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <div className="mt-5 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onDelete}
            disabled={pending}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-sm font-semibold text-rose-600 hover:bg-rose-500/10 dark:text-rose-300"
          >
            <Trash2 className="size-4" />
            Delete
          </button>
          <div className="flex gap-2">
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
      </div>
    </div>
  );
}
