"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useToast } from "@/components/ui";
import { PlayThumbnail, type PlayThumbnailInput, type ThumbnailHighlights } from "@/features/editor/PlayThumbnail";
import {
  getPlayVersionDocumentAction,
  restorePlayVersionAction,
  type PlayVersionRow,
} from "@/app/actions/versions";
import type { PlayDocument } from "@/domain/play/types";
import { diffPlayDocuments } from "@/lib/versions/play-element-diff";

type Props = {
  open: boolean;
  onClose: () => void;
  playId: string;
  /**
   * All versions of this play, newest-first. The compare dialog uses this list
   * to enable prev/next navigation between versions.
   */
  rows: PlayVersionRow[];
  /** Index into `rows` of the version the user clicked. */
  initialIndex: number;
  currentVersionId: string | null;
  onRestored?: () => void;
};

export function PlayVersionCompare({
  open,
  onClose,
  playId,
  rows,
  initialIndex,
  currentVersionId,
  onRestored,
}: Props) {
  const [index, setIndex] = useState(initialIndex);
  const [targetDoc, setTargetDoc] = useState<PlayDocument | null>(null);
  const [currentDoc, setCurrentDoc] = useState<PlayDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [restoring, setRestoring] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open) setIndex(initialIndex);
  }, [open, initialIndex]);

  const target = rows[index] ?? null;

  useEffect(() => {
    if (!open || !target) return;
    setError(null);
    setTargetDoc(null);
    setCurrentDoc(null);
    void Promise.all([
      getPlayVersionDocumentAction(target.id),
      currentVersionId
        ? getPlayVersionDocumentAction(currentVersionId)
        : Promise.resolve({ ok: false as const, error: "no current" }),
    ]).then(([t, c]) => {
      if (t.ok) setTargetDoc(t.document);
      else setError(t.error);
      if (c.ok) setCurrentDoc(c.document);
    });
  }, [open, target, currentVersionId]);

  const diff = useMemo(
    () => diffPlayDocuments(targetDoc, currentDoc),
    [targetDoc, currentDoc],
  );
  const hasChanges =
    diff.target.players.size +
      diff.target.routes.size +
      diff.target.zones.size +
      diff.current.players.size +
      diff.current.routes.size +
      diff.current.zones.size >
    0;

  if (!open || !target) return null;

  const isCurrent = target.id === currentVersionId;
  const canPrev = index < rows.length - 1; // older
  const canNext = index > 0; // newer

  function restore() {
    if (!target) return;
    setRestoring(true);
    startTransition(async () => {
      const res = await restorePlayVersionAction(playId, target.id);
      setRestoring(false);
      if (!res.ok) {
        toast(res.error, "error");
        return;
      }
      toast("Play restored to that version", "success");
      onRestored?.();
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-border bg-surface-raised text-foreground shadow-elevated">
        <header className="flex items-center justify-between gap-3 border-b border-border bg-surface-raised px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold">Compare versions</h2>
              <span className="rounded bg-surface-inset px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                {rows.length - index} of {rows.length}
              </span>
            </div>
            <p className="mt-0.5 truncate text-xs text-muted">
              {target.playName}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={!canPrev}
              onClick={() => canPrev && setIndex((i) => i + 1)}
              aria-label="Older version"
              title="Older version"
              className="rounded-md border border-border p-1.5 text-muted hover:bg-surface-inset hover:text-foreground disabled:opacity-30"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              disabled={!canNext}
              onClick={() => canNext && setIndex((i) => i - 1)}
              aria-label="Newer version"
              title="Newer version"
              className="rounded-md border border-border p-1.5 text-muted hover:bg-surface-inset hover:text-foreground disabled:opacity-30"
            >
              <ChevronRight className="size-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="ml-2 rounded-md px-2 py-1 text-sm text-muted hover:bg-surface-inset hover:text-foreground"
            >
              Close
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto bg-surface-raised px-4 py-4">
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Pane
              title="This version"
              subtitle={`${target.editorName ?? "Unknown editor"} · ${fmt(target.createdAt)}`}
              kindBadge={target.kind}
              isCurrentBadge={isCurrent}
              doc={targetDoc}
              highlights={diff.target}
            />
            <Pane
              title={isCurrent ? "Same as current" : "Current"}
              subtitle="Latest saved"
              isCurrentBadge
              doc={currentDoc}
              highlights={diff.current}
            />
          </div>

          {!isCurrent && hasChanges && (
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted">
              <LegendDot color="rgb(34,197,94)" label="Added in this version" />
              <LegendDot color="rgb(245,158,11)" label="Modified" />
              <LegendDot color="rgb(239,68,68)" label="Only in current" />
            </div>
          )}
          {!isCurrent && targetDoc && currentDoc && !hasChanges && (
            <p className="mt-3 rounded-md border border-border bg-surface-inset px-3 py-2 text-sm text-muted">
              No visual differences between this version and current. Metadata
              (name, notes) may still differ.
            </p>
          )}
          {isCurrent && (
            <p className="mt-3 rounded-md border border-border bg-surface-inset px-3 py-2 text-sm text-muted">
              This is the current version.
            </p>
          )}

          {target.note && (
            <div className="mt-4 rounded-md border border-border bg-surface-inset px-3 py-2 text-sm">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">Note</div>
              <p className="mt-0.5">{target.note}</p>
            </div>
          )}
          {target.diffSummary && (
            <div className="mt-3 rounded-md border border-border px-3 py-2 text-sm">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                What changed (vs prior version)
              </div>
              <p className="mt-0.5 whitespace-pre-wrap">{target.diffSummary}</p>
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between gap-2 border-t border-border bg-surface-raised px-4 py-3">
          <div className="text-xs text-muted">
            {target.editorName ?? "Unknown editor"} · {fmt(target.createdAt)}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface-inset"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isCurrent || restoring}
              onClick={restore}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
            >
              {restoring
                ? "Restoring…"
                : isCurrent
                  ? "This is the current version"
                  : "Restore this version"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block size-2.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  );
}

function Pane({
  title,
  subtitle,
  kindBadge,
  isCurrentBadge,
  doc,
  highlights,
}: {
  title: string;
  subtitle: string;
  kindBadge?: "create" | "edit" | "restore";
  isCurrentBadge?: boolean;
  doc: PlayDocument | null;
  highlights?: ThumbnailHighlights;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">
          {title}
        </span>
        {kindBadge && <KindBadge kind={kindBadge} />}
        {isCurrentBadge && (
          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-primary">
            Current
          </span>
        )}
      </div>
      <p className="mb-1 truncate text-[11px] text-muted">{subtitle}</p>
      <div className="aspect-[3/4] overflow-hidden rounded-md border border-border bg-surface-inset">
        {doc ? (
          <PlayThumbnail preview={toPreview(doc)} highlights={highlights} />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted">Loading…</div>
        )}
      </div>
    </div>
  );
}

function KindBadge({ kind }: { kind: "create" | "edit" | "restore" }) {
  const map = {
    create: { label: "Created", cls: "bg-success/10 text-success" },
    edit: { label: "Edit", cls: "bg-muted/20 text-muted" },
    restore: { label: "Restored", cls: "bg-accent/10 text-accent" },
  } as const;
  const m = map[kind];
  return (
    <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${m.cls}`}>
      {m.label}
    </span>
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

function fmt(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString();
}
