/**
 * Concept skeleton generator — Phase 7c (2026-05-02).
 *
 * The architectural fix for "Cal understands the concept words but
 * authors a spec that doesn't match." Instead of asking the LLM to
 * design 11 player decisions per play, the catalog now generates a
 * NEAR-COMPLETE PlaySpec for any named concept. Cal's role drops to
 * "call generateConceptSkeleton, optionally tweak 1-2 things."
 *
 * Why this works:
 *   • The catalog already knows each concept's required structure
 *     (which families at which depths).
 *   • The synthesizer already knows which player IDs each formation
 *     produces (X/Y/Z/H/S/F/B/Q + OL).
 *   • Combining the two: pre-pick canonical players for each required
 *     slot, fill complementary routes (clear-outs, blocks, outlets)
 *     with sensible defaults, and emit a complete PlaySpec.
 *
 * Cal can't mess up the structure because Cal isn't authoring the
 * structure. It just CALLS the skeleton generator, gets back a valid
 * spec, and optionally swaps a player or adjusts a depth.
 *
 * The skeleton generator is DETERMINISTIC: same inputs → same spec.
 * That property makes it golden-testable: "Flood Right in tackle_11"
 * produces exactly this spec, every time. Catalog regressions break
 * the golden, surfacing the change in CI.
 *
 * Coverage: every concept in CONCEPT_CATALOG should have a builder.
 * If a concept is added without one, generateConceptSkeleton returns
 * an error with the available concept list — the prompt teaches Cal
 * to fall back to manual authoring in that case.
 */

import type { PlaySpec, PlayerAssignment, AssignmentAction } from "./spec";
import { PLAY_SPEC_SCHEMA_VERSION } from "./spec";
import { findConcept, CONCEPT_CATALOG, type ConceptEntry } from "./conceptCatalog";
import type { SportVariant } from "./types";

export type ConceptSkeletonOptions = {
  variant: SportVariant;
  /** "left" or "right" for side-flooding concepts (Flood / Sail).
   *  Other concepts ignore this. Defaults to "right". */
  strength?: "left" | "right";
};

export type SkeletonResult =
  | {
      ok: true;
      spec: PlaySpec;
      /** Brief human-readable summary of what was generated, including
       *  per-player route assignments. Cal includes this verbatim in
       *  the chat reply so the coach can sanity-check before saving. */
      notes: string;
      /** Concept name as resolved from input (case-insensitive lookup
       *  through aliases). Surfaced so Cal can echo back "I built a
       *  Flood (you asked for Sail — same concept)." */
      concept: string;
    }
  | {
      ok: false;
      error: string;
      availableConcepts: string[];
    };

/**
 * Generate a near-complete PlaySpec for the named concept. Returns
 * ok:false when the concept isn't in the catalog OR doesn't have a
 * skeleton builder yet.
 */
export function generateConceptSkeleton(
  conceptName: string,
  opts: ConceptSkeletonOptions,
): SkeletonResult {
  const concept = findConcept(conceptName);
  if (!concept) {
    return {
      ok: false,
      error: `Unknown concept "${conceptName}". Available: ${CONCEPT_CATALOG.map((c) => c.name).join(", ")}.`,
      availableConcepts: CONCEPT_CATALOG.map((c) => c.name),
    };
  }
  const builder = SKELETON_BUILDERS[concept.name];
  if (!builder) {
    return {
      ok: false,
      error: `Concept "${concept.name}" has no skeleton builder yet — author the play manually with named families and depthYds.`,
      availableConcepts: Object.keys(SKELETON_BUILDERS),
    };
  }
  return builder(concept, opts);
}

// ── Helpers ─────────────────────────────────────────────────────────────

/** Pick the midpoint of a depth range, rounded to 0.5yd precision. */
function midDepth(range: { min: number; max: number }): number {
  return Math.round(((range.min + range.max) / 2) * 2) / 2;
}

/** Build a route assignment with a depthYds anchored at the concept's
 *  required depth midpoint. Optional `direction` forces lateral side
 *  for backfield carriers whose natural x is fixed (RB swings/flats
 *  to the flood side regardless of where the back lines up). */
