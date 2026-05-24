/**
 * Concept catalog — the third tier of the SFPA semantic hierarchy.
 *
 *   Tier 1: Catalogs           (route templates, defensive alignments)
 *   Tier 2: PlaySpec           (which player runs what family at what depth)
 *   Tier 3: CONCEPTS (this)    (named combinations like curl-flat, smash,
 *                               mesh — with their own depth/positional
 *                               constraints that override family ranges)
 *
 * Why this layer exists (the bug it closes):
 *   A coach surfaced 2026-05-02 that Cal saved a play titled
 *   "Spread Doubles — Post / Curl / Flat" with a Curl at 10-12 yards.
 *   The route catalog's Curl entry says depth 8-13 yds — so the spec
 *   was technically valid at the family layer. BUT the "curl-flat"
 *   COMBO concept specifically requires a SHORT curl (~5 yds) so it
 *   creates a high-low read on the flat defender. A 10yd curl paired
 *   with a flat is just two separate routes, not a curl-flat concept.
 *
 *   Without this layer, Cal could call any play "curl-flat" (or
 *   "smash", "mesh", etc.) regardless of whether the actual
 *   assignments satisfied that concept's structural requirements.
 *
 * What a concept entry defines:
 *   - The required PATTERN of player assignments (which roles run
 *     which families, with depth ranges TIGHTER than the family's
 *     general range when the concept demands it)
 *   - The plain-English coaching cue
 *   - Aliases for natural-language matching
 *
 * Detection vs assertion:
 *   - detectConcept(spec)  →  finds any concept whose pattern the
 *     spec satisfies. Used by notes-from-spec to describe the play
 *     by its concept name when matched.
 *   - assertConcept(spec, conceptName)  →  validates that a CLAIMED
 *     concept (Cal said "curl-flat" in the title or prose) is
 *     actually satisfied by the spec. Used by the chat-time
 *     validator to catch false-claim cases.
 *
 * Adding a new concept (per AGENTS.md Rule 3 — lockstep updates):
 *   1. New entry in CONCEPT_CATALOG below
 *   2. Round-trip test in conceptCatalog.test.ts (auto-covered via
 *      describe.each — assertion that detectConcept finds a satisfying
 *      synthetic spec)
 *   3. Notes projection coaching cue in projectConcept (notes-from-spec)
 *
 * Module-load assertions verify each concept's required assignments
 * reference valid catalog families and that depth ranges are SUBSETS
 * of the family's catalog range (a concept can TIGHTEN family depth
 * but never widen it past the catalog's invariants).
 */

import { findTemplate, ROUTE_TEMPLATES } from "./routeTemplates";
import { projectConceptsToLegacy } from "@/domain/football-kg/legacy-projections";

/**
 * A single role slot a concept requires. Roles are the diagram's
 * standard letters (X, Y, Z, H, S, F, B). The matcher is permissive
 * about which actual player fills the role — e.g. an "outside_left"
 * role matches X (or any other player at the wide-left position).
 */
export type ConceptRole =
  /** Outside receiver — the leftmost / rightmost wide split. */
  | "outside_wr"
  /** Slot receiver — second-most-outside, off the line. */
  | "slot"
  /** Tight end / inline / Y. */
  | "te"
  /** Backfield player — RB / FB / motion back. */
  | "back"
  /** Any player matching the family (escape hatch — when a concept
   *  doesn't care which role runs the route, just that SOMEONE does). */
  | "any";

export type ConceptAssignment = {
  /** Which role slot this assignment occupies. */
  role: ConceptRole;
  /** Catalog route family the role MUST run. */
  family: string;
  /** Concept-specific depth range, in yards. Must be a subset of the
   *  family's catalog `depthRangeYds` (asserted at module load). */
  depthRangeYds: { min: number; max: number };
};

