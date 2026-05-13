/**
 * Spec-semantics validator — catches degenerate ball-handling shapes
 * the zod schema can't express on its own.
 *
 * Zod can enforce field types and presence (giveTo is a non-empty
 * string) but not relationships between fields (giveTo ≠ passTo,
 * ballPath continuity). Those checks live here and run at the
 * play-tools resolver alongside the playbook-capability gate.
 *
 * Rules enforced:
 *   - rpo_read: giveTo MUST differ from passTo (otherwise the
 *     decision is degenerate — there's no give-vs-throw choice).
 *   - ballPath step: from MUST differ from to (a player can't hand
 *     to themselves).
 *   - ballPath continuity: for steps i > 0, ballPath[i].from MUST
 *     equal ballPath[i-1].to (the ball flows through one player at
 *     a time — a play can't have it teleport between players).
 *
 * Errors are RETURNED (not thrown) so the resolver can surface them
 * to Cal as a coaching error in tool results without crashing. Every
 * violation is reported in one pass so all issues can be fixed
 * together rather than one round-trip per violation.
 */

import type { PlaySpec } from "./spec";

export type SpecSemanticsViolation = {
  /** Stable code identifying which rule fired. Tests assert on this. */
  code:
    | "rpo_read_give_equals_pass"
    | "ballpath_step_self_handoff"
    | "ballpath_step_discontinuity";
  /** Coach-readable explanation suitable for surfacing in a tool result. */
  message: string;
};

export type SpecSemanticsResult =
  | { ok: true }
  | { ok: false; violations: SpecSemanticsViolation[] };

/**
 * Run the ball-flow semantics checks on a PlaySpec.
 *
 * @returns ok=true when every rule passes; ok=false with the full list
 *          of violations otherwise. Empty / missing ballPath / no
 *          rpo_read assignments simply yield ok=true (nothing to check).
 */
export function validatePlaySpecBallFlow(spec: PlaySpec): SpecSemanticsResult {
  const violations: SpecSemanticsViolation[] = [];

  // 1) rpo_read: giveTo ≠ passTo.
  for (const a of spec.assignments) {
    if (a.action.kind !== "rpo_read") continue;
    if (a.action.giveTo === a.action.passTo) {
      violations.push({
        code: "rpo_read_give_equals_pass",
        message:
          `@${a.player}'s RPO read has giveTo === passTo (both "${a.action.giveTo}") — that's a degenerate decision (same player on both branches). ` +
          `Pick a different receiver for the pass branch, or replace the rpo_read with a plain carry / route.`,
      });
    }
  }

  // 2) ballPath steps: from ≠ to.
  // 3) ballPath continuity: step[i].from === step[i-1].to.
  if (spec.ballPath) {
    for (let i = 0; i < spec.ballPath.length; i++) {
      const step = spec.ballPath[i];
      if (step.from === step.to) {
        violations.push({
          code: "ballpath_step_self_handoff",
          message:
            `ballPath step ${i + 1}: @${step.from} hands to themselves. ` +
            `A handoff requires two different players — fix or remove the step.`,
        });
      }
      if (i > 0) {
        const prev = spec.ballPath[i - 1];
        if (step.from !== prev.to) {
          violations.push({
            code: "ballpath_step_discontinuity",
            message:
              `ballPath step ${i + 1} (@${step.from} → @${step.to}) doesn't continue from step ${i} (@${prev.from} → @${prev.to}): ` +
              `the ball was last in @${prev.to}'s hands but step ${i + 1} starts from @${step.from}. ` +
              `The ball can only move through one player at a time — either change step ${i + 1}'s "from" to @${prev.to}, or add an intermediate exchange.`,
          });
        }
      }
    }
  }

  return violations.length === 0 ? { ok: true } : { ok: false, violations };
}
