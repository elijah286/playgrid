"use client";

import { useEffect, useMemo, useState } from "react";
import {
  listPlaybookActivityAction,
  listPlaybookVersionsAction,
  restorePlaybookVersionAction,
  type PlaybookVersionRow,
  type PlayVersionRow,
} from "@/app/actions/versions";
import { PlayVersionCompare } from "./PlayVersionCompare";
import { useToast } from "@/components/ui";

type Tab = "activity" | "structure";

type Props = {
  open: boolean;
  onClose: () => void;
  playbookId: string;
};

export function HistoryDrawer({ open, onClose, playbookId }: Props) {
  const [tab, setTab] = useState<Tab>("activity");
  const [activity, setActivity] = useState<PlayVersionRow[] | null>(null);
  const [structure, setStructure] = useState<PlaybookVersionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [compare, setCompare] = useState<{ row: PlayVersionRow; currentVersionId: string | null } | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setActivity(null);
    setStructure(null);
    void Promise.all([
      listPlaybookActivityAction(playbookId),
      listPlaybookVersionsAction(playbookId),
    ]).then(([a, s]) => {
      if (a.ok) setActivity(a.rows);
      else setError(a.error);
      if (s.ok) setStructure(s.rows);
    });
  }, [open, playbookId]);

  // For each play, find its current version id from the activity list (the
  // first row marked isCurrent for that playId).
  const currentVersionByPlay = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const row of activity ?? []) {
      if (row.isCurrent && !m.has(row.playId)) m.set(row.playId, row.id);
    }
    return m;
  }, [activity]);

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/40">
        <div className="absolute inset-0" onClick={onClose} aria-label="Close history" />
        <aside className="relative flex h-full w-full max-w-lg flex-col bg-card text-foreground shadow-xl">
          <header className="border-b border-border px-4 py-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">History</h2>
              <button
                type="button"
                onClick={onClose}
                className="rounded-md px-2 py-1 text-sm text-muted hover:bg-muted/10"
              >
                Close
              </button>
            </div>
            <p className="mt-0.5 text-xs text-muted">
              See who changed what. Click a play edit to compare and restore.
            </p>
            <nav className="mt-3 flex gap-2 text-sm">
              <TabButton active={tab === "activity"} onClick={() => setTab("activity")}>
                Play edits
              </TabButton>
              <TabButton active={tab === "structure"} onClick={() => setTab("structure")}>
                Playbook structure
              </TabButton>
            </nav>
          </header>
          <div className="flex-1 overflow-y-auto px-4 py-3">
            {error && <p className="text-sm text-destructive">{error}</p>}

            {tab === "activity" && (
              <ActivityList
                rows={activity}
                onCompare={(row) =>
                  setCompare({ row, currentVersionId: currentVersionByPlay.get(row.playId) ?? null })
                }
              />
            )}

            {tab === "structure" && (
              <StructureList
                rows={structure}
                playbookId={playbookId}
                onRestored={() => {
                  void listPlaybookVersionsAction(playbookId).then((res) => {
                    if (res.ok) setStructure(res.rows);
                  });
                }}
              />
            )}
          </div>
        </aside>
      </div>

      {compare && (
        <PlayVersionCompare
          open
          onClose={() => setCompare(null)}
          playId={compare.row.playId}
          target={compare.row}
          currentVersionId={compare.currentVersionId}
          onRestored={() => {
            // Refresh activity list so the new restore version shows.
            void listPlaybookActivityAction(playbookId).then((res) => {
              if (res.ok) setActivity(res.rows);
            });
          }}
        />
      )}
    </>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-2.5 py-1 text-sm font-medium ${
        active ? "bg-primary/10 text-primary" : "text-muted hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function ActivityList({
  rows,
  onCompare,
}: {
  rows: PlayVersionRow[] | null;
  onCompare: (row: PlayVersionRow) => void;
}) {
  if (rows === null) return <p className="text-sm text-muted">Loading…</p>;
  if (rows.length === 0) return <p className="text-sm text-muted">No edits yet.</p>;
  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <li
          key={row.id}
          className="rounded-md border border-border px-3 py-2"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="truncate text-sm font-medium">{row.playName}</span>
                <KindBadge kind={row.kind} />
                {row.isCurrent && (
                  <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                    Current
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-muted">
                {row.editorName ?? "Unknown editor"} · {fmt(row.createdAt)}
              </p>
              {row.diffSummary && (
                <p className="mt-1 text-xs text-foreground/80">{row.diffSummary}</p>
              )}
              {row.note && (
                <p className="mt-1 text-xs italic text-muted">“{row.note}”</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => onCompare(row)}
              className="shrink-0 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted/10"
            >
              Compare
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function StructureList({
  rows,
  playbookId,
  onRestored,
}: {
  rows: PlaybookVersionRow[] | null;
  playbookId: string;
  onRestored: () => void;
}) {
  const { toast } = useToast();
  const [restoringId, setRestoringId] = useState<string | null>(null);

  if (rows === null) return <p className="text-sm text-muted">Loading…</p>;
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted">
        No playbook structure changes yet. Snapshots are taken when you create,
        rename, reorder, or delete groups.
      </p>
    );
  }

  async function onRestore(row: PlaybookVersionRow) {
    if (restoringId) return;
    if (!confirm("Restore playbook structure to this snapshot? Folder names and ordering will be reset.")) return;
    setRestoringId(row.id);
    const res = await restorePlaybookVersionAction(playbookId, row.id);
    setRestoringId(null);
    if (!res.ok) {
      toast(res.error, "error");
      return;
    }
    toast("Playbook structure restored", "success");
    onRestored();
  }

  return (
    <ul className="space-y-2">
      {rows.map((row, i) => (
        <li key={row.id} className="rounded-md border border-border px-3 py-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <KindBadge kind={row.kind} />
                <span className="text-xs text-muted">
                  {row.editorName ?? "Unknown editor"} · {fmt(row.createdAt)}
                </span>
              </div>
              {row.diffSummary && (
                <p className="mt-1 text-sm text-foreground/90">{row.diffSummary}</p>
              )}
              {row.note && <p className="mt-1 text-xs italic text-muted">“{row.note}”</p>}
            </div>
            {i !== 0 && (
              <button
                type="button"
                onClick={() => onRestore(row)}
                disabled={restoringId !== null}
                className="shrink-0 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted/10 disabled:opacity-50"
              >
                {restoringId === row.id ? "Restoring…" : "Restore"}
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
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
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${m.cls}`}>
      {m.label}
    </span>
  );
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleString();
}
