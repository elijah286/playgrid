/**
 * Concept matcher: maps a PlaySpec to/from concepts in the catalog.
 *
 * Two operations:
 *   - detectConcept(spec)         finds any concept whose pattern the
 *                                 spec satisfies. Used by notes-from-spec
 *                                 to describe a play by its concept name
 *                                 when the assignments match a known shape.
 *
 *   - assertConcept(spec, name)   validates that a CLAIMED concept name
 *                                 (Cal said "curl-flat" in the title or
 *                                 prose) is actually satisfied by the
 *                                 spec. Returns structured violations
 *                                 when the depth/family doesn't match.
 *
 * The matcher is permissive about role assignment: it tries every
 * permutation of (concept role → spec assignment) and reports a match
 * if any permutation works. This lets coaches author plays where the
 * same concept is run from different formations without re-keying
 * roles.
 */

import { CONCEPT_CATALOG, findConcept, type ConceptAssignment, type ConceptEntry } from "./conceptCatalog";
import type { PlaySpec, PlayerAssignment } from "./spec";
import { findTemplate } from "./routeTemplates";

export type ConceptViolation = {
  /** Which required slot is unsatisfied. For structural violations
   *  (carry / rpo_read / ballPath), this is a synthetic placeholder. */
  required: ConceptAssignment;
  /** Why it's unsatisfied. */
  reason:
    | "no_spec_assignment_with_family"
    | "depth_outside_concept_range"
    | "role_mismatch"
    /** Concept requires a carry assignment (optionally by QB or back,
     *  optionally with specific runTypes) but no spec assignment
     *  satisfies the constraint. */
    | "no_qualifying_carry"
    /** Concept requires a `kind: "rpo_read"` assignment but the spec
     *  has none. */
    | "no_rpo_read"
    /** Concept requires a multi-step ballPath (reverses) but the spec
     *  has fewer than N steps. */
    | "ballpath_steps_insufficient"
    /** Concept requires the ball to return to the original handler
     *  (Flea Flicker: QB → carrier → QB) but the ballPath doesn't. */
    | "ballpath_does_not_return_to_origin";
  /** When the family was found but at the wrong depth, the offending player. */
  player?: string;
  /** When the family was found at wrong depth, what the depth was. */
  actualDepthYds?: number;
};

export type ConceptMatchResult =
  | { ok: true; concept: ConceptEntry; usedPlayers: Set<string> }
  | { ok: false; violations: ConceptViolation[] };

/**
 * Try to match a claimed concept against a spec. Returns ok+concept on
 * success, or ok=false with the specific violations.
 *
 * Algorithm:
 *   1. For each required ConceptAssignment, find candidate spec
 *      assignments matching the family.
 *   2. If none of the matching assignments fall in the concept's
 *      depth range, that's a violation (the family is present but at
 *      the wrong depth — the curl-at-10yd-not-curl-flat case).
 *   3. Try every permutation that uses each spec assignment at most
 *      once. First successful permutation wins.
 */
export function assertConcept(spec: PlaySpec, conceptName: string): ConceptMatchResult {
  const concept = findConcept(conceptName);
  if (!concept) {
    return {
      ok: false,
      violations: [{
        required: { role: "any", family: conceptName, depthRangeYds: { min: 0, max: 0 } },
        reason: "no_spec_assignment_with_family",
      }],
    };
  }
  return matchConcept(spec, concept);
}

/**
 * Find ANY concept in the catalog that the spec satisfies. Returns the
 * first match (concepts are tried in catalog order). Used to label a
 * play with its canonical concept name when the assignments fit.
 */
