"use client";

import { useEffect, useState, useTransition } from "react";
import { ChevronDown, ChevronRight, RefreshCw, Undo2 } from "lucide-react";
import { Button, useToast } from "@/components/ui";
import {
  listKbHistoryAction,
  revertKbRevisionAction,
  type KbRevisionRow,
} from "@/app/actions/coach-ai-kb-history";

const CHANGE_KIND_LABEL: Record<KbRevisionRow["change_kind"], string> = {
  create: "Created",
  edit: "Edited",
  verify: "Verified",
  retire: "Retired",
  restore: "Restored",
};

const CHANGE_KIND_TONE: Record<KbRevisionRow["change_kind"], string> = {
  create: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200",
  edit: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
  verify: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200",
  retire: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  restore: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function CoachAiKbHistoryClient() {
  const { toast } = useToast();
  const [items, setItems] = useState<KbRevisionRow[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [err, setErr] = useState<string | null>(null);
  const [loading, startLoad] = useTransition();
  const [reverting, startRevert] = useTransition();

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function load() {
    startLoad(async () => {
      const res = await listKbHistoryAction();
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      setErr(null);
      setItems(res.items);
    });
  }

  function revert(r: KbRevisionRow) {
    if (r.is_latest) {
      toast("This is already the latest revision.", "info");
      return;
    }
    if (!window.confirm(`Revert "${r.document_title}" to revision ${r.revision_number}? A new revision will be appended.`)) return;
    startRevert(async () => {
      const res = await revertKbRevisionAction(r.document_id, r.id);
      if (!res.ok) {
        toast(res.error, "error");
        return;
      }
      toast(`Reverted. New revision ${res.newRevisionNumber}.`, "success");
      load();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => load()} disabled={loading}>
          <RefreshCw className={`mr-1 size-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
        <span className="ml-auto text-xs text-muted">
          {items.length} recent revision{items.length === 1 ? "" : "s"}
        </span>
      </div>

      {err && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200 dark:bg-red-950/40 dark:text-red-200">
          {err}
        </p>
      )}

      {items.length === 0 && !loading ? (
        <p className="rounded-lg bg-surface-inset px-3 py-6 text-center text-sm text-muted">
          No KB writes yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((r) => {
            const open = !!expanded[r.id];
            return (
              <li key={r.id} className="rounded-xl bg-surface-raised p-3 ring-1 ring-black/5">
                <div className="flex items-start gap-2">
                  <button
                    type="button"
                    onClick={() => setExpanded((p) => ({ ...p, [r.id]: !open }))}
                    className="mt-0.5 text-muted hover:text-foreground"
                    aria-label={open ? "Collapse" : "Expand"}
                  >
                    {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className={`rounded px-2 py-0.5 font-semibold ${CHANGE_KIND_TONE[r.change_kind]}`}>
                        {CHANGE_KIND_LABEL[r.change_kind]}
                      </span>
                      <span className="text-muted">rev #{r.revision_number}</span>
                      {r.is_latest && (
                        <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-blue-800 dark:bg-blue-900/40 dark:text-blue-200">
                          Current
                        </span>
                      )}
                      {r.document_retired_at && (
                        <span className="rounded bg-zinc-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                          Retired doc
                        </span>
                      )}
                      <span className="ml-auto text-muted">{formatDate(r.created_at)}</span>
                    </div>
                    <p className="mt-1 truncate text-sm font-semibold text-foreground" title={r.title}>
                      {r.title}
                    </p>
                    <p className="text-xs text-muted">
                      {r.document_topic}
                      {r.document_subtopic ? ` · ${r.document_subtopic}` : ""}
                    </p>
                    {r.change_summary && (
                      <p className="mt-1 text-xs italic text-muted">{r.change_summary}</p>
                    )}
                    {open && (
                      <div className="mt-2 rounded-lg bg-surface-inset p-2">
                        <p className="whitespace-pre-wrap text-xs text-foreground/80">{r.content}</p>
                      </div>
                    )}
                  </div>
                  {!r.is_latest && (
                    <Button variant="ghost" size="sm" onClick={() => revert(r)} disabled={reverting}>
                      <Undo2 className="mr-1 size-3.5" />
                      Revert to this
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
