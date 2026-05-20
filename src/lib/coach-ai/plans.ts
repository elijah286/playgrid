/**
 * Coach Cal Plans — multi-step checklists Cal proposes for complex
 * requests (install N plays, edit a batch, add defense to N plays).
 * Each plan owns a sequence of steps; each step is executed in its
 * own chat turn so the work doesn't blow the SSE timeout / tool-turn
 * budget, the coach sees progress, and recovery is "retry step N"
 * instead of "save those".
 *
 * Backed by the `coach_ai_plans` table (migration 20260520140000).
 * One active plan per thread — Cal can't propose a second plan while
 * one is in flight. To start a new plan, the current one must be
 * marked completed or cancelled.
 *
 * Surfaced 2026-05-20 after a coach's 6-play install saved 1 of 6.
 * Phase 1 (already shipped) added a markdown checklist convention
 * and capped catalog-concept fences at 3 per reply. Phase 2 (this
 * file) gives the checklist persistent state.
 */

import { createServiceRoleClient } from "@/lib/supabase/admin";

/** Per-step status. Drives the UI plan-card icon (○ pending,
 *  ⏳ in-progress, ✓ completed, ✗ failed, ↷ skipped). */
export type PlanStepStatus = "pending" | "in_progress" | "completed" | "failed" | "skipped";

/** One step in a plan. Stored as a JSONB element in `coach_ai_plans.steps`. */
export type PlanStep = {
  /** Short title shown to the coach in the plan card. */
  title: string;
  /** Optional detail describing what Cal will do (e.g. tool + concept). */
  description?: string;
  /** Lifecycle state. */
  status: PlanStepStatus;
  /** Per-step result — a play://uuid link for save success, an error
   *  message for failure, or null while pending. */
  result?: string | null;
  /** ISO timestamp when the step transitioned out of pending. */
  completed_at?: string | null;
};

/** Plan lifecycle. */
export type PlanStatus = "active" | "completed" | "cancelled";

/** Hydrated plan row. */
export type Plan = {
  id: string;
  thread_id: string;
  user_id: string;
  title: string;
  status: PlanStatus;
  steps: PlanStep[];
  created_at: string;
  updated_at: string;
};

/**
 * Create a new plan for a thread. Errors if the thread already has
 * an active plan — Cal must complete or cancel the existing one
 * first. The DB's unique partial index enforces this; surfaced as a
 * coach-friendly error here.
 */
export async function createPlan(opts: {
  threadId: string;
  userId: string;
  title: string;
  steps: Array<Pick<PlanStep, "title" | "description">>;
}): Promise<{ ok: true; plan: Plan } | { ok: false; error: string }> {
  if (!opts.title.trim()) return { ok: false, error: "Plan title is required." };
  if (opts.steps.length === 0) return { ok: false, error: "Plan must have at least one step." };
  if (opts.steps.length > 20) return { ok: false, error: "Plan is too long — max 20 steps. Split into separate plans if the coach really wants N>20 things." };

  const admin = createServiceRoleClient();
  const steps: PlanStep[] = opts.steps.map((s) => ({
    title: s.title.trim(),
    description: s.description?.trim() || undefined,
    status: "pending",
    result: null,
    completed_at: null,
  }));

  const { data, error } = await admin
    .from("coach_ai_plans")
    .insert({
      thread_id: opts.threadId,
      user_id: opts.userId,
      title: opts.title.trim(),
      status: "active",
      steps,
    })
    .select("*")
    .single();

  if (error) {
    // Unique-index violation = active plan already exists.
    if (error.code === "23505") {
      return {
        ok: false,
        error:
          "This thread already has an active plan. Finish it (or cancel it) before proposing a new one.",
      };
    }
    return { ok: false, error: `Could not create plan: ${error.message}` };
  }
  return { ok: true, plan: data as Plan };
}

/**
 * Get the active plan for a thread, or null. Cal calls this at the
 * start of a turn (via the system-prompt context block) to know
 * which step to execute next.
 */
export async function getActivePlan(threadId: string): Promise<Plan | null> {
  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from("coach_ai_plans")
    .select("*")
    .eq("thread_id", threadId)
    .eq("status", "active")
    .maybeSingle();
  if (error) return null;
  return (data as Plan | null) ?? null;
}

