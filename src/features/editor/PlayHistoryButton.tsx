"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { History } from "lucide-react";
import {
  listPlayVersionsAction,
  type PlayVersionRow,
} from "@/app/actions/versions";
import type { PlayDocument } from "@/domain/play/types";
import { PlayThumbnail, type PlayThumbnailInput } from "@/features/editor/PlayThumbnail";
import { PlayVersionCompare } from "@/features/versions/PlayVersionCompare";
import { Button } from "@/components/ui";

type Props = {
  playId: string;
  /** Hide the button label on small screens to save the same horizontal
   *  space as NotifyTeamButton does — keeps both icons-only on mobile. */
  hideMobileLabel?: boolean;
};

export function PlayHistoryButton({ playId, hideMobileLabel = false }: Props) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<PlayVersionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [compareIndex, setCompareIndex] = useState<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Compare dialog walks `historic` (everything except the current version
  // row) — clicking the current row's "Current" pill shouldn't open compare
  // since there's nothing to compare against.
  const historic = useMemo(
    () => (rows ?? []).filter((r) => !r.isCurrent),
    [rows],
  );
  const currentVersionId = useMemo(
    () => rows?.find((r) => r.isCurrent)?.id ?? null,
    [rows],
  );

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Lazy fetch on first open. Refetch every open so the list stays fresh
  // after recent edits land via autosave.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    listPlayVersionsAction(playId).then((res) => {
      if (cancelled) return;
      if (res.ok) setRows(res.rows);
      else setError(res.error);
    });
    return () => { cancelled = true; };
  }, [open, playId]);

  return (
    <div ref={rootRef} className="relative">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        leftIcon={History}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Play history"
      >
        <span className={hideMobileLabel ? "hidden sm:inline" : ""}>History</span>
      </Button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-[min(92vw,420px)] overflow-hidden rounded-xl border border-border bg-surface-raised shadow-elevated"
        >
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <h3 className="text-sm font-semibold text-foreground">History</h3>
            <span className="text-[11px] text-muted">
              {rows ? `${rows.length} ${rows.length === 1 ? "entry" : "entries"}` : ""}
            </span>
          </div>
          <div className="max-h-[min(70vh,520px)] overflow-y-auto">
            {error && (
              <p className="px-3 py-3 text-xs text-danger">{error}</p>
            )}
            {!error && rows === null && (
              <p className="px-3 py-3 text-xs text-muted">Loading…</p>
            )}
            {!error && rows && rows.length === 0 && (
              <p className="px-3 py-6 text-center text-xs text-muted">
                No history yet for this play.
              </p>
            )}
            {!error && rows && rows.length > 0 && (
              <ul className="divide-y divide-border">
                {rows.map((row) => {
                  const historicIdx = historic.findIndex((r) => r.id === row.id);
                  const clickable = !row.isCurrent && historicIdx >= 0;
                  const inner = (
                    <>
                      <div className="h-14 w-11 shrink-0 overflow-hidden rounded-md border border-border bg-surface-inset">
                        {row.document ? (
                          <PlayThumbnail preview={toPreview(row.document)} thin />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-[10px] text-muted">
                            —
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <KindBadge kind={row.kind} />
                          {row.isCurrent && (
                            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                              Current
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-foreground">
                          {row.diffSummary || describeFallback(row.kind)}
                        </p>
                        <p className="mt-0.5 text-[11px] text-muted">
                          {row.editorName ?? "Unknown editor"} · {fmt(row.createdAt)}
                        </p>
                        {row.note && (
                          <p className="mt-1 text-[11px] italic text-muted">
                            “{row.note}”
                          </p>
                        )}
                      </div>
                      {clickable && (
                        <span className="self-center rounded-md border border-border px-2 py-1 text-[11px] font-medium text-muted">
                          Compare
                        </span>
                      )}
                    </>
                  );
                  return (
                    <li key={row.id}>
                      {clickable ? (
                        <button
                          type="button"
                          onClick={() => setCompareIndex(historicIdx)}
                          className="flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-surface-inset"
                          aria-label={`Compare ${describeFallback(row.kind)} from ${fmt(row.createdAt)}`}
                        >
                          {inner}
                        </button>
                      ) : (
                        <div className="flex items-start gap-3 px-3 py-2.5">{inner}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
      {compareIndex !== null && rows && (
        <PlayVersionCompare
          open
          onClose={() => setCompareIndex(null)}
          playId={playId}
          rows={historic}
          initialIndex={compareIndex}
          currentVersionId={currentVersionId}
          onRestored={() => {
            // Refresh the list so the dropdown reflects the new "current"
            // entry, and refresh the route so the editor canvas picks up
            // the restored document via its initialDocument prop.
            void listPlayVersionsAction(playId).then((res) => {
              if (res.ok) setRows(res.rows);
            });
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function toPreview(doc: PlayDocument): PlayThumbnailInput {
  return {
    players: doc.layers?.players ?? [],
    routes: doc.layers?.routes ?? [],
    zones: doc.layers?.zones ?? [],
    lineOfScrimmageY: typeof doc.lineOfScrimmageY === "number" ? doc.lineOfScrimmageY : 0.4,
  };
}

function describeFallback(kind: "create" | "edit" | "restore"): string {
  if (kind === "create") return "Created";
  if (kind === "restore") return "Restored to an earlier version";
  return "Edited (no detailed diff)";
}

function KindBadge({ kind }: { kind: "create" | "edit" | "restore" }) {
  const map = {
    create: { label: "Created", cls: "bg-success/10 text-success" },
    edit: { label: "Edit", cls: "bg-muted/20 text-muted" },
    restore: { label: "Restored", cls: "bg-accent/10 text-accent" },
  } as const;
  const m = map[kind];
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${m.cls}`}>
      {m.label}
    </span>
  );
}

function fmt(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diff = now - d.getTime();
  if (diff < 60_000) return "just now";
  if (diff < 60 * 60_000) return `${Math.round(diff / 60_000)}m ago`;
  if (diff < 24 * 60 * 60_000) return `${Math.round(diff / (60 * 60_000))}h ago`;
  if (diff < 7 * 24 * 60 * 60_000) return `${Math.round(diff / (24 * 60 * 60_000))}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