function routeAt(
  player: string,
  family: string,
  depthYds: number,
  direction?: "left" | "right",
): PlayerAssignment {
  return {
    player,
    action: { kind: "route", family, depthYds, ...(direction ? { direction } : {}) },
  };
}

/** Standard offensive-line block assignments for tackle_11. Returns
 *  empty array for flag variants (no OL / single C). */
function lineBlocks(variant: SportVariant): PlayerAssignment[] {
  if (variant !== "tackle_11") return [];
  return ["LT", "LG", "C", "RG", "RT"].map((id) => ({
    player: id,
    action: { kind: "block" } as AssignmentAction,
  }));
}

/** QB drops back — we model as "unspecified" because the QB's job
 *  is to read and throw, not run a route. */
function qbDropback(): PlayerAssignment {
  return { player: "Q", action: { kind: "unspecified" } };
}

/** Standard PlaySpec scaffolding shared by every builder. */
function baseSpec(
  variant: SportVariant,
  title: string,
  formationName: string,
  strength: "left" | "right" | undefined,
  assignments: PlayerAssignment[],
): PlaySpec {
  return {
    schemaVersion: PLAY_SPEC_SCHEMA_VERSION,
    variant,
    title,
    playType: "offense",
    formation: strength
      ? { name: formationName, strength }
      : { name: formationName },
    assignments,
  };
}

// ── Per-concept builders ────────────────────────────────────────────────

function buildCurlFlat(_c: ConceptEntry, opts: ConceptSkeletonOptions): SkeletonResult {
  const variant = opts.variant;
  const side: "left" | "right" = opts.strength ?? "right";
  // Outside Curl on the strong side, RB Flat on the strong side.
  const outsideWR = side === "right" ? "Z" : "X";
  const slot = side === "right" ? "S" : "H";
  const backsideWR = side === "right" ? "X" : "Z";
  const backsideSlot = side === "right" ? "H" : "S";
  const assignments: PlayerAssignment[] = [
    routeAt(outsideWR, "Curl", 5),     // the curl (high)
    routeAt("B", "Flat", 2),           // the flat (low) — RB swings
    routeAt(slot, "Sit", 6),           // sensible secondary
    routeAt(backsideWR, "Go", 18),     // backside clear
    routeAt(backsideSlot, "Drag", 3),  // backside outlet
    qbDropback(),
    ...lineBlocks(variant),
  ];
  return {
    ok: true,
    concept: "Curl-Flat",
    spec: baseSpec(variant, `Curl-Flat ${cap(side)}`, "Spread Doubles", side, assignments),
    notes:
      `Curl-Flat ${cap(side)}: ${outsideWR} curl @ 5yd (high), B flat @ 2yd (low) — high-low on the flat defender. ` +
      `${slot} sit @ 6yd as secondary, ${backsideWR} go @ 18yd to clear backside.`,
  };
}

function buildSmash(_c: ConceptEntry, opts: ConceptSkeletonOptions): SkeletonResult {
  const variant = opts.variant;
  const side: "left" | "right" = opts.strength ?? "right";
  const outsideWR = side === "right" ? "Z" : "X";
  const slot = side === "right" ? "S" : "H";
  const backsideWR = side === "right" ? "X" : "Z";
  const backsideSlot = side === "right" ? "H" : "S";
  const assignments: PlayerAssignment[] = [
    routeAt(outsideWR, "Hitch", 5),    // the underneath
    routeAt(slot, "Corner", 13),       // the over (corner)
    routeAt("B", "Flat", 2),
    routeAt(backsideWR, "Go", 18),
    routeAt(backsideSlot, "Drag", 3),
    qbDropback(),
    ...lineBlocks(variant),
  ];
  return {
    ok: true,
    concept: "Smash",
    spec: baseSpec(variant, `Smash ${cap(side)}`, "Spread Doubles", side, assignments),
    notes:
      `Smash ${cap(side)}: ${outsideWR} hitch @ 5yd (low), ${slot} corner @ 13yd (high) — high-low on the cornerback. ` +
      `B flat @ 2yd, ${backsideWR} go @ 18yd to clear backside.`,
  };
}