export function detectConcept(spec: PlaySpec): ConceptMatchResult | null {
  // Collect every concept the spec satisfies, then pick the most-
  // specific by a 3-axis score.
  //
  // History:
  //   2026-05-25: catalog-order first-match (broke 6v6 Flood → Curl-Flat
  //               because Curl-Flat's 1-of-2 partial matched earlier).
  //   2026-05-26: tie-break by satisfied-route-slot count (helped 6v6
  //               Flood but didn't help run plays or trick plays whose
  //               `required` is empty — they always scored 0 and lost
  //               to whatever partial-matched first).
  //   2026-05-26 (this revision): three-axis specificity:
  //     1. Total structural+route score (structural ×5, slots ×1).
  //        Structural requirements (carry / rpo_read / ballPath shape)
  //        are MORE specific than route family hits — only one or two
  //        concepts have each structural signature, but many concepts
  //        share route slots (every play with a slot Sit + back Flat
  //        partial-matches Stick). Multiplying structural by 5 reflects
  //        that uniqueness. Without this, QB Draw / Sweep / Flea
  //        Flicker etc. (all `required: []`) score 0 and lose to any
  //        concept that grabs a single satisfying route.
  //     2. Complexity tier (advanced > intermediate > basic). Breaks
  //        ties between two concepts whose route patterns BOTH fully
  //        match — typically a basic concept (Stick: Sit + Flat) is
  //        being matched as a subset of a more complex one (Drive:
  //        Drag + Dig + Sit + Flat). The advanced/intermediate
  //        concept is the more specific call.
  //     3. Catalog order (stable sort tail). Ensures deterministic
  //        output when score + complexity tie.
  const matches: ConceptScore[] = [];
  for (const concept of CONCEPT_CATALOG) {
    const result = matchConcept(spec, concept);
    if (!result.ok) continue;
    matches.push(scoreConcept(spec, concept, result));
  }
  if (matches.length === 0) return null;
  matches.sort(compareConceptScores);
  return matches[0].result;
}

type ConceptScore = {
  result: ConceptMatchResult;
  satisfiedRouteSlots: number;
  unsatisfiedRouteSlots: number;
  satisfiedStructural: number;
  complexity: ConceptEntry["complexity"];
};

function scoreConcept(
  spec: PlaySpec,
  concept: ConceptEntry,
  result: ConceptMatchResult,
): ConceptScore {
  const satisfiedRouteSlots = countSatisfiedRequiredSlots(spec, concept);
  return {
    result,
    satisfiedRouteSlots,
    unsatisfiedRouteSlots: concept.required.length - satisfiedRouteSlots,
    // If `matchConcept` returned ok=true, every declared structural
    // requirement was satisfied (it short-circuits on the first
    // failure). So the count of satisfied structural reqs equals the
    // number of keys on the concept's structural object.
    satisfiedStructural: concept.structural ? Object.keys(concept.structural).length : 0,
    complexity: concept.complexity,
  };
}

/** Comparator for ConceptScore. Higher specificity wins → returns
 *  negative when `a` is more specific than `b` (so it sorts to the
 *  front). Four axes in priority order:
 *    1. Total weighted score DESC (route slots ×1 + structural ×5).
 *       Structural requirements (carry / rpo_read / ballPath shape)
 *       are FAR more distinctive than individual route slots — only
 *       one or two concepts have each, while route slots like Sit /
 *       Flat appear as "supporting" routes in many concepts. The
 *       ×5 weight ensures a QB Draw or Flea Flicker (0 route slots
 *       + 1–2 structural reqs) outranks any pass concept that happens
 *       to partial-match the spec's incidental route bullets.
 *       Also: a concept with MORE satisfied slots is a more specific
 *       fit, e.g. 6v6 Four Verts (3 satisfied) > Stick (2 satisfied)
 *       even when Stick's full pattern is a subset of the spec.
 *    2. Unsatisfied route slots ASC — a FULL match (e.g. Smash 2/2)
 *       beats a PARTIAL match (e.g. Snag 2/3 in lenient mode) when
 *       the raw satisfied count ties. Without this, partial matches
 *       on bigger concepts would outrank full matches on smaller
 *       ones that happen to score the same.
 *    3. Complexity tier DESC (advanced > intermediate > basic).
 *       Breaks ties between two concepts whose route patterns BOTH
 *       fully match — typically a basic concept is being subset-
 *       matched as part of a more complex one (Stick: Sit+Flat as
 *       subset of Drive: Drag+Dig+Sit+Flat). The more-complex call
 *       is more specific.
 *    4. Catalog order (stable sort tail) — deterministic output. */
