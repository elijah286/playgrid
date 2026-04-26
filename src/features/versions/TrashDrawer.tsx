"use client";

import { useEffect, useState, useTransition } from "react";
import { useToast } from "@/components/ui";
import {
  listTrashAction,
  restoreGroupAction,
  restorePlayAction,
  type TrashItem,
} from "@/app/actions/trash";

type Props = {
  open: boolean;
  onClose: () => void;
  playbookId: string;
};

export function TrashDrawer({ open, onClose, playbookId }: Props) {
  const [items, setItems] = useState<TrashItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const { toast } = useToast();

  useEffect(() => {
    if (!open) return;
    setItems(null);
    setError(null);
    void listTrashAction(playbookId).then((res) => {
      if (res.ok) setItems(res.items);
      else setError(res.error);
    });
  }, [open, playbookId]);

  if (!open) return null;

  function restore(item: TrashItem) {
    setPendingId(item.id);
    startTransition(async () => {
      const res =
        item.kind === "play"
          ? await restorePlayAction(item.id)
          : await restoreGroupAction(item.id);
      setPendingId(null);
      if (!res.ok) {
        toast(res.error, "error");
        return;
      }
      toast(
        `Restored ${item.kind === "play" ? "play" : "group"} "${item.name}"`,
        "success",
      );
      setItems((prev) => (prev ? prev.filter((it) => it.id !== item.id) : prev));
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/40">
      <div
        className="absolute inset-0"
        onClick={onClose}
        aria-label="Close trash"
      />
      <aside className="relative flex h-full w-full max-w-md flex-col bg-card text-foreground shadow-xl">
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <h2 className="text-base font-semibold">Trash</h2>
            <p className="text-xs text-muted">
              Deleted plays and groups are kept for 30 days.
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
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {error && <p className="text-sm text-destructive">{error}</p>}
          {!error && items === null && (
            <p className="text-sm text-muted">Loading…</p>
          )}
          {items && items.length === 0 && (
            <p className="text-sm text-muted">Trash is empty.</p>
          )}
          {items && items.length > 0 && (
            <ul className="space-y-2">
              {items.map((item) => (
                <li
                  key={`${item.kind}-${item.id}`}
                  className="flex items-start justify-between gap-3 rounded-md border border-border px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-muted/20 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted">
                        {item.kind === "play" ? "Play" : "Group"}
                      </span>
                      <span className="truncate text-sm font-medium">{item.name}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted">
                      Deleted {relative(item.deletedAt)}
                      {item.kind === "play" && item.groupName
                        ? ` · was in "${item.groupName}"`
                        : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={pendingId === item.id}
                    onClick={() => restore(item)}
                    className="shrink-0 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted/10 disabled:opacity-50"
                  >
                    {pendingId === item.id ? "Restoring…" : "Restore"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}

function relative(iso: string): string {
  const then = new Date(iso).getTime();
  const diffMs = Date.now() - then;
  const day = 24 * 60 * 60 * 1000;
  if (diffMs < 60 * 1000) return "just now";
  if (diffMs < 60 * 60 * 1000) return `${Math.floor(diffMs / 60000)}m ago`;
  if (diffMs < day) return `${Math.floor(diffMs / (60 * 60 * 1000))}h ago`;
  if (diffMs < 30 * day) return `${Math.floor(diffMs / day)}d ago`;
  return new Date(iso).toLocaleDateString();
}
