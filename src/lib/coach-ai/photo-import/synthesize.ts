/**
 * Photo-import synthesis: PlayExtraction → PlaySpec.
 *
 * Deterministic TypeScript, no LLM. The vision model named semantics
 * (formation, route families, depths); this module lands them on the
 * canonical PlaySpec so the play rides the existing resolver → renderer
 * → sanitizer path (AGENTS.md Rules 2/4/10) and is exactly as
 * well-formed as a Cal-composed play.
 *
 * The two design problems this module owns:
 *
 * 1. FORMATION SNAP. Specs reference formations by name; the renderer
 *    synthesizes player positions from that name. We try the model's
 *    formation call first, then a receiver-distribution-derived guess,
 *    then Spread Doubles — the first candidate the synthesizer accepts
 *    wins, and anything past the first candidate is surfaced as a
 *    warning for the review UI.
 *
 * 2. PLAYER MAPPING. The sheet's letters (X/Y/Z/A/B...) rarely match
 *    the catalog roster's slot ids. Both sides are sorted left-to-right
 *    (sheet: orderFromLeft; roster: x) and zipped. The mapping is
 *    returned so the review UI can show "sheet A → diagram H" and keep
 *    the coach oriented. We deliberately do NOT relabel diagram players
 *    to sheet letters: spec assignments must reference roster ids
 *    (spec.ts invariant 1), and a renamed diagram would diverge from
 *    the spec that re-renders it.
 *
 * Depth handling: values are clamped into the family's catalog range
 * (and under the playbook's max-throw cap when set) BEFORE the spec is
 * built, with a warning per adjustment — an import should never
 * dead-end on a validator reject the coach can't see coming.
 */

import { synthesizeOffense } from "@/domain/play/offensiveSynthesize";
import { findTemplate } from "@/domain/play/routeTemplates";
import type { PlaySpec, PlayerAssignment, AssignmentAction, RouteModifier, Confidence } from "@/domain/play/spec";
import { PLAY_SPEC_SCHEMA_VERSION } from "@/domain/play/spec";
import type { SportVariant } from "@/domain/play/types";
import type { ExtractedAssignment, ExtractedPlayer, PlayExtraction } from "./schema";

export type ImportWarning = {
  code:
    | "formation_fallback"
    | "formation_unresolved"
    | "player_count_mismatch"
    | "player_unmapped"
    | "player_unassigned"
    | "family_unknown"
    | "depth_raised"
    | "depth_capped"
    | "depth_over_throw_cap"
    | "assignment_skipped";
  message: string;
};

export type PlayerMapping = {
  sheetLabel: string;
  rosterId: string;
};

export type SynthesisResult = {
  spec: PlaySpec;
  warnings: ImportWarning[];
  /** sheet letter → roster slot id, in left-to-right sheet order. */
  mapping: PlayerMapping[];
};

const ROUTE_MODIFIERS: readonly RouteModifier[] = [
  "hot",
  "sit_vs_zone",
  "option",
  "motion",
  "delayed",
  "rub",
  "alert",
];

function isRouteModifier(value: string): value is RouteModifier {
  return (ROUTE_MODIFIERS as readonly string[]).includes(value);
}

/** Roster ids that are never mapping targets: the snap/QB pair plus
 *  tackle-11 interior line. Everything else is a skill slot. */
const NON_SKILL_ROSTER_IDS = new Set(["QB", "C", "LT", "LG", "RG", "RT"]);

function isSheetSpecialLabel(label: string): boolean {
  const l = label.trim().toUpperCase();
  return l === "C" || l === "Q" || l === "QB";
}

/** Observed skill players (no C/Q), sorted left-to-right as drawn. */
export function observedSkillPlayers(extraction: PlayExtraction): ExtractedPlayer[] {
  return extraction.players
    .filter((p) => !isSheetSpecialLabel(p.label))
    .slice()
    .sort((a, b) => a.orderFromLeft - b.orderFromLeft);
}

/** Ordered formation-name candidates: the model's call (with strength
 *  suffix variant), a receiver-distribution guess, then the default. */
export function formationCandidates(extraction: PlayExtraction): string[] {
  const candidates: string[] = [];
  const push = (name: string | undefined | null) => {
    const n = name?.trim();
    if (n && !candidates.some((c) => c.toLowerCase() === n.toLowerCase())) candidates.push(n);
  };

  const named = extraction.formation.name;
  push(named);
  const strength = extraction.formation.strength;
  if (named && strength && strength !== "balanced" && !/\b(left|right|strong|weak)\b/i.test(named)) {
    push(`${named} ${strength === "left" ? "Left" : "Right"}`);
  }

  const skill = observedSkillPlayers(extraction);
  const left = skill.filter((p) => p.side === "left").length;
  const right = skill.filter((p) => p.side === "right").length;
  if (left >= 3 && right <= 2) push("Trips Left");
  else if (right >= 3 && left <= 2) push("Trips Right");

  push("Spread Doubles");
  return candidates;
}

