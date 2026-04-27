"use client";

import { useState, useTransition } from "react";
import { Check, RefreshCw, Trash2 } from "lucide-react";
import { Button, IconButton, useToast } from "@/components/ui";
import {
  deleteKbMissAction,
  listCoachAiKbMissesAction,
  setKbMissReviewedAction,
  deleteRefusalAction,
  listCoachAiRefusalsAction,
  setRefusalReviewedAction,
  type KbMissRow,
  type RefusalRow,
} from "@/app/actions/coach-ai-feedback";

const KB_MISS_REASON_LABEL: Record<string, string> = {
  no_results: "No KB results",
  weak_results: "Weak KB results",
  irrelevant_results: "Irrelevant KB results",
  concept_not_seeded: "Concept not seeded",
};

const REFUSAL_REASON_LABEL: Record<string, string> = {
  playbook_required: "Playbook required",
  permission_denied: "Permission denied",
  invalid_input: "Invalid input",
  feature_unavailable: "Feature unavailable",
  tooling_error: "Tooling error",
  out_of_scope: "Out of scope",
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

type FeedbackType = "kb_miss" | "refusal";

export function CoachAiFeedbackAdminClient({
  initialItems,
  initialError,
}: {
  initialItems: KbMissRow[];
  initialError: string | null;
}) {
  const { toast } = useToast();
  const [feedbackType, setFeedbackType] = useState<FeedbackType>("kb_miss");
  const [kbMisses, setKbMisses] = useState(initialItems);
  const [refusals, setRefusals] = useState<RefusalRow[]>([]);
  const [err, setErr] = useState<string | null>(initialError);
  const [filter, setFilter] = useState<"unreviewed" | "all">("unreviewed");
  const [pending, startTransition] = useTransition();
  const [refusalsLoaded, setRefusalsLoaded] = useState(false);

  const items = feedbackType === "kb_miss" ? kbMisses : refusals;

  function refresh(nextFilter: "unreviewed" | "all" = filter, type: FeedbackType = feedbackType) {
    startTransition(async () => {
      if (type === "kb_miss") {
        const res = await listCoachAiKbMissesAction(nextFilter);
        if (!res.ok) {
          setErr(res.error);
          return;
        }
        setErr(null);
        setKbMisses(res.items);
      } else {
        const res = await listCoachAiRefusalsAction(nextFilter);
        if (!res.ok) {
          setErr(res.error);
          return;
        }
        setErr(null);
        setRefusals(res.items);
      }
    });
  }

  function changeFilter(f: "unreviewed" | "all") {
    setFilter(f);
    refresh(f);
  }

  function changeType(type: FeedbackType) {
    setFeedbackType(type);
    if (type === "refusal" && !refusalsLoaded) {
      setRefusalsLoaded(true);
      refresh(filter, type);
    }
  }

  function markReviewed(id: string, reviewed: boolean) {
    const prev = feedbackType === "kb_miss" ? kbMisses : refusals;
    const updated = prev.map((it) => (it.id === id ? { ...it, reviewed_at: reviewed ? new Date().toISOString() : null } : it));
    if (feedbackType === "kb_miss") setKbMisses(updated as KbMissRow[]);
    else setRefusals(updated as RefusalRow[]);

    startTransition(async () => {
      const action = feedbackType === "kb_miss" ? setKbMissReviewedAction : setRefusalReviewedAction;
      const res = await action(id, reviewed);
      if (!res.ok) {
        if (feedbackType === "kb_miss") setKbMisses(prev as KbMissRow[]);
        else setRefusals(prev as RefusalRow[]);
        toast(res.error, "error");
      }
    });
  }

  function remove(id: string) {
    if (!window.confirm("Delete this feedback entry?")) return;
    const prev = feedbackType === "kb_miss" ? kbMisses : refusals;
    if (feedbackType === "kb_miss") setKbMisses((prev as KbMissRow[]).filter((it) => it.id !== id));
    else setRefusals((prev as RefusalRow[]).filter((it) => it.id !== id));

    startTransition(async () => {
      const action = feedbackType === "kb_miss" ? deleteKbMissAction : deleteRefusalAction;
      const res = await action(id);
      if (!res.ok) {
        if (feedbackType === "kb_miss") setKbMisses(prev as KbMissRow[]);
        else setRefusals(prev as RefusalRow[]);
        toast(res.error, "error");
      }
    });
  }

  const isKbMiss = feedbackType === "kb_miss";
  const emptyMessage = isKbMiss
    ? filter === "unreviewed" ? "No unreviewed KB misses. Coach AI is grounded in the KB." : "No KB misses logged yet."
    : filter === "unreviewed" ? "No unreviewed refusals. Coach AI is handling requests smoothly." : "No refusals logged yet.";

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-surface-raised p-4 ring-1 ring-black/5">
        <h2 className="text-base font-semibold text-foreground">AI Feedback</h2>
        <p className="mt-1 text-sm text-muted">
          {isKbMiss
            ? "Topics where Coach AI fell back to general knowledge instead of seeded KB content."
            : "Requests that Coach AI couldn't fulfill due to missing context or permissions."}
          {" "}Logged only for users who opted into feedback collection.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <div className="inline-flex rounded-lg bg-surface-inset p-0.5 text-xs">
          <button
            type="button"
            onClick={() => changeType("kb_miss")}
            className={`rounded px-3 py-1 ${feedbackType === "kb_miss" ? "bg-surface-raised font-semibold text-foreground shadow" : "text-muted"}`}
          >
            KB Misses
          </button>
          <button
            type="button"
            onClick={() => changeType("refusal")}
            className={`rounded px-3 py-1 ${feedbackType === "refusal" ? "bg-surface-raised font-semibold text-foreground shadow" : "text-muted"}`}
          >
            Refusals
          </button>
        </div>
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
        <Button variant="ghost" size="sm" onClick={() => refresh(filter)} disabled={pending}>
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
          {emptyMessage}
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
                  {isKbMiss ? (
                    <>
                      <p className="font-semibold text-foreground">{(it as KbMissRow).topic}</p>
                      <p className="mt-1 text-foreground/80">&ldquo;{(it as KbMissRow).user_question}&rdquo;</p>
                      <p className="mt-1 text-xs text-muted">
                        {KB_MISS_REASON_LABEL[(it as KbMissRow).reason] ?? (it as KbMissRow).reason}
                        {it.sport_variant ? ` · ${it.sport_variant}` : ""}
                        {it.sanctioning_body ? ` · ${it.sanctioning_body}` : ""}
                        {it.game_level ? ` · ${it.game_level}` : ""}
                        {it.age_division ? ` · ${it.age_division}` : ""}
                        {" · "}
                        {formatDate(it.created_at)}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="font-semibold text-foreground">Request: &ldquo;{(it as RefusalRow).user_request}&rdquo;</p>
                      <p className="mt-1 text-xs text-muted">
                        {REFUSAL_REASON_LABEL[(it as RefusalRow).refusal_reason] ?? (it as RefusalRow).refusal_reason}
                        {it.sport_variant ? ` · ${it.sport_variant}` : ""}
                        {it.sanctioning_body ? ` · ${it.sanctioning_body}` : ""}
                        {it.game_level ? ` · ${it.game_level}` : ""}
                        {it.age_division ? ` · ${it.age_division}` : ""}
                        {" · "}
                        {formatDate(it.created_at)}
                      </p>
                    </>
                  )}
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
