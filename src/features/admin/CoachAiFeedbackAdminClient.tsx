"use client";

import { useState, useTransition } from "react";
import { Check, RefreshCw, Trash2, Eye, EyeOff } from "lucide-react";
import { Button, IconButton, useToast } from "@/components/ui";
import {
  deleteKbMissAction,
  listCoachAiKbMissesAction,
  setKbMissReviewedAction,
  deleteRefusalAction,
  listCoachAiRefusalsAction,
  setRefusalReviewedAction,
  listCoachAiPositiveFeedbackAction,
  listCoachAiNegativeFeedbackAction,
  type KbMissRow,
  type RefusalRow,
  type PositiveFeedbackRow,
  type NegativeFeedbackRow,
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

type FeedbackType = "all" | "kb_miss" | "refusal" | "negative" | "positive";

export function CoachAiFeedbackAdminClient({
  initialItems,
  initialError,
}: {
  initialItems: KbMissRow[];
  initialError: string | null;
}) {
  const { toast } = useToast();
  const [feedbackType, setFeedbackType] = useState<FeedbackType>("all");
  const [kbMisses, setKbMisses] = useState(initialItems);
  const [refusals, setRefusals] = useState<RefusalRow[]>([]);
  const [negativeFeedback, setNegativeFeedback] = useState<NegativeFeedbackRow[]>([]);
  const [positiveFeedback, setPositiveFeedback] = useState<PositiveFeedbackRow[]>([]);
  const [err, setErr] = useState<string | null>(initialError);
  const [filter, setFilter] = useState<"unreviewed" | "all">("unreviewed");
  const [pending, startTransition] = useTransition();
  const [dataLoaded, setDataLoaded] = useState<Record<FeedbackType, boolean>>({
    all: false,
    kb_miss: true,
    refusal: false,
    negative: false,
    positive: false,
  });

  type AllFeedbackItem = (KbMissRow | RefusalRow | PositiveFeedbackRow | NegativeFeedbackRow) & { feedbackType?: string };

  const items: AllFeedbackItem[] =
    feedbackType === "all"
      ? [
          ...kbMisses.map(it => ({ ...it, feedbackType: "kb_miss" } as AllFeedbackItem)),
          ...refusals.map(it => ({ ...it, feedbackType: "refusal" } as AllFeedbackItem)),
          ...negativeFeedback.map(it => ({ ...it, feedbackType: "negative" } as AllFeedbackItem)),
          ...positiveFeedback.map(it => ({ ...it, feedbackType: "positive" } as AllFeedbackItem)),
        ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      : feedbackType === "kb_miss"
        ? kbMisses
        : feedbackType === "refusal"
          ? refusals
          : feedbackType === "negative"
            ? negativeFeedback
            : positiveFeedback;

  function refresh(nextFilter: "unreviewed" | "all" = filter, type: FeedbackType = feedbackType) {
    startTransition(async () => {
      const load = async (t: Exclude<FeedbackType, "all">) => {
        if (t === "kb_miss") {
          const res = await listCoachAiKbMissesAction(nextFilter);
          if (!res.ok) { setErr(res.error); return; }
          setKbMisses(res.items);
        } else if (t === "refusal") {
          const res = await listCoachAiRefusalsAction(nextFilter);
          if (!res.ok) { setErr(res.error); return; }
          setRefusals(res.items);
        } else if (t === "negative") {
          const res = await listCoachAiNegativeFeedbackAction();
          if (!res.ok) { setErr(res.error); return; }
          setNegativeFeedback(res.items);
        } else if (t === "positive") {
          const res = await listCoachAiPositiveFeedbackAction();
          if (!res.ok) { setErr(res.error); return; }
          setPositiveFeedback(res.items);
        }
      };

      if (type === "all") {
        setErr(null);
        await Promise.all([load("kb_miss"), load("refusal"), load("negative"), load("positive")]);
      } else {
        await load(type);
        setErr(null);
      }
    });
  }

  function changeFilter(f: "unreviewed" | "all") {
    setFilter(f);
    refresh(f);
  }

  function changeType(type: FeedbackType) {
    setFeedbackType(type);
    if (!dataLoaded[type]) {
      setDataLoaded({ ...dataLoaded, [type]: true });
      refresh(filter, type);
    }
  }

  function markReviewed(id: string, reviewed: boolean, itemType?: string) {
    const type = itemType || feedbackType;
    if (type === "negative" || type === "positive" || type === "all") return;

    const prev = type === "kb_miss" ? kbMisses : refusals;
    const updated = prev.map((it) => (it.id === id ? { ...it, reviewed_at: reviewed ? new Date().toISOString() : null } : it));
    if (type === "kb_miss") setKbMisses(updated as KbMissRow[]);
    else setRefusals(updated as RefusalRow[]);

    startTransition(async () => {
      const action = type === "kb_miss" ? setKbMissReviewedAction : setRefusalReviewedAction;
      const res = await action(id, reviewed);
      if (!res.ok) {
        if (type === "kb_miss") setKbMisses(prev as KbMissRow[]);
        else setRefusals(prev as RefusalRow[]);
        toast(res.error, "error");
      }
    });
  }

  function remove(id: string, itemType?: string) {
    if (!window.confirm("Delete this feedback entry?")) return;

    const type = itemType || feedbackType;
    if (type === "kb_miss") {
      setKbMisses(kbMisses.filter((it) => it.id !== id));
      startTransition(async () => {
        const res = await deleteKbMissAction(id);
        if (!res.ok) {
          setKbMisses(kbMisses);
          toast(res.error, "error");
        }
      });
    } else if (type === "refusal") {
      setRefusals(refusals.filter((it) => it.id !== id));
      startTransition(async () => {
        const res = await deleteRefusalAction(id);
        if (!res.ok) {
          setRefusals(refusals);
          toast(res.error, "error");
        }
      });
    }
  }

  const isAll = feedbackType === "all";
  const isKbMiss = feedbackType === "kb_miss";
  const isRefusal = feedbackType === "refusal";
  const isNegative = feedbackType === "negative";
  const isPositive = feedbackType === "positive";

  let emptyMessage = "";
  if (isAll) {
    emptyMessage = filter === "unreviewed" ? "No unreviewed feedback. Coach AI is running smoothly!" : "No feedback logged yet.";
  } else if (isKbMiss) {
    emptyMessage = filter === "unreviewed" ? "No unreviewed KB misses. Coach AI is grounded in the KB." : "No KB misses logged yet.";
  } else if (isRefusal) {
    emptyMessage = filter === "unreviewed" ? "No unreviewed refusals. Coach AI is handling requests smoothly." : "No refusals logged yet.";
  } else if (isNegative) {
    emptyMessage = "No negative feedback (thumbs down) logged yet. Coach AI is helping users!";
  } else {
    emptyMessage = "No positive feedback (thumbs up) logged yet.";
  }

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
            onClick={() => changeType("all")}
            className={`rounded px-3 py-1 ${feedbackType === "all" ? "bg-surface-raised font-semibold text-foreground shadow" : "text-muted"}`}
          >
            All
          </button>
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
          <button
            type="button"
            onClick={() => changeType("negative")}
            className={`rounded px-3 py-1 ${feedbackType === "negative" ? "bg-surface-raised font-semibold text-foreground shadow" : "text-muted"}`}
          >
            Thumbs Down
          </button>
          <button
            type="button"
            onClick={() => changeType("positive")}
            className={`rounded px-3 py-1 ${feedbackType === "positive" ? "bg-surface-raised font-semibold text-foreground shadow" : "text-muted"}`}
          >
            Thumbs Up
          </button>
        </div>
        {feedbackType === "positive" && (
          <span className="ml-auto text-xs text-muted italic">For understanding what users find valuable</span>
        )}
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
          {items.map((it) => {
            const fType = isAll ? it.feedbackType : feedbackType;
            const isKbMissItem = fType === "kb_miss";
            const isRefusalItem = fType === "refusal";
            const isNegativeItem = fType === "negative";
            const isPositiveItem = fType === "positive";

            let bgColor = "bg-surface-raised";
            let badgeColor = "";
            if (isKbMissItem) {
              bgColor = "bg-red-50 dark:bg-red-950/20";
              badgeColor = "bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200";
            } else if (isRefusalItem) {
              bgColor = "bg-yellow-50 dark:bg-yellow-950/20";
              badgeColor = "bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-200";
            } else if (isNegativeItem) {
              bgColor = "bg-red-50 dark:bg-red-950/20";
              badgeColor = "bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200";
            } else if (isPositiveItem) {
              bgColor = "bg-green-50 dark:bg-green-950/20";
              badgeColor = "bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-200";
            }

            const reviewed = (isKbMissItem || isRefusalItem) ? (it as KbMissRow | RefusalRow).reviewed_at : null;
            return (
            <li
              key={it.id}
              className={`rounded-xl ${bgColor} p-3 text-sm ring-1 ring-black/5 ${reviewed ? "opacity-60" : ""}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  {isAll && (
                    <span className={`inline-block rounded px-2 py-1 text-xs font-semibold ${badgeColor} mb-2`}>
                      {isKbMissItem ? "KB Miss" : isRefusalItem ? "Refusal" : isNegativeItem ? "Thumbs Down" : "Thumbs Up"}
                    </span>
                  )}
                  {isKbMissItem ? (
                    <>
                      <p className="font-semibold text-foreground">{(it as KbMissRow).topic}</p>
                      <p className="mt-1 text-foreground/80">&ldquo;{(it as KbMissRow).user_question}&rdquo;</p>
                      <p className="mt-1 text-xs text-muted">
                        {KB_MISS_REASON_LABEL[(it as KbMissRow).reason] ?? (it as KbMissRow).reason}
                        {(it as KbMissRow).sport_variant ? ` · ${(it as KbMissRow).sport_variant}` : ""}
                        {(it as KbMissRow).sanctioning_body ? ` · ${(it as KbMissRow).sanctioning_body}` : ""}
                        {(it as KbMissRow).game_level ? ` · ${(it as KbMissRow).game_level}` : ""}
                        {(it as KbMissRow).age_division ? ` · ${(it as KbMissRow).age_division}` : ""}
                        {" · "}
                        {formatDate(it.created_at)}
                      </p>
                    </>
                  ) : isRefusalItem ? (
                    <>
                      <p className="font-semibold text-foreground">Request: &ldquo;{(it as RefusalRow).user_request}&rdquo;</p>
                      <p className="mt-1 text-xs text-muted">
                        {REFUSAL_REASON_LABEL[(it as RefusalRow).refusal_reason] ?? (it as RefusalRow).refusal_reason}
                        {(it as RefusalRow).sport_variant ? ` · ${(it as RefusalRow).sport_variant}` : ""}
                        {(it as RefusalRow).sanctioning_body ? ` · ${(it as RefusalRow).sanctioning_body}` : ""}
                        {(it as RefusalRow).game_level ? ` · ${(it as RefusalRow).game_level}` : ""}
                        {(it as RefusalRow).age_division ? ` · ${(it as RefusalRow).age_division}` : ""}
                        {" · "}
                        {formatDate(it.created_at)}
                      </p>
                    </>
                  ) : isNegativeItem ? (
                    <>
                      <p className="font-semibold text-foreground">User: &ldquo;{(it as NegativeFeedbackRow).user_message}&rdquo;</p>
                      <p className="mt-1 text-foreground/80">&ldquo;{(it as NegativeFeedbackRow).response_text}&rdquo;</p>
                      <p className="mt-1 text-xs text-muted">{formatDate(it.created_at)}</p>
                    </>
                  ) : (
                    <>
                      <p className="font-semibold text-foreground">User: &ldquo;{(it as PositiveFeedbackRow).user_message}&rdquo;</p>
                      <p className="mt-1 text-foreground/80">&ldquo;{(it as PositiveFeedbackRow).response_text}&rdquo;</p>
                      <p className="mt-1 text-xs text-muted">{formatDate(it.created_at)}</p>
                    </>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {(isKbMissItem || isRefusalItem) && (
                    <IconButton
                      icon={Check}
                      tooltip={reviewed ? "Mark unreviewed" : "Mark reviewed"}
                      aria-label={reviewed ? "Mark unreviewed" : "Mark reviewed"}
                      onClick={() => markReviewed(it.id, !reviewed, fType)}
                      className={reviewed ? "text-emerald-500" : "text-muted"}
                    />
                  )}
                  <IconButton
                    icon={Trash2}
                    tooltip="Delete"
                    aria-label="Delete"
                    onClick={() => remove(it.id, fType)}
                    className="text-muted"
                  />
                </div>
              </div>
            </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
