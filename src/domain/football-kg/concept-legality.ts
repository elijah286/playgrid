/**
 * Concept ↔ variant legality — the single source of truth for "is this
 * concept playable in this variant under that variant's DEFAULT rules?"
 *
 * Why this exists (2026-05-28): variant validity used to be hand-typed in
 * each concept's `variants` array (concepts.ts) AND, separately, encoded
 * as per-variant capability defaults (settings.ts). The two drifted. The
 * `qb-draw` concept declared every flag variant even though flag defaults
 * forbid designed QB runs — so the public Library advertised a "QB Draw"
 * flag page that Cal could never actually compose into a default flag
 * playbook. (settings.ts records the SAME bug being fixed on the compose
 * path on 2026-05-12 — "an earlier ['designed_qb_run'] default let Cal
 * compose a QB Draw in a league that forbade it" — but that fix never
 * reached the Library, because the Library reads the concept's `variants`
 * array, not the runtime capability defaults.)
 *
 * The fix: DERIVE legality from one place. A concept's required advanced
 * capabilities come from its declared `structural` contract, mirroring
 * the three gates in `validatePlaySpecVsRules` (playSpecRules.ts) exactly:
 *
 *   structural.requiresRpoRead                          → "rpo_read"
 *   structural.requiresBallPathSteps >= 1               → "handoff_chain"
 *     (or requiresBallPathReturnsToOrigin)
 *   structural.requiresCarry.player === "qb" (designed) → "designed_qb_run"
 *
 * We derive from `structural` rather than the coarse `requiresCapabilities`
 * label because the latter is loosely assigned — e.g. `bubble-rpo` lists
 * the KG `"handoff"` capability, but its RPO give is not a ballPath chain,
 * so at runtime it does NOT require `handoff_chain`. `structural` matches
 * what the rule validator actually gates on, so this stays faithful to
 * compose-time behavior.
 */

import type { ConceptDef } from "./schemas/ConceptDef";
import type { SportVariant } from "@/domain/play/types";
import {
  defaultSettingsForVariant,
  type RuleCapability,
} from "@/domain/playbook/settings";
import { DESIGNED_QB_RUN_TYPES } from "@/domain/playbook/playSpecRules";

/**
 * The advanced rule-capabilities a concept's canonical composition
 * requires, derived from its `structural` contract. Mirrors the gate
 * logic in `validatePlaySpecVsRules` so the Library never advertises a
 * (concept, variant) pairing the compose path would reject.
 *
 * Pure-pass concepts (no `structural`) return `[]` — they're playable in
 * any variant they declare.
 */
export function requiredRuleCapabilitiesForConcept(
  concept: ConceptDef,
): RuleCapability[] {
  const out = new Set<RuleCapability>();
  const s = concept.structural;
  if (!s) return [];

  if (s.requiresRpoRead) out.add("rpo_read");

  if ((s.requiresBallPathSteps ?? 0) >= 1 || s.requiresBallPathReturnsToOrigin) {
    out.add("handoff_chain");
  }

  const carry = s.requiresCarry;
  if (carry?.player === "qb") {
    // A QB carry needs `designed_qb_run` unless its only runType is a
    // scramble (which is gated by `rushingAllowed`, not this capability).
    // Mirrors `isDesignedQbCarry` in playSpecRules.ts.
    const designed =
      !carry.runTypes ||
      carry.runTypes.length === 0 ||
      carry.runTypes.some((rt) => DESIGNED_QB_RUN_TYPES.has(rt));
    if (designed) out.add("designed_qb_run");
  }

  return [...out];
}

/**
 * True when `variant`'s DEFAULT rule-set permits this concept (its default
 * `advancedCapabilities` ⊇ the concept's required set). This is the
 * "stock Library page" gate: a coach can still opt into the capability in
 * their playbook rules to unlock the concept, but it is not offered by
 * default for that variant.
 */
export function isConceptLegalByDefault(
  concept: ConceptDef,
  variant: SportVariant,
): boolean {
  const required = requiredRuleCapabilitiesForConcept(concept);
  if (required.length === 0) return true;
  const caps = new Set(defaultSettingsForVariant(variant).advancedCapabilities);
  return required.every((c) => caps.has(c));
}

/**
 * The subset of a concept's declared `variants` that are legal under each
 * variant's DEFAULT rules. The Library projection should render stock
 * pages from THIS, not from the raw `variants` array, so it can't
 * advertise a pairing the compose path would reject.
 */
export function defaultLegalVariantsForConcept(
  concept: ConceptDef,
): SportVariant[] {
  return concept.variants.filter((v) => isConceptLegalByDefault(concept, v));
}