/**
 * Update one step's status + result. Used by Cal to mark a step
 * completed/failed/skipped at the end of the turn that executed it.
 * If every step is now non-pending and non-in_progress, the whole
 * plan transitions to 'completed'.
 */
export async function updatePlanStep(opts: {
  planId: string;
  stepIndex: number;
  status: PlanStepStatus;
  result?: string | null;
}): Promise<{ ok: true; plan: Plan } | { ok: false; error: string }> {
  const admin = createServiceRoleClient();
  const { data: current, error: readErr } = await admin
    .from("coach_ai_plans")
    .select("*")
    .eq("id", opts.planId)
    .maybeSingle();
  if (readErr) return { ok: false, error: `Could not load plan: ${readErr.message}` };
  if (!current) return { ok: false, error: `Plan ${opts.planId} not found.` };

  const plan = current as Plan;
  if (plan.status !== "active") {
    return { ok: false, error: `Plan is ${plan.status} — can't update steps.` };
  }
  if (opts.stepIndex < 0 || opts.stepIndex >= plan.steps.length) {
    return {
      ok: false,
      error: `Step index ${opts.stepIndex} out of range (plan has ${plan.steps.length} step(s)).`,
    };
  }

  const updatedSteps = plan.steps.map((s, i) =>
    i === opts.stepIndex
      ? {
          ...s,
          status: opts.status,
          result: opts.result ?? s.result ?? null,
          completed_at: opts.status === "pending" || opts.status === "in_progress"
            ? null
            : new Date().toISOString(),
        }
      : s,
  );

  // Auto-complete the plan when every step has reached a terminal
  // state. Terminal = completed | failed | skipped. The coach can
  // still re-open by editing in admin if a "failed" was actually
  // retryable; that's a future enhancement.
  const everyTerminal = updatedSteps.every(
    (s) => s.status === "completed" || s.status === "failed" || s.status === "skipped",
  );
  const newStatus: PlanStatus = everyTerminal ? "completed" : "active";

  const { data: updated, error: writeErr } = await admin
    .from("coach_ai_plans")
    .update({ steps: updatedSteps, status: newStatus })
    .eq("id", opts.planId)
    .select("*")
    .single();
  if (writeErr) return { ok: false, error: `Could not update plan: ${writeErr.message}` };
  return { ok: true, plan: updated as Plan };
}

/**
 * Cancel an active plan. Coach pivoted away; Cal stops working
 * through it. Pending and in-progress steps stay as-is on the row
 * for audit but the plan no longer drives Cal's behavior.
 */
export async function cancelPlan(planId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("coach_ai_plans")
    .update({ status: "cancelled" })
    .eq("id", planId)
    .eq("status", "active");
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Format a plan for inclusion in Cal's system-prompt context block.
 * Gives Cal the current step list with statuses + the index of the
 * next pending step so Cal knows what to execute this turn.
 * Returns null when there's no active plan (Cal's prompt block
 * skips the section entirely in that case).
 */
export function formatActivePlanForPrompt(plan: Plan | null): string | null {
  if (!plan) return null;
  const lines: string[] = [];
  lines.push(`**Active plan: "${plan.title}" (id: ${plan.id})**`);
  for (let i = 0; i < plan.steps.length; i++) {
    const s = plan.steps[i];
    const checkbox =
      s.status === "completed" ? "[x]" :
      s.status === "failed"    ? "[!]" :
      s.status === "skipped"   ? "[~]" :
      s.status === "in_progress" ? "[…]" :
      "[ ]";
    const tail = s.result ? ` — ${s.result}` : "";
    lines.push(`${checkbox} ${i + 1}. ${s.title}${tail}`);
  }
  const nextIdx = plan.steps.findIndex((s) => s.status === "pending");
  if (nextIdx >= 0) {
    lines.push("");
    lines.push(
      `Next step to execute this turn: #${nextIdx + 1} — "${plan.steps[nextIdx].title}". ` +
        `After executing it, call \`update_plan_step({ plan_id: "${plan.id}", step_index: ${nextIdx}, status: "completed" | "failed" | "skipped", result?: "..." })\` and STOP. Don't execute step #${nextIdx + 2}+ in the same turn — that's the entire point of the plan.`,
    );
  } else {
    lines.push("");
    lines.push("Every step has reached a terminal state. The plan auto-completes; tell the coach what you finished.");
  }
  return lines.join("\n");
}