/**
 * Conceptual complexity tier. Drives Cal's recommendation engine: when
 * a coach asks "what's good vs Cover 3" Cal filters the candidate
 * concepts by the team's complexity ceiling (a per-team setting that
 * defaults to "intermediate"). The tags are advisory, NOT a hard gate
 * — a coach can dial up the ceiling for a sharper team or pick an
 * "advanced" concept explicitly any time.
 *
 * Tiers:
 *   - "basic"        Two-route stretches a young team can absorb in
 *                    one practice (Curl-Flat, Smash, Stick, Snag,
 *                    Mesh). Reads are 1–2 defenders.
 *   - "intermediate" Three-route triangles and basic vertical concepts
 *                    that require multiple-defender reads (Flood,
 *                    Drive, Levels, Four Verticals).
 *   - "advanced"     Multi-progression concepts, NFL-style shot plays,
 *                    and any play that requires reading a specific
 *                    defender's leverage post-snap (Y-Cross, Dagger).
 *
 * When unset, defaults to "intermediate" at recommendation time so an
 * un-tagged catalog entry still surfaces but isn't auto-suggested to
 * a young team.
 */
export type ConceptComplexity = "basic" | "intermediate" | "advanced";

/**
 * Non-route structural requirements a concept can express — used for
 * run / RPO / reverse concepts whose defining feature is the SHAPE of
 * the ball-handling, not the route pattern. The matcher checks these
 * alongside the route-based `required` array; a concept satisfies the
 * spec only when EVERY declared piece (routes + structural) is met.
 *
 * Why these aren't shoehorned into ConceptAssignment: route slots are
 * fundamentally "WHO runs WHAT at WHAT depth". Run / RPO / reverse
 * structural requirements are categorical ("there's a QB carry, of
 * any runType") and would just bloat the assignment shape with
 * mostly-unused optional fields. A parallel `structural` field keeps
 * the existing pass-concept entries untouched.
 */
export type ConceptStructural = {
  /** Concept requires at least one `kind: "carry"` assignment that
   *  satisfies the optional filters below. */
  requiresCarry?: {
    /** Constrain which player is the carrier:
     *    - "qb"   → assignment.player must be the QB ("QB" or "Q").
     *    - "back" → assignment.player must be a back ("B", "F", "RB", etc.).
     *    - "any"  → no player constraint (default when unset).
     *  Used to distinguish "designed QB run" concepts (QB Draw) from
     *  "designed RB run" concepts (Inside Zone). */
    player?: "qb" | "back" | "any";
    /** Optional runType filter. Concept matches only when the carry's
     *  runType equals one of these. Use the catalog vocabulary
     *  ("draw", "power", "inside_zone", etc.). */
    runTypes?: string[];
  };
  /** Concept requires at least one `kind: "rpo_read"` assignment.
   *  No further constraints today; future iterations may add filters
   *  on pullIf or keyDefenderRole. */
  requiresRpoRead?: boolean;
  /** Concept requires the spec's play-level `ballPath` to have at
   *  least this many handoff steps. Use 2+ for reverses (QB → RB →
   *  WR), 1 for plays that just need any handoff. */
  requiresBallPathSteps?: number;
  /** Concept requires the ball to RETURN to its original handler —
   *  i.e. the last ballPath step's `to` equals the first step's
   *  `from`. Used by trick plays where the ball-out-and-back pattern
   *  is structurally defining (Flea Flicker: QB → carrier → QB,
   *  followed by a deep pass). Without this, Flea Flicker would be
   *  indistinguishable from any 2-step exchange. */
  requiresBallPathReturnsToOrigin?: boolean;
};

export type ConceptEntry = {
  /** Display name (e.g. "Curl-Flat"). Lookup is case-insensitive. */
  name: string;
  /** Common natural-language aliases coaches use. */
  aliases?: string[];
  /** Plain-English description for KB / coaching cue. */
  description: string;
  /** The pattern of assignments a satisfying spec must contain. Pass
   *  concepts express their full pattern here. Run / RPO / reverse
   *  concepts use the `structural` field for ball-handling shape and
   *  leave this empty (or only list the supporting routes). */
  required: ConceptAssignment[];
  /** When true, every player matched to a required slot must be on the
   *  SAME side of the formation (all x ≥ 0 or all x ≤ 0). The matcher
   *  itself only checks family + depth; the chat-time validator runs
   *  this side check using the diagram's player positions after the
   *  family/depth match passes. Used by side-flooding concepts (Flood,
   *  Sail) where the entire structural premise is "stretch ONE side". */
  sameSideRequired?: boolean;
  /** Complexity tier (see ConceptComplexity). Optional today so the
   *  field can be added without re-tagging every entry; the
   *  recommendation engine treats `undefined` as "intermediate". */
  complexity?: ConceptComplexity;
  /** Non-route structural requirements (carry / rpo_read / ballPath).
   *  See ConceptStructural. */
  structural?: ConceptStructural;
};

