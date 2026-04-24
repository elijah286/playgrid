"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { PlayThumbnail, type PlayThumbnailInput } from "@/features/editor/PlayThumbnail";
import type { PlayDocument, Player, Route, Zone } from "@/domain/play/types";

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
  const { session, calls, events, playbookId } = data;

  const upCount = useMemo(
    () => calls.filter((c) => c.thumb === "up").length,
    [calls],
  );
  const successPct =
    calls.length > 0 ? Math.round((upCount / calls.length) * 100) : null;
  const dateLabel = new Date(session.startedAt).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6 py-6">
      <div>
        <Link
          href={`/playbooks/${playbookId}?tab=games`}
          className="text-sm text-muted hover:text-foreground"
        >
          ← All games
        </Link>
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
          </div>
          <div className="flex items-center gap-6 text-sm">
            {session.scoreUs != null && session.scoreThem != null && (
              <Stat label="Score" value={`${session.scoreUs}–${session.scoreThem}`} />
            )}
            <Stat label="Plays" value={String(calls.length)} />
            <Stat
              label="Success"
              value={successPct != null ? `${successPct}%` : "—"}
            />
          </div>
        </div>
      </header>

      <ViewToggle value={view} onChange={setView} />

      {view === "timeline" ? (
        <TimelineView calls={calls} events={events} />
      ) : (
        <ByPlayView calls={calls} />
      )}
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
}: {
  calls: GameDetailData["calls"];
  events: GameDetailData["events"];
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
          <CallRow key={`c-${item.call.id}`} call={item.call} />
        ) : (
          <ScoreEventRow key={`e-${item.event.id}`} event={item.event} />
        ),
      )}
    </ul>
  );
}

function CallRow({ call }: { call: GameDetailData["calls"][number] }) {
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
    <li className="flex gap-3 rounded-2xl border border-border bg-surface-raised p-3">
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

function ByPlayView({ calls }: { calls: GameDetailData["calls"] }) {
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
            className="flex gap-3 rounded-2xl border border-border bg-surface-raised p-3"
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
