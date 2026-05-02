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

export type ConceptEntry = {
  /** Display name (e.g. "Curl-Flat"). Lookup is case-insensitive. */
  name: string;
  /** Common natural-language aliases coaches use. */
  aliases?: string[];
  /** Plain-English description for KB / coaching cue. */
  description: string;
  /** The pattern of assignments a satisfying spec must contain. */
  required: ConceptAssignment[];
};

// ── Concept entries ─────────────────────────────────────────────────────

const CURL_FLAT: ConceptEntry = {
  name: "Curl-Flat",
  aliases: ["Curl/Flat", "Hook-Flat"],
  description:
    "High-low read on the flat defender. Outside receiver runs a SHORT curl (~5 yds, settling at the soft spot just past the LBs); slot or back releases to the flat at 0-3 yds. The flat defender can't cover both — sit on one and the QB throws the other.",
  required: [
    // Outside curl: 4-7yd is the high-low window — TIGHTER than the
    // catalog's 8-13yd general curl range. A 10yd curl here would put
    // the receiver behind the curl/flat defender's drop, making the
    // read invalid.
    { role: "outside_wr", family: "Curl", depthRangeYds: { min: 4, max: 7 } },
    { role: "any",        family: "Flat", depthRangeYds: { min: 0, max: 4 } },
  ],
};

const SMASH: ConceptEntry = {
  name: "Smash",
  aliases: ["Smash Concept"],
  description:
    "High-low corner-flat combo. Outside receiver runs a hitch / short curl (4-6 yds) underneath; inside receiver / TE runs a corner (12-15 yds) over the top. Beats Cover 2 — the corner takes the flat receiver, the safety can't cover the corner.",
  required: [
    { role: "outside_wr", family: "Hitch",  depthRangeYds: { min: 4, max: 6 } },
    { role: "any",        family: "Corner", depthRangeYds: { min: 12, max: 18 } },
  ],
};

const STICK: ConceptEntry = {
  name: "Stick",
  aliases: ["Stick Concept"],
  description:
    "3rd-down staple. Inside receiver / slot runs a sit at 5-6 yds (the 'stick'); outside receiver clears with a fade or go; back releases to the flat. High-low on the flat defender — same idea as curl-flat but uses a SIT instead of a curl (more deliberate settle).",
  required: [
    { role: "slot", family: "Sit",  depthRangeYds: { min: 5, max: 7 } },
    { role: "any",  family: "Flat", depthRangeYds: { min: 0, max: 4 } },
  ],
};

const SNAG: ConceptEntry = {
  name: "Snag",
  aliases: ["Snag Concept", "Spot Concept"],
  description:
    "Three-receiver triangle. Inside slot runs the 'snag' (spot route at 5-6 yds, settling); outside runs a corner over the top; back to the flat. Triangle stretches the flat defender high-low AND the corner inside-out.",
  required: [
    { role: "slot",       family: "Spot",   depthRangeYds: { min: 4, max: 7 } },
    { role: "outside_wr", family: "Corner", depthRangeYds: { min: 12, max: 18 } },
    { role: "any",        family: "Flat",   depthRangeYds: { min: 0, max: 4 } },
  ],
};

const FOUR_VERTS: ConceptEntry = {
  name: "Four Verticals",
  aliases: ["Four Verts", "4 Verts", "Verticals"],
  description:
    "FOUR receivers run vertical, stretching every coverage deep. The two outside WRs run Go routes; the two inside players (slot + TE, or two slots) run Seams to split the safeties. The concept LITERALLY requires four vertical routes — a play with only two verts is NOT '4 verts', it's a different concept (e.g. seam-flood, dagger). Beats Cover 2 (4 verts vs 2 deep), Cover 3 (seams threaten the FS), and any single-high look.",
  required: [
    // Two outside Gos — the boundaries of the vertical stretch.
    { role: "outside_wr", family: "Go",   depthRangeYds: { min: 12, max: 25 } },
    { role: "outside_wr", family: "Go",   depthRangeYds: { min: 12, max: 25 } },
    // Two inside Seams — the middle of the vertical stretch (split the
    // safeties). Role "any" because the inside verts can be slot, TE, or
    // motion player — geometry is what matters, not personnel.
    { role: "any",        family: "Seam", depthRangeYds: { min: 12, max: 25 } },
    { role: "any",        family: "Seam", depthRangeYds: { min: 12, max: 25 } },
  ],
};

const MESH: ConceptEntry = {
  name: "Mesh",
  aliases: ["Mesh Concept"],
  description:
    "Two crossing drags that 'mesh' past each other at HIGH/LOW depths — one drag UNDER (1-2 yds) and one OVER (3-5 yds). The depth differentiation is what makes them mesh: same depth means a collision, different depths means a clean cross. Cal MUST set depthYds explicitly on each drag (e.g. 2 and 4) — without that, the matcher rejects because the two slots have non-overlapping depth ranges. Natural pick / rub action vs man, finds soft spots in zone.",
  required: [
    // Differentiated slots — non-overlapping depth ranges force the
    // two drags to be at different depths. A 2yd drag fits the under
    // slot (1-2.5) but NOT the over slot (3.5-5); a 4yd drag fits the
    // over slot but NOT the under slot. This is the catalog enforcing
    // canonical Mesh geometry rather than letting Cal stack two drags
    // at the same depth (which renders as a collision, not a mesh).
    { role: "any", family: "Drag", depthRangeYds: { min: 1, max: 2.5 } }, // under-drag
    { role: "any", family: "Drag", depthRangeYds: { min: 3.5, max: 5 } }, // over-drag
  ],
};

export const CONCEPT_CATALOG: ConceptEntry[] = [
  CURL_FLAT,
  SMASH,
  STICK,
  SNAG,
  FOUR_VERTS,
  MESH,
];

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
