"use client";

import { useState, useTransition } from "react";
import { Check, RefreshCw, Trash2, ShieldOff, Shield } from "lucide-react";
import { Button, IconButton, useToast } from "@/components/ui";
import { AssistantMessage } from "@/features/coach-ai/AssistantMessage";
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

/**
 * Render the "from <user>" line that goes on every feedback row. Falls
 * back gracefully: prefer email (most useful for ID), then display
 * name, then a truncated user_id, then "anonymous". An admin badge
 * appears inline when the row IS from an admin (only shown when the
 * "Hide admin queries" toggle is OFF — when it's ON, admin rows are
 * filtered out server-side).
 */
function UserAttribution({
  user_email,
  user_display_name,
  user_id,
  user_role,
}: {
  user_email: string | null;
  user_display_name: string | null;
  user_id: string | null;
  user_role: string | null;
}) {
  const label =
    user_email ??
    user_display_name ??
    (user_id ? `user ${user_id.slice(0, 8)}` : "anonymous");
  return (
    <span className="inline-flex items-center gap-1">
      <span className="font-medium">from {label}</span>
      {user_role === "admin" && (
        <span
          className="rounded bg-amber-100 px-1 py-px text-[10px] font-semibold uppercase text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
          title="This query is from a site admin"
        >
          admin
        </span>
      )}
    </span>
  );
}

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
  // Hide site-admin-authored queries by default — what the operator
  // mostly cares about is real-user pain, not Cal-team self-testing.
  // Toggling OFF reveals admin rows (with an "admin" badge so they're
  // visually distinguishable) and refetches every loaded tab so the
  // user IDs match the new filter.
  const [excludeAdmins, setExcludeAdmins] = useState(true);
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

  function refresh(
    nextFilter: "unreviewed" | "all" = filter,
    type: FeedbackType = feedbackType,
    nextExcludeAdmins: boolean = excludeAdmins,
  ) {
    startTransition(async () => {
      const load = async (t: Exclude<FeedbackType, "all">) => {
        if (t === "kb_miss") {
          const res = await listCoachAiKbMissesAction(nextFilter, nextExcludeAdmins);
          if (!res.ok) { setErr(res.error); return; }
          setKbMisses(res.items);
        } else if (t === "refusal") {
          const res = await listCoachAiRefusalsAction(nextFilter, nextExcludeAdmins);
          if (!res.ok) { setErr(res.error); return; }
          setRefusals(res.items);
        } else if (t === "negative") {
          const res = await listCoachAiNegativeFeedbackAction(nextExcludeAdmins);
          if (!res.ok) { setErr(res.error); return; }
          setNegativeFeedback(res.items);
        } else if (t === "positive") {
          const res = await listCoachAiPositiveFeedbackAction(nextExcludeAdmins);
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

  function toggleExcludeAdmins() {
    const next = !excludeAdmins;
    setExcludeAdmins(next);
    // Toggling the admin filter changes EVERY loaded tab's row set.
    // Mark every tab as "needs reload" and refetch the active one
    // immediately; other tabs reload on next switch via the dataLoaded
    // gate. Cleanest path is to refetch all loaded tabs eagerly so the
    // "All" view's counts stay correct without a manual refresh.
    startTransition(async () => {
      const tabs: Array<Exclude<FeedbackType, "all">> = [];
      if (dataLoaded.kb_miss) tabs.push("kb_miss");
      if (dataLoaded.refusal) tabs.push("refusal");
      if (dataLoaded.negative) tabs.push("negative");
      if (dataLoaded.positive) tabs.push("positive");
      await Promise.all(
        tabs.map(async (t) => {
          if (t === "kb_miss") {
            const res = await listCoachAiKbMissesAction(filter, next);
            if (res.ok) setKbMisses(res.items);
          } else if (t === "refusal") {
            const res = await listCoachAiRefusalsAction(filter, next);
            if (res.ok) setRefusals(res.items);
          } else if (t === "negative") {
            const res = await listCoachAiNegativeFeedbackAction(next);
            if (res.ok) setNegativeFeedback(res.items);
          } else if (t === "positive") {
            const res = await listCoachAiPositiveFeedbackAction(next);
            if (res.ok) setPositiveFeedback(res.items);
          }
        }),
      );
    });
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
      <p className="text-xs text-muted">
        {isKbMiss
          ? "Topics where Coach AI fell back to general knowledge instead of seeded KB content."
          : isRefusal
            ? "Requests that Coach AI couldn't fulfill due to missing context or permissions."
            : isNegative
              ? "Responses coaches marked thumbs-down."
              : isPositive
                ? "Responses coaches marked thumbs-up."
                : "All raw signals — KB misses, refusals, and thumbs feedback."}
        {" "}Logged only for users who opted into feedback collection.
      </p>

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

      <div className="flex flex-wrap items-center gap-2">
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
        <Button
          variant={excludeAdmins ? "primary" : "ghost"}
          size="sm"
          onClick={toggleExcludeAdmins}
          disabled={pending}
          title={
            excludeAdmins
              ? "Admin queries are hidden — click to show them"
              : "Admin queries are visible — click to hide them"
          }
        >
          {excludeAdmins ? (
            <ShieldOff className="mr-1 size-3.5" />
          ) : (
            <Shield className="mr-1 size-3.5" />
          )}
          {excludeAdmins ? "Hiding admins" : "Showing admins"}
        </Button>
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
                        <UserAttribution
                          user_email={(it as KbMissRow).user_email}
                          user_display_name={(it as KbMissRow).user_display_name}
                          user_id={(it as KbMissRow).user_id}
                          user_role={(it as KbMissRow).user_role}
                        />
                        {" · "}
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
                        <UserAttribution
                          user_email={(it as RefusalRow).user_email}
                          user_display_name={(it as RefusalRow).user_display_name}
                          user_id={(it as RefusalRow).user_id}
                          user_role={(it as RefusalRow).user_role}
                        />
                        {" · "}
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
                      <div className="mt-1 rounded-lg bg-surface-raised/50 p-2 ring-1 ring-black/5">
                        <AssistantMessage text={(it as NegativeFeedbackRow).response_text} />
                      </div>
                      <p className="mt-1 text-xs text-muted">
                        <UserAttribution
                          user_email={(it as NegativeFeedbackRow).user_email}
                          user_display_name={(it as NegativeFeedbackRow).user_display_name}
                          user_id={(it as NegativeFeedbackRow).user_id}
                          user_role={(it as NegativeFeedbackRow).user_role}
                        />
                        {" · "}
                        {formatDate(it.created_at)}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="font-semibold text-foreground">User: &ldquo;{(it as PositiveFeedbackRow).user_message}&rdquo;</p>
                      <div className="mt-1 rounded-lg bg-surface-raised/50 p-2 ring-1 ring-black/5">
                        <AssistantMessage text={(it as PositiveFeedbackRow).response_text} />
                      </div>
                      <p className="mt-1 text-xs text-muted">
                        <UserAttribution
                          user_email={(it as PositiveFeedbackRow).user_email}
                          user_display_name={(it as PositiveFeedbackRow).user_display_name}
                          user_id={(it as PositiveFeedbackRow).user_id}
                          user_role={(it as PositiveFeedbackRow).user_role}
                        />
                        {" · "}
                        {formatDate(it.created_at)}
                      </p>
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
