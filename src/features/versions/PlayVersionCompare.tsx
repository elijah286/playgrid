"use client";

import { useEffect, useState, useTransition } from "react";
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
  // The version the user clicked on. Compared against the current version.
  target: PlayVersionRow | null;
  currentVersionId: string | null;
  onRestored?: () => void;
};

export function PlayVersionCompare({
  open,
  onClose,
  playId,
  target,
  currentVersionId,
  onRestored,
}: Props) {
  const [targetDoc, setTargetDoc] = useState<PlayDocument | null>(null);
  const [currentDoc, setCurrentDoc] = useState<PlayDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [restoring, setRestoring] = useState(false);
  const { toast } = useToast();

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

  if (!open || !target) return null;

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

  const isCurrent = target.id === currentVersionId;
  const diff = diffPlayDocuments(targetDoc, currentDoc);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative flex max-h-[90vh] w-full max-w-4xl flex-col rounded-lg bg-card text-foreground shadow-xl">
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <h2 className="text-base font-semibold">Compare versions</h2>
            <p className="text-xs text-muted">
              {target.editorName ?? "Unknown editor"} · {fmt(target.createdAt)}
              {target.kind === "restore" ? " · (restored)" : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-muted hover:bg-muted/10"
          >
            Close
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Pane title="This version" doc={targetDoc} highlights={diff.target} />
            <Pane title={isCurrent ? "Current (same)" : "Current"} doc={currentDoc} highlights={diff.current} />
          </div>
          {!isCurrent && (
            <p className="mt-2 text-[11px] text-muted">
              <span className="inline-block size-2 rounded-full bg-success" /> Added in this version ·
              <span className="ml-2 inline-block size-2 rounded-full bg-warning" /> Modified ·
              <span className="ml-2 inline-block size-2 rounded-full bg-destructive" /> Only in current
            </p>
          )}

          {target.note && (
            <div className="mt-4 rounded-md border border-border bg-muted/5 px-3 py-2 text-sm">
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
        <footer className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted/10"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isCurrent || restoring}
            onClick={restore}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
          >
            {restoring ? "Restoring…" : isCurrent ? "This is the current version" : "Restore this version"}
          </button>
        </footer>
      </div>
    </div>
  );
}

function Pane({
  title,
  doc,
  highlights,
}: {
  title: string;
  doc: PlayDocument | null;
  highlights?: ThumbnailHighlights;
}) {
  return (
    <div>
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted">{title}</div>
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
