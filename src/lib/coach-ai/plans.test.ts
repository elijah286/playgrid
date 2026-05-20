/**
 * Tests for the Plans subsystem helpers — pure-function bits that
 * don't need a live Supabase client. The CRUD helpers (createPlan,
 * updatePlanStep, etc.) are integration-tested via the propose_plan
 * and update_plan_step tools; those round-trip through the real DB
 * in the existing test environment.
 *
 * This file focuses on `formatActivePlanForPrompt` — the function
 * that converts a plan row into the system-prompt context block
 * Cal reads at turn start to know which step to execute. It's pure
 * and load-bearing: a regression here means Cal can't tell which
 * step is next or which plan to update.
 */

import { describe, expect, it } from "vitest";
import { formatActivePlanForPrompt, type Plan } from "./plans";

function planWithSteps(statuses: Array<"pending" | "in_progress" | "completed" | "failed" | "skipped">): Plan {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    thread_id: "00000000-0000-0000-0000-000000000099",
    user_id: "00000000-0000-0000-0000-000000000077",
    title: "Install 6 plays from drawing",
    status: "active",
    steps: statuses.map((status, i) => ({
      title: `Compose play ${i + 1}`,
      status,
      result: null,
      completed_at: null,
    })),
    created_at: "2026-05-20T12:00:00Z",
    updated_at: "2026-05-20T12:00:00Z",
  };
}

describe("formatActivePlanForPrompt", () => {
  it("returns null when there's no active plan", () => {
    expect(formatActivePlanForPrompt(null)).toBeNull();
  });

  it("includes the plan title and id so Cal can reference both", () => {
    const plan = planWithSteps(["pending", "pending"]);
    const formatted = formatActivePlanForPrompt(plan)!;
    expect(formatted).toContain('"Install 6 plays from drawing"');
    expect(formatted).toContain(plan.id);
  });

  it("renders pending / completed / failed / skipped / in_progress with distinct markers", () => {
    const plan = planWithSteps(["completed", "failed", "skipped", "in_progress", "pending"]);
    const formatted = formatActivePlanForPrompt(plan)!;
    expect(formatted).toMatch(/\[x\] 1\. Compose play 1/);
    expect(formatted).toMatch(/\[!\] 2\. Compose play 2/);
    expect(formatted).toMatch(/\[~\] 3\. Compose play 3/);
    expect(formatted).toMatch(/\[…\] 4\. Compose play 4/);
    expect(formatted).toMatch(/\[ \] 5\. Compose play 5/);
  });

  it("names the next pending step and instructs Cal to call update_plan_step + STOP", () => {
    const plan = planWithSteps(["completed", "completed", "pending", "pending"]);
    const formatted = formatActivePlanForPrompt(plan)!;
    expect(formatted).toMatch(/Next step to execute this turn: #3 — "Compose play 3"/);
    expect(formatted).toMatch(/update_plan_step.*step_index: 2/);
    expect(formatted).toMatch(/STOP/);
    // Must explicitly forbid executing step #4 in the same turn.
    expect(formatted).toMatch(/Don't execute step #4\+/);
  });

  it("announces plan completion when every step is terminal", () => {
    const plan = planWithSteps(["completed", "completed", "failed", "skipped"]);
    const formatted = formatActivePlanForPrompt(plan)!;
    expect(formatted).toMatch(/Every step has reached a terminal state/);
    expect(formatted).not.toMatch(/Next step to execute/);
  });

  it("surfaces step results inline so Cal can see save links / error notes from prior turns", () => {
    const plan = planWithSteps(["completed", "pending"]);
    plan.steps[0].result = "play://abc-123";
    const formatted = formatActivePlanForPrompt(plan)!;
    expect(formatted).toContain("play://abc-123");
  });
});
