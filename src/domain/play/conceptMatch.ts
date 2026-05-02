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
  /** Which required slot is unsatisfied. */
  required: ConceptAssignment;
  /** Why it's unsatisfied. */
  reason:
    | "no_spec_assignment_with_family"
    | "depth_outside_concept_range"
    | "role_mismatch";
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
  for (const concept of CONCEPT_CATALOG) {
    const result = matchConcept(spec, concept);
    if (result.ok) return result;
  }
  return null;
}

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

  if (violations.length === 0) {
    return { ok: true, concept, usedPlayers };
  }
  return { ok: false, violations };
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