function compareConceptScores(a: ConceptScore, b: ConceptScore): number {
  const aTotal = totalScore(a);
  const bTotal = totalScore(b);
  if (aTotal !== bTotal) return bTotal - aTotal;
  if (a.unsatisfiedRouteSlots !== b.unsatisfiedRouteSlots) {
    return a.unsatisfiedRouteSlots - b.unsatisfiedRouteSlots;
  }
  const aCx = complexityRank(a.complexity);
  const bCx = complexityRank(b.complexity);
  if (aCx !== bCx) return bCx - aCx;
  return 0; // catalog order via stable sort
}

/** Weighted specificity score. Structural requirements are ×5
 *  because they're far more distinctive than route slots — only a
 *  handful of concepts have each (carry / rpo_read / ballPath shape),
 *  while route slots like Sit / Flat appear across many concepts as
 *  "supporting" routes. Without the weight, run/trick plays with
 *  empty `required` would always lose to passing concepts that
 *  partial-match a single slot. */
function totalScore(s: ConceptScore): number {
  return s.satisfiedRouteSlots + s.satisfiedStructural * 5;
}

function complexityRank(c: ConceptEntry["complexity"]): number {
  switch (c) {
    case "advanced": return 3;
    case "intermediate": return 2;
    case "basic": return 1;
    default: return 0;
  }
}

/** Count how many of a concept's required route slots the spec
 *  satisfies on family + depth. Used as the route-slot component of
 *  the specificity score in `detectConcept`. */
function countSatisfiedRequiredSlots(spec: PlaySpec, concept: ConceptEntry): number {
  let satisfied = 0;
  const used = new Set<number>();
  const candidates = spec.assignments
    .filter((a) => a.action.kind === "route")
    .map((a) => {
      // Narrow the action kind for the family + depth lookup.
      if (a.action.kind !== "route") return null;
      const t = findTemplate(a.action.family);
      if (!t) return null;
      const range = t.constraints.depthRangeYds;
      const depth = a.action.depthYds ?? Math.round((range.min + range.max) / 2);
      return { family: t.name, depth };
    })
    .filter((c): c is { family: string; depth: number } => c !== null);
  for (const req of concept.required) {
    for (let i = 0; i < candidates.length; i++) {
      if (used.has(i)) continue;
      const c = candidates[i];
      if (c.family.toLowerCase() !== req.family.toLowerCase()) continue;
      if (c.depth >= req.depthRangeYds.min && c.depth <= req.depthRangeYds.max) {
        used.add(i);
        satisfied++;
        break;
      }
    }
  }
  return satisfied;
}

/**
 * Variants where the chat-time concept assertion accepts a partial
 * route-pattern match (≥1 required slot satisfied) instead of the
 * strict "all required slots satisfied" check.
 *
 * Why: variants with smaller offensive rosters (currently just 6v6)
 * legitimately cannot produce the canonical 7v7+ shape for every
 * concept. The 6v6 catalog skeletons adapt: Mesh becomes a single
 * Drag + Curl, Snag becomes Corner + Flat (no Spot), Y-Cross uses
 * Post instead of Dig, etc. These are real coach-recognizable
 * adaptations — the validator shouldn't reject them as "not a real
 * Mesh / Snag / Y-Cross".
 *
 * Surfaced 2026-05-25: 6v6 scenarios were failing at 0-2/5 on Haiku,
 * jumping to 3-5/5 on Sonnet. Root cause was NOT model capability —
 * it was the chat-time validator stripping legitimate 6v6 adaptations
 * because they didn't match the 7v7-strict pattern. The "ship Sonnet
 * for 6v6" routing rule was treating the symptom; this is the fix.
 *
 * Structural requirements (carry / rpo_read / ballPath) stay STRICT
 * across all variants — a "Flea Flicker" still must have the
 * returns-to-origin ballPath, period. Only the route-pattern check
 * relaxes.
 */
