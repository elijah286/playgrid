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
    | "ballpath_step_discontinuity"
    /** A ballPath step whose `to` matches a PRIOR step's `from` is a
     *  lateral back to a previous handler (Flea Flicker, halfback
     *  option, hook-and-lateral, double pass). Any such backward
     *  exchange MUST have `atPoint.y < 0` — behind the LOS. A pitch
     *  forward of the LOS is an illegal forward pass + handoff in
     *  every code of football. Surfaced 2026-05-13 alongside the
     *  Flea Flicker concept build. */
    | "ballpath_lateral_back_forward_of_los";
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
        // 4) Lateral back to a prior handler MUST be behind the LOS.
        // A "return" step is one whose `to` matches any earlier
        // step's `from`. Flea Flicker is the canonical case (ball
        // returns to QB) but the rule generalizes to any back-pass.
        const isLateralBack = spec.ballPath
          .slice(0, i)
          .some((earlier) => earlier.from === step.to);
        if (isLateralBack && step.atPoint && step.atPoint[1] >= 0) {
          violations.push({
            code: "ballpath_lateral_back_forward_of_los",
            message:
              `ballPath step ${i + 1} (@${step.from} → @${step.to}) is a lateral back to a prior handler, but ` +
              `the mesh point sits at y=${step.atPoint[1].toFixed(1)} (at or past the LOS). ` +
              `A backward pass to a prior handler MUST happen behind the LOS — otherwise it's an illegal forward pass + handoff. ` +
              `Move atPoint to a negative y value (e.g. y=-4 for 4 yds behind the LOS).`,
          });
        }
      }
    }
  }

  return violations.length === 0 ? { ok: true } : { ok: false, violations };
}

export type ProgressionViolation = {
  /** Stable code identifying which rule fired. Tests assert on this. */
  code:
    | "progression_unknown_target"
    | "progression_not_route"
    | "progression_duplicate";
  /** Coach-readable explanation suitable for surfacing in a tool result. */
  message: string;
};

export type ProgressionResult =
  | { ok: true }
  | { ok: false; violations: ProgressionViolation[] };

/**
 * Validate spec.progression — the QB read order.
 *
 * Each id MUST name a player who has a `kind: "route"` assignment (the
 * progression is the throw sequence) and MUST appear at most once.
 * Omitted / empty progression is always ok (nothing to check).
 */
export function validatePlaySpecProgression(spec: PlaySpec): ProgressionResult {
  const order = spec.progression;
  if (!order || order.length === 0) return { ok: true };

  const violations: ProgressionViolation[] = [];
  const actionByPlayer = new Map(spec.assignments.map((a) => [a.player, a.action.kind]));
  const seen = new Set<string>();

  for (const id of order) {
    if (seen.has(id)) {
      violations.push({
        code: "progression_duplicate",
        message:
          `Progression lists @${id} more than once. The read order is a sequence — ` +
          `each receiver appears at most once.`,
      });
      continue;
    }
    seen.add(id);

    const kind = actionByPlayer.get(id);
    if (kind === undefined) {
      violations.push({
        code: "progression_unknown_target",
        message:
          `Progression includes @${id}, but no player by that id has an assignment in this play. ` +
          `Progression ids must name receivers running routes.`,
      });
      continue;
    }
    if (kind !== "route") {
      violations.push({
        code: "progression_not_route",
        message:
          `Progression includes @${id}, but that player's assignment is "${kind}", not a pass route. ` +
          `The QB read order can only contain receivers running routes — drop @${id} or give them a route.`,
      });
    }
  }

  return violations.length === 0 ? { ok: true } : { ok: false, violations };
}