type RosterSlot = { id: string; x: number };

function rosterSkillSlots(variant: SportVariant, formationName: string): RosterSlot[] | null {
  const synth = synthesizeOffense(variant, formationName);
  if (!synth) return null;
  return synth.players
    .filter((p) => !NON_SKILL_ROSTER_IDS.has(p.id))
    .map((p) => ({ id: p.id, x: p.x }))
    .sort((a, b) => a.x - b.x);
}

function buildRouteAction(
  extracted: ExtractedAssignment,
  sheetLabel: string,
  maxThrowDepthYds: number | null | undefined,
  warnings: ImportWarning[],
): AssignmentAction {
  const template = extracted.family ? findTemplate(extracted.family) : null;
  if (!template) {
    warnings.push({
      code: "family_unknown",
      message: `${sheetLabel}: route family "${extracted.family ?? "(none)"}" isn't in the catalog — imported as unassigned. Pick a route in the review step.`,
    });
    return { kind: "unspecified" };
  }

  const { min, max } = template.constraints.depthRangeYds;
  let depthYds =
    typeof extracted.depthYds === "number" && Number.isFinite(extracted.depthYds)
      ? Math.round(extracted.depthYds)
      : undefined;
  let nonCanonical = false;

  if (depthYds !== undefined) {
    if (depthYds < min) {
      warnings.push({
        code: "depth_raised",
        message: `${sheetLabel}: ${template.name} read at ${depthYds} yd — ${template.name}s run ${min}-${max} yd, raised to ${min}.`,
      });
      depthYds = min;
    } else if (depthYds > max) {
      warnings.push({
        code: "depth_capped",
        message: `${sheetLabel}: ${template.name} read at ${depthYds} yd — ${template.name}s run ${min}-${max} yd, capped at ${max}. If the drawing really goes deeper, a different family may fit better.`,
      });
      depthYds = max;
    }
  }

  if (
    typeof maxThrowDepthYds === "number" &&
    Number.isFinite(maxThrowDepthYds) &&
    depthYds !== undefined &&
    depthYds > maxThrowDepthYds
  ) {
    if (maxThrowDepthYds < min) {
      // The playbook's throw cap sits below the family's floor. Honor
      // the cap (it's coach-stated) and mark the route nonCanonical —
      // that flag exists exactly for legitimate off-catalog depths.
      warnings.push({
        code: "depth_over_throw_cap",
        message: `${sheetLabel}: ${template.name} capped at this playbook's ${maxThrowDepthYds}-yd max throw depth (family normally runs ${min}+).`,
      });
      depthYds = Math.round(maxThrowDepthYds);
      nonCanonical = true;
    } else {
      warnings.push({
        code: "depth_over_throw_cap",
        message: `${sheetLabel}: ${template.name} read at ${depthYds} yd — capped at this playbook's ${maxThrowDepthYds}-yd max throw depth.`,
      });
      depthYds = Math.round(maxThrowDepthYds);
    }
  }

  const modifiers = (extracted.modifiers ?? []).filter(isRouteModifier);

  return {
    kind: "route",
    family: template.name,
    ...(depthYds !== undefined ? { depthYds } : {}),
    ...(extracted.direction ? { direction: extracted.direction } : {}),
    ...(modifiers.length > 0 ? { modifiers } : {}),
    ...(nonCanonical ? { nonCanonical: true } : {}),
  };
}

function buildAction(
  extracted: ExtractedAssignment,
  sheetLabel: string,
  maxThrowDepthYds: number | null | undefined,
  warnings: ImportWarning[],
): AssignmentAction {
  switch (extracted.kind) {
    case "route":
      return buildRouteAction(extracted, sheetLabel, maxThrowDepthYds, warnings);
    case "carry":
      // A photographed carry is almost always a jet sweep / handoff
      // track; the renderer synthesizes a sensible default path from
      // runType when no waypoints are supplied.
      return { kind: "carry", runType: "sweep" };
    case "block":
      return { kind: "block" };
    case "motion":
      return { kind: "motion" };
    case "unclear":
      warnings.push({
        code: "player_unassigned",
        message: `${sheetLabel}: the drawn path couldn't be read${extracted.evidence ? ` (${extracted.evidence})` : ""} — imported as unassigned. Set a route in the review step.`,
      });
      return { kind: "unspecified" };
  }
}