function buildStick(_c: ConceptEntry, opts: ConceptSkeletonOptions): SkeletonResult {
  const variant = opts.variant;
  const side: "left" | "right" = opts.strength ?? "right";
  const slot = side === "right" ? "S" : "H";
  const outsideWR = side === "right" ? "Z" : "X";
  const backsideWR = side === "right" ? "X" : "Z";
  const backsideSlot = side === "right" ? "H" : "S";
  const assignments: PlayerAssignment[] = [
    routeAt(slot, "Sit", 6),           // the stick
    routeAt("B", "Flat", 2),           // the flat
    routeAt(outsideWR, "Go", 18),      // strong-side clear
    routeAt(backsideWR, "Go", 18),     // backside clear
    routeAt(backsideSlot, "Drag", 3),  // backside outlet
    qbDropback(),
    ...lineBlocks(variant),
  ];
  return {
    ok: true,
    concept: "Stick",
    spec: baseSpec(variant, `Stick ${cap(side)}`, "Trips", side, assignments),
    notes:
      `Stick ${cap(side)}: ${slot} sit @ 6yd (the 'stick'), B flat @ 2yd — high-low on the flat defender. ` +
      `${outsideWR} clears with go @ 18yd.`,
  };
}

function buildSnag(_c: ConceptEntry, opts: ConceptSkeletonOptions): SkeletonResult {
  const variant = opts.variant;
  const side: "left" | "right" = opts.strength ?? "right";
  const slot = side === "right" ? "S" : "H";
  const outsideWR = side === "right" ? "Z" : "X";
  const backsideWR = side === "right" ? "X" : "Z";
  const backsideSlot = side === "right" ? "H" : "S";
  const assignments: PlayerAssignment[] = [
    routeAt(slot, "Spot", 5),          // the snag/spot
    routeAt(outsideWR, "Corner", 13),  // the over
    routeAt("B", "Flat", 2),           // the flat
    routeAt(backsideWR, "Go", 18),
    routeAt(backsideSlot, "Drag", 3),
    qbDropback(),
    ...lineBlocks(variant),
  ];
  return {
    ok: true,
    concept: "Snag",
    spec: baseSpec(variant, `Snag ${cap(side)}`, "Trips Bunch", side, assignments),
    notes:
      `Snag ${cap(side)}: ${slot} spot @ 5yd, ${outsideWR} corner @ 13yd, B flat @ 2yd — triangle stretch.`,
  };
}

function buildFourVerts(_c: ConceptEntry, opts: ConceptSkeletonOptions): SkeletonResult {
  const variant = opts.variant;
  const assignments: PlayerAssignment[] = [
    routeAt("X", "Go", 18),
    routeAt("Z", "Go", 18),
    routeAt("H", "Seam", 18),
    routeAt("S", "Seam", 18),
    routeAt("B", "Flat", 2),  // checkdown
    qbDropback(),
    ...lineBlocks(variant),
  ];
  return {
    ok: true,
    concept: "Four Verticals",
    spec: baseSpec(variant, "Four Verticals", "Spread Doubles", undefined, assignments),
    notes:
      `Four Verticals: X+Z run go routes (outside), H+S run seams (inside), all stretching deep. B as checkdown.`,
  };
}

