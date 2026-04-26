"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useToast } from "@/components/ui";
import {
  getPlaybookVersionDocumentAction,
  restorePlaybookVersionAction,
  type PlaybookVersionRow,
} from "@/app/actions/versions";
import {
  summarizePlaybookStructureDiff,
  type PlaybookSnapshotDoc,
} from "@/lib/versions/playbook-structure-diff";

type Props = {
  open: boolean;
  onClose: () => void;
  playbookId: string;
  rows: PlaybookVersionRow[];
  initialIndex: number;
  onRestored?: () => void;
};

export function PlaybookStructureCompare({
  open,
  onClose,
  playbookId,
  rows,
  initialIndex,
  onRestored,
}: Props) {
  const [index, setIndex] = useState(initialIndex);
  const [targetDoc, setTargetDoc] = useState<PlaybookSnapshotDoc | null>(null);
  const [currentDoc, setCurrentDoc] = useState<PlaybookSnapshotDoc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [restoring, setRestoring] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open) setIndex(initialIndex);
  }, [open, initialIndex]);

  const target = rows[index] ?? null;
  const current = rows[0] ?? null;
  const isCurrent = index === 0;

  useEffect(() => {
    if (!open || !target) return;
    setError(null);
    setTargetDoc(null);
    setCurrentDoc(null);
    void Promise.all([
      getPlaybookVersionDocumentAction(target.id),
      current && current.id !== target.id
        ? getPlaybookVersionDocumentAction(current.id)
        : Promise.resolve({ ok: true as const, document: null }),
    ]).then(([t, c]) => {
      if (t.ok) setTargetDoc(t.document);
      else setError(t.error);
      if (c.ok && c.document) setCurrentDoc(c.document);
    });
  }, [open, target, current]);

  // Diff: changes that would happen if you restored target (i.e. target → current
  // shows what's currently *different* from target). We display "what changed
  // since this version" — current vs target.
  const diffLines = useMemo(() => {
    if (!targetDoc) return [];
    if (isCurrent) return [];
    if (!currentDoc) return [];
    return summarizePlaybookStructureDiff(targetDoc, currentDoc);
  }, [targetDoc, currentDoc, isCurrent]);

  // Diff baked into the row itself (vs the version before it).
  const rowDiff = target?.diffSummary ?? null;

  if (!open || !target) return null;

  const canPrev = index < rows.length - 1;
  const canNext = index > 0;

  function restore() {
    if (!target || isCurrent) return;
    if (!confirm("Restore playbook structure to this snapshot? Folder names and ordering will be reset.")) return;
    setRestoring(true);
    startTransition(async () => {
      const res = await restorePlaybookVersionAction(playbookId, target.id);
      setRestoring(false);
      if (!res.ok) {
        toast(res.error, "error");
        return;
      }
      toast("Playbook structure restored", "success");
      onRestored?.();
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border bg-surface-raised text-foreground shadow-elevated">
        <header className="flex items-center justify-between gap-3 border-b border-border bg-surface-raised px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold">Compare structure</h2>
              <span className="rounded bg-surface-inset px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                {rows.length - index} of {rows.length}
              </span>
            </div>
            <p className="mt-0.5 truncate text-xs text-muted">
              {target.editorName ?? "Unknown editor"} · {fmt(target.createdAt)}
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

          {rowDiff && (
            <Section title="What changed in this version">
              <DiffList lines={rowDiff.split("\n").filter(Boolean)} />
            </Section>
          )}

          {!isCurrent && (
            <Section title="Differences vs current">
              {!targetDoc || !currentDoc ? (
                <p className="text-sm text-muted">Loading…</p>
              ) : diffLines.length === 0 ? (
                <p className="text-sm text-muted">
                  No structural differences between this version and current.
                </p>
              ) : (
                <DiffList lines={diffLines} />
              )}
            </Section>
          )}

          {isCurrent && (
            <p className="rounded-md border border-border bg-surface-inset px-3 py-2 text-sm text-muted">
              This is the current version.
            </p>
          )}

          {target.note && (
            <Section title="Note">
              <p className="text-sm italic text-muted">“{target.note}”</p>
            </Section>
          )}

          <Section title="Snapshot">
            {targetDoc ? (
              <SnapshotView doc={targetDoc} />
            ) : (
              <p className="text-sm text-muted">Loading…</p>
            )}
          </Section>
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
        {title}
      </div>
      {children}
    </div>
  );
}

function DiffList({ lines }: { lines: string[] }) {
  return (
    <ul className="space-y-1 rounded-md border border-border bg-surface-inset px-3 py-2 text-sm">
      {lines.map((line, i) => (
        <li key={i} className="text-foreground/90">
          {line}
        </li>
      ))}
    </ul>
  );
}

function SnapshotView({ doc }: { doc: PlaybookSnapshotDoc }) {
  const groupsSorted = [...doc.groups].sort((a, b) => a.sort_order - b.sort_order);
  const playsByGroup = new Map<string | null, typeof doc.plays>();
  for (const p of doc.plays) {
    const k = p.group_id ?? null;
    if (!playsByGroup.has(k)) playsByGroup.set(k, []);
    playsByGroup.get(k)!.push(p);
  }
  for (const arr of playsByGroup.values()) arr.sort((a, b) => a.sort_order - b.sort_order);

  const sections: { id: string | null; name: string; plays: typeof doc.plays }[] = [];
  for (const g of groupsSorted) {
    sections.push({ id: g.id, name: g.name, plays: playsByGroup.get(g.id) ?? [] });
  }
  const ungrouped = playsByGroup.get(null) ?? [];
  if (ungrouped.length > 0) {
    sections.push({ id: null, name: "Ungrouped", plays: ungrouped });
  }

  if (sections.length === 0) {
    return <p className="text-sm text-muted">Empty playbook.</p>;
  }

  return (
    <div className="space-y-2 rounded-md border border-border bg-surface-inset px-3 py-2 text-sm">
      {sections.map((s) => (
        <div key={s.id ?? "__ungrouped__"}>
          <div className="text-xs font-semibold text-foreground">{s.name || "(unnamed)"}</div>
          {s.plays.length === 0 ? (
            <div className="pl-3 text-xs text-muted">— no plays —</div>
          ) : (
            <ol className="pl-5 text-xs text-foreground/90">
              {s.plays.map((p, i) => (
                <li key={p.id} className="list-decimal">
                  <span className="text-muted">#{i + 1}</span> {p.name || "Untitled"}
                </li>
              ))}
            </ol>
          )}
        </div>
      ))}
    </div>
  );
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleString();
}
