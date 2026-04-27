"use client";

import { useState, useTransition } from "react";
import { Check, RefreshCw, Trash2 } from "lucide-react";
import { Button, IconButton, useToast } from "@/components/ui";
import {
  deleteKbMissAction,
  listCoachAiKbMissesAction,
  setKbMissReviewedAction,
  type KbMissRow,
} from "@/app/actions/coach-ai-feedback";

const REASON_LABEL: Record<string, string> = {
  no_results: "No KB results",
  weak_results: "Weak KB results",
  irrelevant_results: "Irrelevant KB results",
  concept_not_seeded: "Concept not seeded",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function CoachAiFeedbackAdminClient({
  initialItems,
  initialError,
}: {
  initialItems: KbMissRow[];
  initialError: string | null;
}) {
  const { toast } = useToast();
  const [items, setItems] = useState(initialItems);
  const [err, setErr] = useState<string | null>(initialError);
  const [filter, setFilter] = useState<"unreviewed" | "all">("unreviewed");
  const [pending, startTransition] = useTransition();

  function refresh(nextFilter: "unreviewed" | "all" = filter) {
    startTransition(async () => {
      const res = await listCoachAiKbMissesAction(nextFilter);
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      setErr(null);
      setItems(res.items);
    });
  }

  function changeFilter(f: "unreviewed" | "all") {
    setFilter(f);
    refresh(f);
  }

  function markReviewed(id: string, reviewed: boolean) {
    const prev = items;
    setItems(items.map((it) => (it.id === id ? { ...it, reviewed_at: reviewed ? new Date().toISOString() : null } : it)));
    startTransition(async () => {
      const res = await setKbMissReviewedAction(id, reviewed);
      if (!res.ok) {
        setItems(prev);
        toast(res.error, "error");
      }
    });
  }

  function remove(id: string) {
    if (!window.confirm("Delete this feedback entry?")) return;
    const prev = items;
    setItems(items.filter((it) => it.id !== id));
    startTransition(async () => {
      const res = await deleteKbMissAction(id);
      if (!res.ok) {
        setItems(prev);
        toast(res.error, "error");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-surface-raised p-4 ring-1 ring-black/5">
        <h2 className="text-base font-semibold text-foreground">AI Feedback</h2>
        <p className="mt-1 text-sm text-muted">
          Topics where Coach AI fell back to general knowledge instead of seeded KB content. Logged
          only for users who opted into feedback collection. Use this list to prioritize new RAG seed
          migrations.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <div className="inline-flex rounded-lg bg-surface-inset p-0.5 text-xs">
          <button
            type="button"
            onClick={() => changeFilter("unreviewed")}
            className={`rounded px-3 py-1 ${filter === "unreviewed" ? "bg-surface-raised font-semibold text-foreground shadow" : "text-muted"}`}
          >
            Unreviewed
          </button>
          <button
            type="button"
            onClick={() => changeFilter("all")}
            className={`rounded px-3 py-1 ${filter === "all" ? "bg-surface-raised font-semibold text-foreground shadow" : "text-muted"}`}
          >
            All
          </button>
        </div>
        <Button variant="ghost" size="sm" onClick={() => refresh()} disabled={pending}>
          <RefreshCw className="mr-1 size-3.5" />
          Refresh
        </Button>
        <span className="ml-auto text-xs text-muted">{items.length} entries</span>
      </div>

      {err && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200 dark:bg-red-950/40 dark:text-red-200">
          {err}
        </p>
      )}

      {items.length === 0 ? (
        <p className="rounded-lg bg-surface-inset px-3 py-6 text-center text-sm text-muted">
          {filter === "unreviewed" ? "No unreviewed feedback. Coach AI is grounded in the KB." : "No feedback logged yet."}
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((it) => (
            <li
              key={it.id}
              className={`rounded-xl bg-surface-raised p-3 text-sm ring-1 ring-black/5 ${it.reviewed_at ? "opacity-60" : ""}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-foreground">{it.topic}</p>
                  <p className="mt-1 text-foreground/80">&ldquo;{it.user_question}&rdquo;</p>
                  <p className="mt-1 text-xs text-muted">
                    {REASON_LABEL[it.reason] ?? it.reason}
                    {it.sport_variant ? ` · ${it.sport_variant}` : ""}
                    {it.sanctioning_body ? ` · ${it.sanctioning_body}` : ""}
                    {it.game_level ? ` · ${it.game_level}` : ""}
                    {it.age_division ? ` · ${it.age_division}` : ""}
                    {" · "}
                    {formatDate(it.created_at)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <IconButton
                    icon={Check}
                    tooltip={it.reviewed_at ? "Mark unreviewed" : "Mark reviewed"}
                    aria-label={it.reviewed_at ? "Mark unreviewed" : "Mark reviewed"}
                    onClick={() => markReviewed(it.id, !it.reviewed_at)}
                    className={it.reviewed_at ? "text-emerald-500" : "text-muted"}
                  />
                  <IconButton
                    icon={Trash2}
                    tooltip="Delete"
                    aria-label="Delete"
                    onClick={() => remove(it.id)}
                    className="text-muted"
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