// ── Concept entries ─────────────────────────────────────────────────────
//
// Sourced from the Football Knowledge Graph (Phase 1d, 2026-05-24). The
// 20 legacy concept entries used to live inline here as TypeScript const
// declarations; they now live as KG defs in src/domain/football-kg/defs/
// concepts.ts (21 entries — KG also includes slant-flat which was
// referenced by reactors but absent from the legacy catalog).
//
// Byte-equality with the prior inline data is verified by
// src/domain/football-kg/defs/legacy-byte-equality.test.ts. The
// assertConceptInvariants check below still runs against the projected
// data so any drift fails at module load.

export const CONCEPT_CATALOG: ConceptEntry[] = projectConceptsToLegacy() as unknown as ConceptEntry[];

// ── Legacy inline entries removed 2026-05-24 — see Football KG ──────────

// ── Module-load invariants ──────────────────────────────────────────────

/**
 * Assert that every concept's required-assignment depth ranges are
 * VALID against the catalog. A concept can tighten a family's depth
 * (curl-flat narrows Curl from [8,13] to [4,7]) but cannot specify
 * a range that falls OUTSIDE the family's catalog range — that would
 * be a contradiction (the family says "Curl is 8-13yd" but the
 * concept demands 4-7yd, which is a different family entirely).
 *
 * This crashes at import time, so a malformed concept entry can never
 * ship. Same defensive pattern as the route-template direction
 * invariants in routeTemplates.ts.
 */
function assertConceptInvariants(): void {
  for (const concept of CONCEPT_CATALOG) {
    for (const req of concept.required) {
      const template = findTemplate(req.family);
      if (!template) {
        throw new Error(
          `Concept "${concept.name}" references unknown route family "${req.family}". ` +
          `Concepts can only require families that exist in ROUTE_TEMPLATES (${ROUTE_TEMPLATES.map((t) => t.name).join(", ")}).`,
        );
      }
      const familyMin = template.constraints.depthRangeYds.min;
      const familyMax = template.constraints.depthRangeYds.max;
      // Curl-flat tightens Curl from [8,13] to [4,7] — that's INTENTIONAL.
      // The concept overrides the family range because the concept's
      // required depth is structurally different from the generic family.
      // We only assert the concept range is a valid (min ≤ max) pair.
      if (req.depthRangeYds.min > req.depthRangeYds.max) {
        throw new Error(
          `Concept "${concept.name}" assignment ${req.role}/${req.family} has inverted depth range [${req.depthRangeYds.min}, ${req.depthRangeYds.max}].`,
        );
      }
      // Sanity: depth must be remotely physical. Permissive bounds —
      // catches obvious typos (-50 yds) without rejecting unusual
      // backfield negatives (bubble screens).
      if (req.depthRangeYds.min < -10 || req.depthRangeYds.max > 30) {
        throw new Error(
          `Concept "${concept.name}" assignment ${req.role}/${req.family} has implausible depth range [${req.depthRangeYds.min}, ${req.depthRangeYds.max}] (outside [-10, 30] yds). Catalog family range is [${familyMin}, ${familyMax}].`,
        );
      }
    }
  }
}

assertConceptInvariants();

// ── Lookup ──────────────────────────────────────────────────────────────

/** Case-insensitive lookup honoring aliases. Returns null if no match. */
export function findConcept(rawName: string): ConceptEntry | null {
  const q = rawName.trim().toLowerCase();
  if (!q) return null;
  for (const c of CONCEPT_CATALOG) {
    if (c.name.toLowerCase() === q) return c;
    if (c.aliases?.some((a) => a.toLowerCase() === q)) return c;
  }
  return null;
}