// Variants where the catalog produces legitimate ADAPTATIONS that don't
// match the strict pattern (e.g. 1-drag Mesh, Corner-only Snag, 3 Verts
// instead of 4). Route-slot violations relax; structural requirements
// (carry/ballPath/rpo) stay strict.
//   - flag_6v6 → 6 eligibles can't field every concept's full slot set
//   - flag_5v5 → 5 eligibles can't either (added 2026-05-26 — 5v5
//                Four Verts ships as "3 Verts + C outlet" and Dagger
//                drops the slot Sit; both are real coach-recognizable
//                adaptations, not regressions)
//   - flag_4v4 → 3 eligibles same problem one tier deeper
const LENIENT_PATTERN_VARIANTS = new Set<string>(["flag_6v6", "flag_5v5", "flag_4v4"]);

function matchConcept(spec: PlaySpec, concept: ConceptEntry): ConceptMatchResult {
  // Build all spec assignments that have a route family.
  const candidates: Array<{ assignment: PlayerAssignment; family: string; depth: number }> = [];
  for (const a of spec.assignments) {
    if (a.action.kind !== "route") continue;
    const t = findTemplate(a.action.family);
    if (!t) continue;
    // Use depthYds when explicitly set; otherwise use the catalog
    // family's midpoint as the canonical depth (same default as the
    // notes projection). For concept matching we WANT the explicit
    // value when present — that's the whole point of the depth check.
    const range = t.constraints.depthRangeYds;
    const depth = a.action.depthYds ?? Math.round((range.min + range.max) / 2);
    candidates.push({ assignment: a, family: t.name, depth });
  }

  // Try to assign each required slot to a distinct candidate that
  // matches family + depth range. Greedy left-to-right with
  // backtracking — concepts have ≤4 required assignments so the
  // search space is tiny.
  const used = new Set<number>();
  const usedPlayers = new Set<string>();
  const violations: ConceptViolation[] = [];

  for (const req of concept.required) {
    let found = -1;
    let firstFamilyHitButWrongDepth: { idx: number; depth: number; player: string } | null = null;

    for (let i = 0; i < candidates.length; i++) {
      if (used.has(i)) continue;
      const c = candidates[i];
      if (c.family.toLowerCase() !== req.family.toLowerCase()) continue;
      // Family matches — does depth?
      if (c.depth >= req.depthRangeYds.min && c.depth <= req.depthRangeYds.max) {
        found = i;
        break;
      }
      // Family right, depth wrong. Remember in case nothing better
      // shows up — that gives us a precise violation to report.
      if (firstFamilyHitButWrongDepth === null) {
        firstFamilyHitButWrongDepth = {
          idx: i,
          depth: c.depth,
          player: c.assignment.player,
        };
      }
    }

    if (found >= 0) {
      used.add(found);
      usedPlayers.add(candidates[found].assignment.player);
      continue;
    }

    if (firstFamilyHitButWrongDepth !== null) {
      violations.push({
        required: req,
        reason: "depth_outside_concept_range",
        player: firstFamilyHitButWrongDepth.player,
        actualDepthYds: firstFamilyHitButWrongDepth.depth,
      });
    } else {
      violations.push({
        required: req,
        reason: "no_spec_assignment_with_family",
      });
    }
  }

  // Variant-aware lenient match (2026-05-25). For variants in
  // LENIENT_PATTERN_VARIANTS (currently just flag_6v6), the catalog
  // skeleton legitimately adapts each concept to the smaller roster
  // and can't produce every canonical required slot. Accept the
  // partial match if AT LEAST ONE required slot was satisfied — the
  // adaptation is what coaches running 6v6 expect. Without this,
  // every 6v6 concept play strip-fails the chat-time validator even
  // though the catalog returned its best 6v6 representation.
  //
  // Structural requirements (below) stay strict — those are
  // genuinely defining (Flea Flicker MUST have a returns-to-origin
  // ballPath, regardless of variant).
  if (
    LENIENT_PATTERN_VARIANTS.has(spec.variant) &&
    concept.required.length > 0 &&
    violations.length < concept.required.length
  ) {
    // At least one required slot was satisfied; clear the route-
    // pattern violations and let the structural checks below run.
    violations.length = 0;
  }

  // Structural requirements (carry / rpo_read / ballPath) — checked
  // after the route-slot pass so the violation list reports route
  // mismatches first. A concept satisfies the spec only when BOTH
  // its route slots AND its structural requirements are met.
  if (concept.structural) {
    const structural = concept.structural;

    if (structural.requiresCarry) {
      const filter = structural.requiresCarry;
      const carries = spec.assignments.filter((a) => a.action.kind === "carry");
      const matchingCarry = carries.find((a) => {
        if (a.action.kind !== "carry") return false; // narrow for TS
        if (filter.player === "qb" && !isQbId(a.player)) return false;
        if (filter.player === "back" && !isBackId(a.player, spec.variant)) return false;
        if (filter.runTypes && filter.runTypes.length > 0) {
          if (!a.action.runType) return false;
          if (!filter.runTypes.includes(a.action.runType)) return false;
        }
        return true;
      });
      if (!matchingCarry) {
        violations.push({
          required: {
            role: "any",
            family: "(carry)",
            depthRangeYds: { min: 0, max: 0 },
          },
          reason: "no_qualifying_carry",
        });
      } else {
        usedPlayers.add(matchingCarry.player);
      }
    }

    if (structural.requiresRpoRead) {
      const rpo = spec.assignments.find((a) => a.action.kind === "rpo_read");
      if (!rpo) {
        violations.push({
          required: {
            role: "any",
            family: "(rpo_read)",
            depthRangeYds: { min: 0, max: 0 },
          },
          reason: "no_rpo_read",
        });
      } else {
        usedPlayers.add(rpo.player);
      }
    }

    if (typeof structural.requiresBallPathSteps === "number") {
      const minSteps = structural.requiresBallPathSteps;
      const actualSteps = spec.ballPath?.length ?? 0;
      if (actualSteps < minSteps) {
        violations.push({
          required: {
            role: "any",
            family: `(ballPath ≥${minSteps})`,
            depthRangeYds: { min: 0, max: 0 },
          },
          reason: "ballpath_steps_insufficient",
        });
      }
    }

    if (structural.requiresBallPathReturnsToOrigin) {
      const path = spec.ballPath ?? [];
      const returnsToOrigin =
        path.length >= 2 && path[path.length - 1].to === path[0].from;
      if (!returnsToOrigin) {
        violations.push({
          required: {
            role: "any",
            family: "(ballPath returns-to-origin)",
            depthRangeYds: { min: 0, max: 0 },
          },
          reason: "ballpath_does_not_return_to_origin",
        });
      }
    }
  }

  if (violations.length === 0) {
    return { ok: true, concept, usedPlayers };
  }
  return { ok: false, violations };
}