function buildMesh(_c: ConceptEntry, opts: ConceptSkeletonOptions): SkeletonResult {
  const variant = opts.variant;
  // Inside slots run the differentiated drags (H under, S over). Outside
  // X/Z run a sit + clear over the top.
  //
  // Depth choice — 2 + 8: catalog ranges are [2, 3.5] (under) and
  // [6, 9] (over). Visual-separation history:
  //   3 + 5  →  ~2yd gap, visually swallowed by token width
  //   2 + 6  →  4yd gap, still read as collided in chat preview
  //   2 + 8  →  6yd gap, unambiguously stacked. Coaches won't
  //              mistake the cross for a collision (surfaced
  //              twice in 2026-05-02 sessions).
  // Both still satisfy concept_mesh's slot constraints.
  const assignments: PlayerAssignment[] = [
    routeAt("H", "Drag", 2),    // under-drag (low end of [2, 3.5])
    routeAt("S", "Drag", 8),    // over-drag (mid of [6, 9])
    routeAt("X", "Sit", 12),    // over-the-top sit (deeper than over-drag)
    routeAt("Z", "Go", 18),     // single deep clear
    routeAt("B", "Flat", 2),    // outlet
    qbDropback(),
    ...lineBlocks(variant),
  ];
  return {
    ok: true,
    concept: "Mesh",
    spec: baseSpec(variant, "Mesh", "Spread Doubles", undefined, assignments),
    notes:
      `Mesh: H under-drag @ 2yd + S over-drag @ 8yd — 6yd visual separation makes the cross unambiguous. X sits @ 12yd over the top, Z clears with go @ 18yd, B is the flat outlet.`,
  };
}

function buildFlood(_c: ConceptEntry, opts: ConceptSkeletonOptions): SkeletonResult {
  const variant = opts.variant;
  const side: "left" | "right" = opts.strength ?? "right";
  const outsideWR = side === "right" ? "Z" : "X";
  const slot = side === "right" ? "S" : "H";
  const backsideWR = side === "right" ? "X" : "Z";
  const backsideSlot = side === "right" ? "H" : "S";
  // Spread Doubles (NOT Trips). Reason: Trips puts all 3 strong-side
  // players on the right (Z + 2 slots). The "backside drag" Cal's prose
  // describes ("@H runs shallow 3-yard cross left-to-right") only makes
  // geometric sense if H is on the LEFT at the snap. Doubles 2x2 has X+H
  // left, Z+S right — H drags from left to right naturally.
  //
  // 2026-05-02 fix (coach feedback):
  //   • Slot's mid route was Curl 5; now Out 8. Real Flood has the
  //     slot break OUT toward the sideline at the second level —
  //     attacking the seam between the corner and flat defender.
  //     Curl-Flat is a different concept (high-low on the flat
  //     defender) and lives in its own catalog entry.
  //   • RB now uses an explicit direction: side override on the
  //     Flat. Previously the Flat template inferred direction from
  //     the carrier's x sign, but B sits at x≈+2 in Spread Doubles
  //     regardless of strength — so Flood Left rendered B's flat
  //     going RIGHT (away from the flood). The override forces the
  //     flat to flood-side every time.
  const assignments: PlayerAssignment[] = [
    routeAt(outsideWR, "Corner", 14),       // strong-side outside, deep corner
    routeAt(slot, "Out", 8),                // strong-side slot, second-level out
    routeAt("B", "Flat", 2, side),          // RB flat to the flood side (explicit direction)
    routeAt(backsideWR, "Go", 18),          // backside outside, deep clear
    routeAt(backsideSlot, "Drag", 3, side), // backside slot drags toward flood (cross-formation)
    qbDropback(),
    ...lineBlocks(variant),
  ];
  return {
    ok: true,
    concept: "Flood",
    spec: baseSpec(variant, `Flood ${cap(side)}`, "Spread Doubles", side, assignments),
    notes:
      `Flood ${cap(side)}: ${outsideWR} corner @ 14yd (deep), ${slot} out @ 8yd (mid — second level break to the sideline), B flat @ 2yd (low — RB swings ${side}). ${backsideWR} go @ 18yd (backside clear), ${backsideSlot} drag @ 3yd (crosses ${side === "right" ? "left-to-right" : "right-to-left"} toward the flood as outlet). Three strong-side levels stretch the cornerback and flat defender; backside drag gives the QB a hot read vs blitz.`,
  };
}

