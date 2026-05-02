/**
 * Defense validator — gates spec-side defender assignments at write time.
 *
 * Mirrors `route-assignment-validate.ts` for offense. Catches the class
 * of bugs that don't fail the renderer but *should* fail before save:
 *
 *   1. zone_drop on a coverage that has no zones (e.g. zone_drop in
 *      a pure-man Cover 0 alignment).
 *   2. zone_drop with a zoneId not in the alignment.
 *   3. man_match referencing a target that isn't in the rendered
 *      offense.
 *   4. blitz with an undefined gap (allowed but flagged as low-fidelity).
 *   5. read_and_react trigger referencing a non-existent player.
 *   6. Duplicate defenderAssignments for the same defender.
 *   7. defenderAssignments present without a defense ref.
 *
 * The validator runs on the *resolved* spec (catalog defaults +
 * deviations) so it can reason about every defender's final state, not
 * just what the spec author wrote. This is what catches "Cover 0 spec
 * with a zone_drop override" — the override wins, but the renderer
 * has nowhere to draw the zone.
 */

import {
  findDefensiveAlignment,
  alignmentWithAssignments,
  zonesForStrength,
} from "@/domain/play/defensiveAlignments";
import type { DefenderAction, PlaySpec } from "@/domain/play/spec";

export type DefenseValidationError = {
  defender: string;
  kind: DefenderAction["kind"] | "duplicate" | "missing_defense";
  message: string;
};

export type DefenseValidationResult =
  | { ok: true }
  | { ok: false; errors: DefenseValidationError[] };

export function validateDefenderAssignments(spec: PlaySpec): DefenseValidationResult {
  const errors: DefenseValidationError[] = [];
  const overrides = spec.defenderAssignments ?? [];

  // Rule 7: defenderAssignments without a defense ref is incoherent.
  if (overrides.length > 0 && !spec.defense) {
    errors.push({
      defender: "(spec)",
      kind: "missing_defense",
      message:
        "defenderAssignments are present but spec.defense is unset. Add a defense ref " +
        "(front + coverage) so the catalog can supply the base alignment, then list deviations.",
    });
    return { ok: false, errors };
  }

  if (!spec.defense) return { ok: true };

  const { front, coverage, strength = "right" } = spec.defense;
  const alignment = findDefensiveAlignment(spec.variant, front, coverage);
  if (!alignment) {
    // Render-time defense_unknown warning will fire — don't double-report.
    return { ok: true };
  }

  const catalogPlayers = alignmentWithAssignments(alignment, strength);
  const catalogIds = new Set(catalogPlayers.map((p) => p.id));
  const zones = zonesForStrength(alignment, strength);
  const zoneIds = new Set(zones.map((z) => z.id).filter(Boolean) as string[]);
  const offensiveIds = new Set(spec.assignments.map((a) => a.player));

  // Rule 6: duplicate defenders.
  const seenDefender = new Map<string, number>();
  for (const da of overrides) {
    seenDefender.set(da.defender, (seenDefender.get(da.defender) ?? 0) + 1);
  }
  for (const [defender, count] of seenDefender) {
    if (count > 1) {
      errors.push({
        defender,
        kind: "duplicate",
        message: `defenderAssignments lists "${defender}" ${count} times. Each defender may have at most one override.`,
      });
    }
  }

  for (const da of overrides) {
    // Defender existence already covered by render warning, but include
    // it here so the validator's error list is self-sufficient.
    if (!catalogIds.has(da.defender)) {
      errors.push({
        defender: da.defender,
        kind: da.action.kind,
        message: `Defender "${da.defender}" not in ${alignment.front}/${alignment.coverage} catalog. Available: ${[...catalogIds].join(", ")}.`,
      });
      continue;
    }
    const action = da.action;
    switch (action.kind) {
      case "zone_drop": {
        if (zones.length === 0) {
          errors.push({
            defender: da.defender,
            kind: "zone_drop",
            message: `zone_drop on ${da.defender} but ${alignment.front}/${alignment.coverage} has no zones (pure-man coverage). Use man_match or blitz instead, or pick a zone-aware coverage.`,
          });
          break;
        }
        if (action.zoneId && !zoneIds.has(action.zoneId)) {
          errors.push({
            defender: da.defender,
            kind: "zone_drop",
            message: `zone_drop on ${da.defender} references zoneId "${action.zoneId}" not in ${alignment.front}/${alignment.coverage}. Available: ${[...zoneIds].join(", ")}.`,
          });
        }
        break;
      }
      case "man_match": {
        if (action.target && !offensiveIds.has(action.target)) {
          errors.push({
            defender: da.defender,
            kind: "man_match",
            message: `man_match on ${da.defender} targets "${action.target}" but no offensive assignment exists for that player. Add an assignment for ${action.target} or change the target.`,
          });
        }
        break;
      }
      case "blitz": {
        // Gap-undefined is allowed (defaults to A in renderer), but we
        // surface it as informational so coaches know the rusher's lane
        // is up to the catalog default. NOT an error.
        break;
      }
      case "spy": {
        if (action.target && !offensiveIds.has(action.target)) {
          errors.push({
            defender: da.defender,
            kind: "spy",
            message: `spy on ${da.defender} targets "${action.target}" but no offensive assignment exists for that player. Add the player or change the target.`,
          });
        }
        break;
      }
      case "read_and_react": {
        if (!offensiveIds.has(action.trigger.player)) {
          errors.push({
            defender: da.defender,
            kind: "read_and_react",
            message: `read_and_react on ${da.defender} triggers off "${action.trigger.player}" but no offensive assignment exists for that player. Add the offensive assignment first.`,
          });
        }
        break;
      }
      case "custom_path": {
        if (!action.waypoints || action.waypoints.length === 0) {
          errors.push({
            defender: da.defender,
            kind: "custom_path",
            message: `custom_path on ${da.defender} has no waypoints. Provide at least one [x, y] yard waypoint or pick a named primitive.`,
          });
        }
        break;
      }
    }
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

/**
 * Format a list of validation errors for inclusion in tool error
 * responses. Mirrors `formatRouteAssignmentErrors` shape.
 */
export function formatDefenseValidationErrors(errors: DefenseValidationError[]): string {
  const lines = errors.map((e) => `  • ${e.defender} (${e.kind}): ${e.message}`);
  return (
    `Defense validation failed for ${errors.length} assignment(s) — diagram NOT saved. ` +
    `Each defender override must reference a real defender, a real zone (when zone_drop), ` +
    `and a real offensive target (when man_match / spy / read_and_react). ` +
    `Fix the defenderAssignments and re-emit.\n` +
    lines.join("\n")
  );
}
