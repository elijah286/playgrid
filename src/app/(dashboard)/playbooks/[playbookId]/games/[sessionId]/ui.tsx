"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Film, Pencil, Trash2 } from "lucide-react";
import { PlayThumbnail, type PlayThumbnailInput } from "@/features/editor/PlayThumbnail";
import type { PlayDocument, Player, Route, Zone } from "@/domain/play/types";
import {
  updateGameSessionFinalsAction,
  deleteGameSessionAction,
} from "@/app/actions/game-results";
import { useToast } from "@/components/ui";
import { useRouter } from "next/navigation";

export type GameDetailData = {
  playbookId: string;
  session: {
    id: string;
    startedAt: string;
    endedAt: string | null;
    kind: "game" | "scrimmage";
    opponent: string | null;
    scoreUs: number | null;
    scoreThem: number | null;
    notes: string | null;
    filmUrl: string | null;
  };
  calls: Array<{
    id: string;
    playId: string;
    position: number;
    calledAt: string;
    thumb: "up" | "down" | null;
    tag: string | null;
    snapshot: Record<string, unknown>;
  }>;
  events: Array<{
    id: string;
    side: "us" | "them";
    delta: number;
    createdAt: string;
    createdBy: string | null;
    createdByName: string | null;
    playId: string | null;
  }>;
};

type View = "timeline" | "byPlay";