export function synthesizePlaySpec(
  extraction: PlayExtraction,
  opts: {
    variant: SportVariant;
    /** Playbook's persistent max-throw-depth setting, when configured. */
    maxThrowDepthYds?: number | null;
    title?: string;
  },
): SynthesisResult {
  const warnings: ImportWarning[] = [];

  // ── 1. Formation snap ────────────────────────────────────────────
  const candidates = formationCandidates(extraction);
  let formationName: string | null = null;
  let roster: RosterSlot[] | null = null;
  for (const candidate of candidates) {
    const slots = rosterSkillSlots(opts.variant, candidate);
    if (slots) {
      formationName = candidate;
      roster = slots;
      break;
    }
  }
  if (!formationName || !roster) {
    // Should be unreachable (Spread Doubles parses for every variant),
    // but never crash an import over it.
    formationName = "Spread Doubles";
    roster = rosterSkillSlots(opts.variant, formationName) ?? [];
    warnings.push({
      code: "formation_unresolved",
      message: `No formation candidate parsed for variant ${opts.variant}; defaulted to Spread Doubles.`,
    });
  } else if (candidates[0] && formationName !== candidates[0]) {
    warnings.push({
      code: "formation_fallback",
      message: `Formation "${candidates[0]}" isn't a recognized alignment — imported as "${formationName}". Adjust in the review step if that's wrong.`,
    });
  }

  // ── 2. Player mapping (sheet letters → roster slots) ─────────────
  const observed = observedSkillPlayers(extraction);
  if (observed.length !== roster.length) {
    warnings.push({
      code: "player_count_mismatch",
      message: `The photo shows ${observed.length} route-running players but a ${opts.variant} ${formationName} has ${roster.length} skill slots — extra ${observed.length > roster.length ? "sheet players were dropped" : "slots were left unassigned"}.`,
    });
  }
  const mappedCount = Math.min(observed.length, roster.length);
  const mapping: PlayerMapping[] = [];
  const rosterIdBySheetLabel = new Map<string, string>();
  for (let i = 0; i < mappedCount; i++) {
    const sheetLabel = observed[i].label.trim().toUpperCase();
    mapping.push({ sheetLabel: observed[i].label, rosterId: roster[i].id });
    rosterIdBySheetLabel.set(sheetLabel, roster[i].id);
  }
  for (let i = mappedCount; i < observed.length; i++) {
    warnings.push({
      code: "player_unmapped",
      message: `Sheet player "${observed[i].label}" had no open slot in ${formationName} and was dropped.`,
    });
  }

  // ── 3. Assignments ────────────────────────────────────────────────
  const assignments: PlayerAssignment[] = [];
  const assignedRosterIds = new Set<string>();
  for (const extracted of extraction.assignments) {
    const sheetLabel = extracted.player.trim().toUpperCase();
    if (isSheetSpecialLabel(sheetLabel)) {
      // v1 imports offense skill assignments only; C blocks and Q's
      // dropback are implicit. A drawn QB run / center release is rare
      // enough to hand-fix in the editor.
      if (extracted.kind !== "block" && extracted.kind !== "unclear") {
        warnings.push({
          code: "assignment_skipped",
          message: `${extracted.player}: assignments for the center/QB aren't imported yet — add it in the editor if it matters.`,
        });
      }
      continue;
    }
    const rosterId = rosterIdBySheetLabel.get(sheetLabel);
    if (!rosterId) {
      warnings.push({
        code: "assignment_skipped",
        message: `"${extracted.player}" has an assignment but isn't among the mapped players — skipped.`,
      });
      continue;
    }
    if (assignedRosterIds.has(rosterId)) continue; // first read per player wins
    assignedRosterIds.add(rosterId);
    assignments.push({
      player: rosterId,
      action: buildAction(extracted, extracted.player, opts.maxThrowDepthYds, warnings),
      confidence: extracted.confidence as Confidence,
    });
  }

  // Roster slots nobody claimed: keep them honest (and visible in the
  // review UI) as explicit unassigned players rather than omitting.
  for (const slot of roster) {
    if (!assignedRosterIds.has(slot.id)) {
      const mapped = mapping.find((m) => m.rosterId === slot.id);
      warnings.push({
        code: "player_unassigned",
        message: `${mapped ? `Sheet player "${mapped.sheetLabel}" (slot ${slot.id})` : `Slot ${slot.id}`} has no readable assignment — set a route in the review step.`,
      });
      assignments.push({ player: slot.id, action: { kind: "unspecified" }, confidence: "low" });
    }
  }

  // ── 4. Spec ───────────────────────────────────────────────────────
  const strength = extraction.formation.strength;
  const spec: PlaySpec = {
    schemaVersion: PLAY_SPEC_SCHEMA_VERSION,
    variant: opts.variant,
    title: opts.title ?? extraction.title ?? "Imported play",
    playType: "offense",
    formation: {
      name: formationName,
      ...(strength === "left" || strength === "right" ? { strength } : {}),
      confidence: extraction.formation.confidence as Confidence,
    },
    assignments,
  };

  return { spec, warnings, mapping };
}