function buildDrive(_c: ConceptEntry, opts: ConceptSkeletonOptions): SkeletonResult {
  const variant = opts.variant;
  const assignments: PlayerAssignment[] = [
    routeAt("H", "Drag", 3),    // under (the rub)
    routeAt("X", "Dig", 12),    // over (the void route)
    routeAt("Z", "Go", 18),     // backside clear
    routeAt("S", "Sit", 6),     // backside outlet
    routeAt("B", "Flat", 2),    // checkdown
    qbDropback(),
    ...lineBlocks(variant),
  ];
  return {
    ok: true,
    concept: "Drive",
    spec: baseSpec(variant, "Drive", "Spread Doubles", undefined, assignments),
    notes:
      `Drive: H under-drag @ 3yd + X dig @ 12yd over the top — two crossers attacking the middle at differentiated depths. Z deep clear, B checkdown.`,
  };
}

function buildLevels(_c: ConceptEntry, opts: ConceptSkeletonOptions): SkeletonResult {
  const variant = opts.variant;
  const assignments: PlayerAssignment[] = [
    routeAt("H", "In", 7),      // low in
    routeAt("X", "Dig", 12),    // high dig (over the in)
    routeAt("Z", "Go", 18),     // backside clear
    routeAt("S", "Sit", 6),
    routeAt("B", "Flat", 2),
    qbDropback(),
    ...lineBlocks(variant),
  ];
  return {
    ok: true,
    concept: "Levels",
    spec: baseSpec(variant, "Levels", "Spread Doubles", undefined, assignments),
    notes:
      `Levels: H in @ 7yd (low) + X dig @ 12yd (high) — high-low on the underneath LB. Z deep clear, B checkdown.`,
  };
}

function buildYCross(_c: ConceptEntry, opts: ConceptSkeletonOptions): SkeletonResult {
  const variant = opts.variant;
  // "Singleback" formation produces a Y/TE (which Y-Cross requires by
  // definition — the Y is the deep crosser). Spread Doubles has no Y,
  // so a Y-Cross skeleton emitted under that formation would silently
  // drop the @Y assignment when synthesized.
  const assignments: PlayerAssignment[] = [
    routeAt("Y", "Dig", 15),    // the Y/TE deep cross
    routeAt("X", "Post", 14),   // the clear (post)
    routeAt("B", "Flat", 2),    // the outlet
    routeAt("Z", "Go", 18),     // backside clear
    routeAt("H", "Drag", 3),    // backside drag (slot)
    qbDropback(),
    ...lineBlocks(variant),
  ];
  return {
    ok: true,
    concept: "Y-Cross",
    spec: baseSpec(variant, "Y-Cross", "Singleback", undefined, assignments),
    notes:
      `Y-Cross: Y deep cross @ 15yd, X post @ 14yd to clear the safety, B flat @ 2yd outlet — triangle stretch. Z backside clear. Singleback formation provides the Y/TE.`,
  };
}

function buildDagger(_c: ConceptEntry, opts: ConceptSkeletonOptions): SkeletonResult {
  const variant = opts.variant;
  const assignments: PlayerAssignment[] = [
    routeAt("H", "Seam", 18),   // the clear (vertical seam)
    routeAt("X", "Dig", 15),    // the deep dig in the void
    routeAt("Z", "Go", 18),     // backside clear
    routeAt("S", "Sit", 6),
    routeAt("B", "Flat", 2),
    qbDropback(),
    ...lineBlocks(variant),
  ];
  return {
    ok: true,
    concept: "Dagger",
    spec: baseSpec(variant, "Dagger", "Spread Doubles", undefined, assignments),
    notes:
      `Dagger: H seam @ 18yd to clear the deep safety, X dig @ 15yd in the void behind the LB. Best vs single-high.`,
  };
}

function cap(s: string): string {
  return s.length > 0 ? s[0].toUpperCase() + s.slice(1) : s;
}

const SKELETON_BUILDERS: Record<string, (concept: ConceptEntry, opts: ConceptSkeletonOptions) => SkeletonResult> = {
  "Curl-Flat":      buildCurlFlat,
  "Smash":          buildSmash,
  "Stick":          buildStick,
  "Snag":           buildSnag,
  "Four Verticals": buildFourVerts,
  "Mesh":           buildMesh,
  "Flood":          buildFlood,
  "Drive":          buildDrive,
  "Levels":         buildLevels,
  "Y-Cross":        buildYCross,
  "Dagger":         buildDagger,
};