export function GameDetailClient({ data }: { data: GameDetailData }) {
  const [view, setView] = useState<View>("timeline");
  const { session: initialSession, calls, events, playbookId } = data;
  const [session, setSession] = useState(initialSession);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, startDelete] = useTransition();
  const { toast } = useToast();
  const router = useRouter();

  const searchParams = useSearchParams();
  const filterPlayId = searchParams?.get("play") ?? null;

  const filteredCalls = useMemo(
    () => (filterPlayId ? calls.filter((c) => c.playId === filterPlayId) : calls),
    [calls, filterPlayId],
  );
  const filteredEvents = useMemo(
    () =>
      filterPlayId
        ? events.filter((e) => e.playId === filterPlayId)
        : events,
    [events, filterPlayId],
  );

  const upCount = useMemo(
    () => filteredCalls.filter((c) => c.thumb === "up").length,
    [filteredCalls],
  );
  const successPct =
    filteredCalls.length > 0
      ? Math.round((upCount / filteredCalls.length) * 100)
      : null;
  const dateLabel = new Date(session.startedAt).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const filterLabel = useMemo(() => {
    if (!filterPlayId) return null;
    const match = calls.find((c) => c.playId === filterPlayId);
    const snap = match?.snapshot as { playName?: string } | undefined;
    return snap?.playName || "Selected play";
  }, [calls, filterPlayId]);

  return (
    <div className="mx-auto max-w-4xl space-y-6 py-6">
      <div className="flex items-center justify-between">
        <Link
          href={`/playbooks/${playbookId}?tab=games`}
          className="text-sm text-muted hover:text-foreground"
        >
          ← All games
        </Link>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setEditOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-foreground hover:bg-surface-hover"
          >
            <Pencil className="size-3.5" />
            Edit
          </button>
          <button
            type="button"
            onClick={() => setDeleteOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-muted hover:border-rose-500/50 hover:text-rose-600"
          >
            <Trash2 className="size-3.5" />
            Delete
          </button>
        </div>
      </div>

      <header className="rounded-2xl border border-border bg-surface-raised p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-xl font-semibold text-foreground">
                {session.opponent ? `vs ${session.opponent}` : "Untitled game"}
              </h1>
              <KindBadge kind={session.kind} />
            </div>
            <p className="mt-1 text-sm text-muted">{dateLabel}</p>
            {session.notes && (
              <p className="mt-2 text-sm text-foreground/80">{session.notes}</p>
            )}
            {session.filmUrl && (
              <a
                href={session.filmUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
              >
                <Film className="size-3.5" />
                Watch film
              </a>
            )}
          </div>
          <div className="flex items-center gap-6 text-sm">
            {session.scoreUs != null && session.scoreThem != null && (
              <Stat label="Score" value={`${session.scoreUs}–${session.scoreThem}`} />
            )}
            <Stat label="Plays" value={String(filteredCalls.length)} />
            <Stat
              label="Success"
              value={successPct != null ? `${successPct}%` : "—"}
            />
          </div>
        </div>
      </header>

      {filterPlayId && (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
          <span className="min-w-0 truncate text-foreground">
            Filtered by <span className="font-semibold">{filterLabel}</span>
          </span>
          <Link
            href={`/playbooks/${playbookId}/games/${session.id}`}
            className="text-xs font-medium text-primary hover:underline"
          >
            Clear filter
          </Link>
        </div>
      )}

      <ViewToggle value={view} onChange={setView} />

      {view === "timeline" ? (
        <TimelineView
          calls={filteredCalls}
          events={filteredEvents}
          highlightPlayId={filterPlayId}
        />
      ) : (
        <ByPlayView calls={filteredCalls} highlightPlayId={filterPlayId} />
      )}

      {editOpen && (
        <EditFinalsDialog
          session={session}
          playbookId={playbookId}
          onClose={() => setEditOpen(false)}
          onSaved={(patch) => {
            setSession((s) => ({ ...s, ...patch }));
            setEditOpen(false);
          }}
        />
      )}

      {deleteOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4"
          onClick={() => !deleting && setDeleteOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-border bg-surface-raised p-5 shadow-elevated"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-semibold text-foreground">
              Delete {session.kind === "scrimmage" ? "scrimmage" : "game"}?
            </h2>
            <p className="mt-2 text-sm text-muted">
              This game and all of its play history will be permanently
              removed. This cannot be undone.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteOpen(false)}
                disabled={deleting}
                className="inline-flex h-9 items-center justify-center rounded-lg border border-border bg-surface px-3 text-sm font-semibold text-foreground hover:bg-surface-hover"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  startDelete(async () => {
                    const res = await deleteGameSessionAction(
                      playbookId,
                      session.id,
                    );
                    if (!res.ok) {
                      toast(res.error, "error");
                      return;
                    }
                    router.push(`/playbooks/${playbookId}?tab=games`);
                  });
                }}
                disabled={deleting}
                className="inline-flex h-9 items-center justify-center rounded-lg bg-rose-600 px-3 text-sm font-semibold text-white hover:bg-rose-500 disabled:opacity-60"
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EditFinalsDialog({
  session,
  playbookId,
  onClose,
  onSaved,
}: {
  session: GameDetailData["session"];
  playbookId: string;
  onClose: () => void;
  onSaved: (patch: Partial<GameDetailData["session"]>) => void;
}) {
  const [opponent, setOpponent] = useState(session.opponent ?? "");
  const [scoreUs, setScoreUs] = useState(
    session.scoreUs == null ? "" : String(session.scoreUs),
  );
  const [scoreThem, setScoreThem] = useState(
    session.scoreThem == null ? "" : String(session.scoreThem),
  );
  const [filmUrl, setFilmUrl] = useState(session.filmUrl ?? "");
  const [saving, startSave] = useTransition();
  const { toast } = useToast();
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstRef.current?.focus();
  }, []);

  const save = () => {
    const parsedUs = scoreUs.trim() === "" ? null : Number(scoreUs);
    const parsedThem = scoreThem.trim() === "" ? null : Number(scoreThem);
    if (parsedUs != null && (!Number.isFinite(parsedUs) || parsedUs < 0)) {
      toast("Enter a valid us score.", "error");
      return;
    }
    if (parsedThem != null && (!Number.isFinite(parsedThem) || parsedThem < 0)) {
      toast("Enter a valid opponent score.", "error");
      return;
    }
    startSave(async () => {
      const res = await updateGameSessionFinalsAction(playbookId, session.id, {
        opponent: opponent,
        scoreUs: parsedUs,
        scoreThem: parsedThem,
        filmUrl: filmUrl,
      });
      if (!res.ok) {
        toast(res.error, "error");
        return;
      }
      onSaved({
        opponent: opponent.trim() || null,
        scoreUs: parsedUs == null ? null : Math.max(0, Math.trunc(parsedUs)),
        scoreThem:
          parsedThem == null ? null : Math.max(0, Math.trunc(parsedThem)),
        filmUrl: filmUrl.trim() || null,
      });
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-border bg-surface-raised p-5 shadow-elevated"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-foreground">
          Edit {session.kind === "scrimmage" ? "scrimmage" : "game"}
        </h2>
        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
              Opponent
            </span>
            <input
              ref={firstRef}
              type="text"
              value={opponent}
              onChange={(e) => setOpponent(e.target.value)}
              placeholder="Opponent name"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
                Us
              </span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={scoreUs}
                onChange={(e) => setScoreUs(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm font-mono tabular-nums text-foreground focus:border-primary focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
                Them
              </span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={scoreThem}
                onChange={(e) => setScoreThem(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm font-mono tabular-nums text-foreground focus:border-primary focus:outline-none"
              />
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
              Film link
            </span>
            <input
              type="url"
              inputMode="url"
              value={filmUrl}
              onChange={(e) => setFilmUrl(e.target.value)}
              placeholder="Hudl, YouTube, Vimeo, Drive…"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
            />
            <span className="mt-1 block text-xs text-muted">
              Paste any link to the game film. We don't host video.
            </span>
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="inline-flex h-9 items-center justify-center rounded-lg border border-border bg-surface px-3 text-sm font-semibold text-foreground hover:bg-surface-hover"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className="font-semibold tabular-nums text-foreground">{value}</p>
    </div>
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

function ViewToggle({
  value,
  onChange,
}: {
  value: View;
  onChange: (v: View) => void;
}) {
  const options: { value: View; label: string }[] = [
    { value: "timeline", label: "Timeline" },
    { value: "byPlay", label: "By Play" },
  ];
  return (
    <div
      role="radiogroup"
      aria-label="View"
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
              "px-3 py-1.5 text-sm font-medium transition-colors " +
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

// ---------------------------------------------------------------------------
// Timeline view
// ---------------------------------------------------------------------------

type TimelineItem =
  | { kind: "call"; at: string; call: GameDetailData["calls"][number] }
  | { kind: "event"; at: string; event: GameDetailData["events"][number] };

function TimelineView({
  calls,
  events,
  highlightPlayId,
}: {
  calls: GameDetailData["calls"];
  events: GameDetailData["events"];
  highlightPlayId?: string | null;
}) {
  const items = useMemo<TimelineItem[]>(() => {
    const merged: TimelineItem[] = [
      ...calls.map((c) => ({ kind: "call" as const, at: c.calledAt, call: c })),
      ...events.map((e) => ({ kind: "event" as const, at: e.createdAt, event: e })),
    ];
    merged.sort((a, b) => a.at.localeCompare(b.at));
    return merged;
  }, [calls, events]);

  if (items.length === 0) {
    return (
      <p className="rounded-2xl border border-border bg-surface-raised p-4 text-sm text-muted">
        No plays or score events recorded for this game.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {items.map((item) =>
        item.kind === "call" ? (
          <CallRow
            key={`c-${item.call.id}`}
            call={item.call}
            highlight={
              highlightPlayId != null && item.call.playId === highlightPlayId
            }
          />
        ) : (
          <ScoreEventRow key={`e-${item.event.id}`} event={item.event} />
        ),
      )}
    </ul>
  );
}

function CallRow({
  call,
  highlight,
}: {
  call: GameDetailData["calls"][number];
  highlight?: boolean;
}) {
  const snap = call.snapshot as {
    playName?: string;
    groupName?: string | null;
    play?: PlayDocument | null;
  };
  const preview = snapshotToPreview(snap.play ?? null);
  const timeLabel = new Date(call.calledAt).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  return (
    <li
      className={
        "flex gap-3 rounded-2xl border p-3 " +
        (highlight
          ? "border-primary bg-primary/10"
          : "border-border bg-surface-raised")
      }
    >
      <div className="w-14 shrink-0 text-xs text-muted">{timeLabel}</div>
      <div className="h-16 w-24 shrink-0 overflow-hidden rounded-lg bg-surface ring-1 ring-border">
        {preview ? <PlayThumbnail preview={preview} thin /> : null}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">
          {snap.playName || "Untitled play"}
        </p>
        {snap.groupName && (
          <p className="truncate text-xs text-muted">{snap.groupName}</p>
        )}
        <p className="mt-1 flex items-center gap-2 text-xs">
          <ThumbPill thumb={call.thumb} />
          {call.tag && <TagPill tag={call.tag} />}
        </p>
      </div>
    </li>
  );
}

function ThumbPill({ thumb }: { thumb: "up" | "down" | null }) {
  if (thumb == null) {
    return <span className="text-muted">Not scored</span>;
  }
  const up = thumb === "up";
  return (
    <span
      className={
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold " +
        (up
          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          : "bg-rose-500/10 text-rose-700 dark:text-rose-300")
      }
    >
      {up ? "👍 Good" : "👎 Bad"}
    </span>
  );
}

function TagPill({ tag }: { tag: string }) {
  const label = tag.replace(/_/g, " ");
  return (
    <span className="rounded-full bg-surface-inset px-2 py-0.5 text-muted">
      {label}
    </span>
  );
}

function ScoreEventRow({ event }: { event: GameDetailData["events"][number] }) {
  const sign = event.delta > 0 ? "+" : "";
  const timeLabel = new Date(event.createdAt).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  const sideLabel = event.side === "us" ? "us" : "them";
  const color =
    event.side === "us"
      ? "text-primary"
      : "text-rose-700 dark:text-rose-300";
  return (
    <li className="flex items-center gap-3 rounded-2xl border border-dashed border-border bg-surface p-3 text-sm">
      <div className="w-14 shrink-0 text-xs text-muted">{timeLabel}</div>
      <span className={`font-semibold tabular-nums ${color}`}>
        {sign}
        {event.delta} {sideLabel}
      </span>
      {event.createdByName && (
        <span className="text-xs text-muted">by {event.createdByName}</span>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// By-Play view
// ---------------------------------------------------------------------------

type PlayAgg = {
  playId: string;
  playName: string;
  groupName: string | null;
  preview: PlayThumbnailInput | null;
  calls: number;
  up: number;
};

function ByPlayView({
  calls,
  highlightPlayId,
}: {
  calls: GameDetailData["calls"];
  highlightPlayId?: string | null;
}) {
  const [sortBy, setSortBy] = useState<"calls" | "success">("calls");
  const groups = useMemo<PlayAgg[]>(() => {
    const byPlay = new Map<string, PlayAgg>();
    for (const c of calls) {
      const snap = c.snapshot as {
        playName?: string;
        groupName?: string | null;
        play?: PlayDocument | null;
      };
      const cur = byPlay.get(c.playId) ?? {
        playId: c.playId,
        playName: snap.playName || "Untitled play",
        groupName: snap.groupName ?? null,
        preview: snapshotToPreview(snap.play ?? null),
        calls: 0,
        up: 0,
      };
      cur.calls += 1;
      if (c.thumb === "up") cur.up += 1;
      byPlay.set(c.playId, cur);
    }
    const arr = Array.from(byPlay.values());
    if (sortBy === "success") {
      arr.sort((a, b) => rate(b) - rate(a) || b.calls - a.calls);
    } else {
      arr.sort((a, b) => b.calls - a.calls || rate(b) - rate(a));
    }
    return arr;
  }, [calls, sortBy]);

  if (groups.length === 0) {
    return (
      <p className="rounded-2xl border border-border bg-surface-raised p-4 text-sm text-muted">
        No plays were called in this game.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <SortToggle value={sortBy} onChange={setSortBy} />
      <ul className="space-y-2">
        {groups.map((g) => (
          <li
            key={g.playId}
            className={
              "flex gap-3 rounded-2xl border p-3 " +
              (highlightPlayId === g.playId
                ? "border-primary bg-primary/10"
                : "border-border bg-surface-raised")
            }
          >
            <div className="h-16 w-24 shrink-0 overflow-hidden rounded-lg bg-surface ring-1 ring-border">
              {g.preview ? <PlayThumbnail preview={g.preview} thin /> : null}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">
                {g.playName}
              </p>
              {g.groupName && (
                <p className="truncate text-xs text-muted">{g.groupName}</p>
              )}
            </div>
            <div className="flex items-center gap-6 text-sm">
              <Stat label="Calls" value={String(g.calls)} />
              <Stat label="Success" value={`${Math.round(rate(g) * 100)}%`} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function rate(a: PlayAgg): number {
  return a.calls > 0 ? a.up / a.calls : 0;
}

function SortToggle({
  value,
  onChange,
}: {
  value: "calls" | "success";
  onChange: (v: "calls" | "success") => void;
}) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-muted">Sort by</span>
      {(
        [
          { v: "calls" as const, l: "Most called" },
          { v: "success" as const, l: "Highest success" },
        ]
      ).map((opt) => {
        const active = value === opt.v;
        return (
          <button
            key={opt.v}
            type="button"
            onClick={() => onChange(opt.v)}
            className={
              "rounded-full px-2 py-0.5 font-medium transition-colors " +
              (active
                ? "bg-primary/10 text-primary"
                : "text-muted hover:text-foreground")
            }
          >
            {opt.l}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Snapshot → thumbnail
// ---------------------------------------------------------------------------

function snapshotToPreview(doc: PlayDocument | null): PlayThumbnailInput | null {
  if (!doc) return null;
  const players: Player[] = doc.layers?.players ?? [];
  const routes: Route[] = doc.layers?.routes ?? [];
  const zones: Zone[] = doc.layers?.zones ?? [];
  const los =
    typeof doc.lineOfScrimmageY === "number" ? doc.lineOfScrimmageY : 0.4;
  if (players.length === 0 && routes.length === 0) return null;
  return { players, routes, zones, lineOfScrimmageY: los };
}
