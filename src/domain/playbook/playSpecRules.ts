/**
 * Playbook-rule validator for PlaySpec writes.
 *
 * Scans a candidate PlaySpec against the playbook's
 * `advancedCapabilities` (see `settings.ts`) and surfaces every
 * capability the spec requires but the playbook hasn't opted into.
 * The play-tools resolver runs this on every write so Cal can't slip
 * an RPO into a 7v7 playbook that doesn't allow them, and so a
 * coach's "no handoffs" 5v5 rule-set actually blocks reverses.
 *
 * Why this is separate from the spec's zod schema: capabilities are
 * playbook-level configuration, not spec-shape rules. A spec with
 * `kind: "rpo_read"` is a STRUCTURALLY valid spec (the schema accepts
 * it) — whether it's a LEGAL spec for THIS playbook depends on the
 * coach's rule toggles. Keeping the two checks separate means a
 * future "convert this play to a different playbook" flow can re-run
 * the rule check without re-parsing the spec.
 *
 * Capability mapping (the part future capabilities extend):
 *
 *   - `kind: "rpo_read"` on any assignment           → "rpo_read"
 *   - `ballPath` with one or more steps              → "handoff_chain"
 *   - `kind: "carry"` on the QB with a non-scramble  → "designed_qb_run"
 *     runType (qb_keep, draw, power, sweep, ...).
 *     A `runType: "scramble"` on the QB does NOT
 *     require this — scrambles are always legal
 *     when `rushingAllowed` is on.
 *
 * Errors are returned (not thrown) so the resolver can present them
 * as coaching errors in tool results without crashing the writer.
 */

import type { PlaySpec, PlayerAssignment } from "@/domain/play/spec";
import type { RuleCapability } from "./settings";

/** Diagnostic emitted for one spec → capability mismatch. */
export type RuleViolation = {
  /** Which capability the spec needed but didn't have. */
  capability: RuleCapability;
  /** Coach-readable explanation suitable for surfacing in a tool result. */
  message: string;
};

export type RuleValidationResult =
  | { ok: true }
  | { ok: false; violations: RuleViolation[] };

/** Player ids treated as the quarterback for capability inference.
 *  The synthesizer emits "QB" for every variant, but legacy
 *  hand-authored diagrams sometimes use "Q". Both count. */
const QB_PLAYER_IDS = new Set(["QB", "Q"]);

/** runTypes on the QB that count as designed QB runs (require the
 *  `designed_qb_run` capability). `scramble` is intentionally absent —
 *  scrambling is reactive, not designed, and is gated by the broader
 *  `rushingAllowed` toggle instead. */
const DESIGNED_QB_RUN_TYPES = new Set([
  "qb_keep",
  "draw",
  "power",
  "counter",
  "sweep",
  "trap",
  "inside_zone",
  "outside_zone",
]);

/**
 * Validate a PlaySpec against the playbook's advanced-capability set.
 *
 * @param spec         the candidate PlaySpec being written
 * @param capabilities the playbook's `advancedCapabilities` list
 * @returns            ok=true when every capability the spec requires is
 *                     enabled; ok=false with the full list of violations
 *                     otherwise (the caller surfaces them to Cal as a
 *                     tool error so all problems are fixed at once,
 *                     rather than one round-trip per missing capability).
 */
export function validatePlaySpecVsRules(
  spec: PlaySpec,
  capabilities: readonly RuleCapability[],
): RuleValidationResult {
  const enabled = new Set<RuleCapability>(capabilities);
  const violations: RuleViolation[] = [];

  // 1) rpo_read on any assignment.
  for (const a of spec.assignments) {
    if (a.action.kind !== "rpo_read") continue;
    if (!enabled.has("rpo_read")) {
      violations.push({
        capability: "rpo_read",
        message:
          `@${a.player} has an rpo_read assignment, but this playbook hasn't enabled RPOs. ` +
          `Either turn on the "rpo_read" capability in the playbook's rules, or replace the assignment with a carry + an independent route.`,
      });
    }
    // Only emit one rpo_read violation even if the spec has multiple
    // — repeating the same error per assignment is just noise.
    break;
  }

  // 2) ballPath (multi-handoff exchange).
  if (spec.ballPath && spec.ballPath.length > 0 && !enabled.has("handoff_chain")) {
    const chain = spec.ballPath.map((s) => `@${s.from} → @${s.to}`).join(", ");
    violations.push({
      capability: "handoff_chain",
      message:
        `Ball path (${chain}) requires the "handoff_chain" capability, which this playbook hasn't enabled. ` +
        `Either turn it on in the playbook's rules, or remove the ballPath and keep the play as a single ballcarrier.`,
    });
  }

  // 3) Designed QB run — kind:"carry" on a QB-id player with a runType
  //    that isn't a scramble. We only emit one violation even when the
  //    formation has multiple QBs (specialty variants) for the same
  //    "less noise" reason.
  const designedQbCarry = spec.assignments.find(isDesignedQbCarry);
  if (designedQbCarry && !enabled.has("designed_qb_run")) {
    const a = designedQbCarry.action as Extract<PlayerAssignment["action"], { kind: "carry" }>;
    const runTypeLabel = a.runType ?? "designed run";
    violations.push({
      capability: "designed_qb_run",
      message:
        `@${designedQbCarry.player} is the ballcarrier on a designed ${runTypeLabel}, which requires the "designed_qb_run" capability. ` +
        `Either turn it on in the playbook's rules, or hand the ball to a back instead.`,
    });
  }

  return violations.length === 0 ? { ok: true } : { ok: false, violations };
}

function isDesignedQbCarry(a: PlayerAssignment): boolean {
  if (a.action.kind !== "carry") return false;
  if (!QB_PLAYER_IDS.has(a.player.toUpperCase())) return false;
  const runType = a.action.runType;
  if (!runType) return false; // unspecified runType — let other validators handle it
  if (runType === "scramble") return false;
  return DESIGNED_QB_RUN_TYPES.has(runType);
}