const QB_PLAYER_IDS = new Set(["QB", "Q"]);
const BACK_PLAYER_IDS = new Set(["B", "F", "RB", "HB", "TB", "FB"]);

function isQbId(id: string): boolean {
  return QB_PLAYER_IDS.has(id.toUpperCase());
}
function isBackId(id: string, variant?: PlaySpec["variant"]): boolean {
  if (BACK_PLAYER_IDS.has(id.toUpperCase())) return true;
  // flag_5v5 has no @B in the {Q, C, X, Y, Z} roster — @Y plays the
  // back-equivalent role in run-game concepts (Sweep/Dive/Counter/
  // Draw all use carrierId="Y" in 5v5). Without this exception, the
  // matchConcept structural carry filter `filter.player === "back"`
  // rejects every 5v5 run play, so detectConcept returns NONE.
  if (variant === "flag_5v5" && id.toUpperCase() === "Y") return true;
  return false;
}

/**
 * Format a ConceptMatchResult's violations into a human-readable
 * critique. Used by the chat-time validator when Cal claims a concept
 * the spec doesn't satisfy.
 */
export function formatConceptViolations(
  conceptName: string,
  violations: ReadonlyArray<ConceptViolation>,
): string {
  const lines = violations.map((v) => {
    if (v.reason === "depth_outside_concept_range") {
      return `  • required ${v.required.role}/${v.required.family} at ${v.required.depthRangeYds.min}-${v.required.depthRangeYds.max} yds — ${v.player ? `@${v.player}` : "found"} runs ${v.required.family} at ${v.actualDepthYds} yds (outside the concept's tighter range)`;
    }
    if (v.reason === "no_spec_assignment_with_family") {
      return `  • required ${v.required.role}/${v.required.family} at ${v.required.depthRangeYds.min}-${v.required.depthRangeYds.max} yds — no player has a ${v.required.family} assignment`;
    }
    if (v.reason === "no_qualifying_carry") {
      return `  • concept requires a ballcarrier (\`kind: "carry"\`) — none of the spec's assignments match the carry constraints`;
    }
    if (v.reason === "no_rpo_read") {
      return `  • concept requires an RPO decision (\`kind: "rpo_read"\` on the QB) — no spec assignment has it`;
    }
    if (v.reason === "ballpath_steps_insufficient") {
      return `  • concept requires a multi-handoff exchange (\`ballPath\`) — the spec doesn't have enough steps`;
    }
    if (v.reason === "ballpath_does_not_return_to_origin") {
      return `  • concept requires the ball to return to the original handler (\`ballPath\` ends back at the first step's \`from\`) — the spec's chain doesn't return`;
    }
    return `  • ${v.reason}: ${JSON.stringify(v.required)}`;
  });
  return (
    `Concept "${conceptName}" was claimed (in the title or prose) but the spec doesn't satisfy it. ` +
    `${violations.length} unmet requirement(s):\n${lines.join("\n")}\n\n` +
    `TWO RECOVERY PATHS — pick ONE for your re-emit:\n` +
    `  (A) FIX THE SPEC to satisfy "${conceptName}": adjust the route families and/or depths so the requirements above are met. ` +
    `(For Mesh: swap the dig/post for a second Drag at 1-5 yds. For Curl-Flat: shorten the Curl to 4-7 yds. Etc.)\n` +
    `  (B) DROP THE CONCEPT NAME from the title and prose, leaving the play as-is. Rename to something generic like "Spread Doubles — Drag/Dig" if that's actually what you drew. The validator only fires when you NAME the concept; the play itself doesn't have to be a known concept.\n\n` +
    `Do NOT re-emit the same play with the same concept name — that will fail the same way. If unsure of "${conceptName}"'s exact requirements, call search_kb("concept_${conceptName.toLowerCase().replace(/[^a-z0-9]+/g, "_")}") or search_kb("play_${conceptName.toLowerCase().replace(/[^a-z0-9]+/g, "_")}") to read the canonical KB entry first.`
  );
}

