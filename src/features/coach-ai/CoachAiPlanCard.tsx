"use client";

/**
 * Coach Cal Plan card — renders the multi-step checklist Cal proposes
 * for complex multi-play requests (install N plays, etc.). Cal emits a
 * ```plan fence; AssistantMessage's `pre` override detects the lang
 * tag and renders this component.
 *
 * The fence body is JSON:
 *   {
 *     "plan_id": "uuid",
 *     "title": "Install 6 plays from drawing",
 *     "steps": [
 *       { "index": 0, "title": "Mesh", "description": "...", "status": "completed" },
 *       ...
 *     ]
 *   }
 *
 * Each subsequent Cal turn re-emits the plan fence with updated
 * step statuses, so the rendered card always reflects the latest
 * state. The persistent backing store (coach_ai_plans table) is the
 * canonical source — the fence is just the rendering hint.
 */

import { CheckCircle2, Circle, CircleDot, CircleX, MinusCircle } from "lucide-react";

type PlanStepStatus = "pending" | "in_progress" | "completed" | "failed" | "skipped";

type PlanStep = {
  index: number;
  title: string;
  description?: string | null;
  status: PlanStepStatus;
};

type PlanFenceBody = {
  plan_id: string;
  title: string;
  steps: PlanStep[];
};

function parseFence(json: string): PlanFenceBody | null {
  try {
    const data = JSON.parse(json) as unknown;
    if (
      typeof data === "object" &&
      data !== null &&
      typeof (data as { plan_id?: unknown }).plan_id === "string" &&
      typeof (data as { title?: unknown }).title === "string" &&
      Array.isArray((data as { steps?: unknown }).steps)
    ) {
      return data as PlanFenceBody;
    }
    return null;
  } catch {
    return null;
  }
}

function StepIcon({ status }: { status: PlanStepStatus }) {
  switch (status) {
    case "completed":
      return <CheckCircle2 className="size-4 shrink-0 text-emerald-500" aria-label="Completed" />;
    case "in_progress":
      return <CircleDot className="size-4 shrink-0 text-blue-500" aria-label="In progress" />;
    case "failed":
      return <CircleX className="size-4 shrink-0 text-rose-500" aria-label="Failed" />;
    case "skipped":
      return <MinusCircle className="size-4 shrink-0 text-muted" aria-label="Skipped" />;
    case "pending":
    default:
      return <Circle className="size-4 shrink-0 text-muted" aria-label="Pending" />;
  }
}

export function CoachAiPlanCard({ json }: { json: string }) {
  const plan = parseFence(json);
  if (!plan) {
    // Bad JSON — fall through to a plain code block so the coach sees
    // something instead of nothing. Cal will get a critique next turn
    // if a downstream lint catches the malformed fence.
    return (
      <pre className="my-2 overflow-x-auto rounded-lg bg-black/20 px-3 py-2 font-mono text-xs text-foreground/90">
        <code>{json}</code>
      </pre>
    );
  }

  const completed = plan.steps.filter((s) => s.status === "completed").length;
  const total = plan.steps.length;

  return (
    <div className="my-3 rounded-xl border border-border bg-surface-raised p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{plan.title}</h3>
          <p className="mt-0.5 text-xs text-muted">
            {completed} of {total} step{total === 1 ? "" : "s"} complete
          </p>
        </div>
      </div>
      <ol className="space-y-1.5">
        {plan.steps.map((step) => (
          <li
            key={step.index}
            className={`flex items-start gap-2 text-sm ${
              step.status === "completed" ? "text-muted line-through" :
              step.status === "skipped"   ? "text-muted/70 line-through" :
              step.status === "failed"    ? "text-rose-500" :
              step.status === "in_progress" ? "text-blue-500 font-medium" :
              "text-foreground"
            }`}
          >
            <StepIcon status={step.status} />
            <div className="min-w-0 flex-1">
              <div className="leading-snug">
                <span className="tabular-nums text-xs text-muted">{step.index + 1}.</span>{" "}
                {step.title}
              </div>
              {step.description ? (
                <div className="mt-0.5 text-xs text-muted">{step.description}</div>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