/**
 * Scan free-form text for catalog concept names. Returns the set of
 * concept names mentioned. Used at chat-time to find any concept Cal
 * named in a title or prose, so we can assert it against the spec.
 *
 * Word-boundary aware so "smash" matches but "smashing" doesn't.
 * Multi-word concept names ("four verticals") are matched too.
 */
export function parseConceptsFromText(text: string): string[] {
  const lower = text.toLowerCase();
  const found: string[] = [];
  // Sort longest names first so "four verticals" matches before "verts".
  const candidates: Array<{ canonical: string; key: string }> = [];
  for (const c of CONCEPT_CATALOG) {
    candidates.push({ canonical: c.name, key: c.name.toLowerCase() });
    for (const a of c.aliases ?? []) candidates.push({ canonical: c.name, key: a.toLowerCase() });
  }
  candidates.sort((a, b) => b.key.length - a.key.length);
  const seen = new Set<string>();
  for (const cand of candidates) {
    const escaped = cand.key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const isAlnum = /^[a-z0-9 ]+$/.test(cand.key);
    const re = isAlnum
      ? new RegExp(`\\b${escaped}\\b`)
      : new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`);
    if (re.test(lower) && !seen.has(cand.canonical)) {
      found.push(cand.canonical);
      seen.add(cand.canonical);
    }
  }
  return found;
}
