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
  /** Which player handles the ball for trick plays where the carrier
   *  is a choice rather than a structural role (Flea Flicker can have
   *  Z, Y, or the back take the handoff before pitching back to the
   *  QB). Concepts that don't support carrier variants ignore this. */
  ballCarrier?: string;
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
    confidence: "high",
    action: { kind: "route", family, depthYds, ...(direction ? { direction } : {}) },
  };
}

/** Standard offensive-line block assignments for tackle_11. Returns
 *  empty array for flag variants (no OL / single C). */
function lineBlocks(variant: SportVariant): PlayerAssignment[] {
  if (variant !== "tackle_11") return [];
  return ["LT", "LG", "C", "RG", "RT"].map((id) => ({
    player: id,
    confidence: "high",
    action: { kind: "block" } as AssignmentAction,
  }));
}

/** QB drops back — we model as "unspecified" because the QB's job
 *  is to read and throw, not run a route. */
function qbDropback(): PlayerAssignment {
  return { player: "Q", confidence: "high", action: { kind: "unspecified" } };
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
    // X runs a Curl @ 12yd: deeper than the over-drag, settles facing
    // the QB. Was Sit @ 12 before 2026-05-20 but Sit's canonical range
    // is [3, 7] — that combination tripped the save-time route-
    // assignment validator (route_kind="Sit" cannot be 12 yds). Curl
    // [4, 13] is the right family for a deep settle facing QB.
    routeAt("X", "Curl", 12),
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

/**
 * QB Draw — designed QB run from shotgun. OL pass-sets to sell pass;
 * skill players run pass routes (mostly hitches) to widen the coverage;
 * QB hesitates, then runs straight through the middle. Requires the
 * playbook's `designed_qb_run` capability — the resolver will reject
 * the save if it isn't enabled.
 *
 * Geometry: QB takes the snap at (0, -5), runs through the heart of
 * the defense to ~(0, 5). The renderer's carry-synth path will fall
 * back to a sensible default if waypoints are omitted, but we set
 * them explicitly so the diagram reads as a draw (straight up the
 * middle) rather than a generic ballcarrier line.
 */
function buildQbDraw(_c: ConceptEntry, opts: ConceptSkeletonOptions): SkeletonResult {
  const variant = opts.variant;
  const assignments: PlayerAssignment[] = [
    // QB takes the snap and runs the draw. Waypoints span ~10 yds
    // straight ahead; the renderer adds the carrier's start position
    // automatically so the path reads from QB stance through the line.
    {
      player: "QB",
      confidence: "high",
      action: { kind: "carry", runType: "draw", waypoints: [[0, -3], [0, 2], [0, 6]] },
    },
    // Back stays in to pass-block (the play sells pass; the QB
    // exploits the lifted coverage).
    { player: "B", confidence: "high", action: { kind: "block", target: "blitz" } },
    // Receivers run quick pass routes to widen coverage. Hitches +
    // a Drag underneath give Cal a sensible default; the user can
    // swap any of them via revise_play.
    routeAt("X", "Hitch", 5),
    routeAt("Z", "Hitch", 5),
    routeAt("H", "Drag", 3),
    routeAt("S", "Drag", 3),
    ...lineBlocks(variant),
  ];
  // Note we do NOT include qbDropback(): the QB is the runner.
  return {
    ok: true,
    concept: "QB Draw",
    spec: baseSpec(variant, "QB Draw", "Spread Doubles", undefined, assignments),
    notes:
      `QB Draw: QB takes the snap, hesitates as if reading, then runs straight up the middle. ` +
      `OL pass-sets to sell pass; receivers run hitches / drags to widen coverage. ` +
      `Best vs rush-heavy defenses on obvious passing downs.`,
  };
}

/**
 * Bubble RPO — Inside Zone + Bubble screen with a QB read on the
 * conflict defender (playside OLB / overhang). The QB pulls and
 * throws the bubble when the conflict defender comes down to fill
 * the run; gives the back on Inside Zone when the defender stays
 * out. Requires `rpo_read`.
 *
 * Strength side picks which slot runs the bubble: strong-side slot
 * by default ("S" on Spread Doubles right-strength; "H" on left).
 */
function buildBubbleRpo(_c: ConceptEntry, opts: ConceptSkeletonOptions): SkeletonResult {
  const variant = opts.variant;
  const side: "left" | "right" = opts.strength ?? "right";
  const bubbleSlot = side === "right" ? "S" : "H";
  const backsideSlot = side === "right" ? "H" : "S";
  const bubbleOutside = side === "right" ? "Z" : "X";
  const backsideOutside = side === "right" ? "X" : "Z";
  const assignments: PlayerAssignment[] = [
    // QB's RPO decision — read the playside OLB.
    {
      player: "QB",
      confidence: "high",
      action: {
        kind: "rpo_read",
        keyDefenderRole: "playside_lb",
        giveTo: "B",
        passTo: bubbleSlot,
        pullIf: "in",
      },
    },
    // Back takes the Inside Zone path. Synthesizer-default waypoints
    // produce a reasonable IZ line — we don't override so the run
    // direction tracks the strength.
    { player: "B", confidence: "high", action: { kind: "carry", runType: "inside_zone" } },
    // Bubble slot — the pass option. Bubble route family is the
    // catalog's lateral-release screen at ~0–2 yds.
    routeAt(bubbleSlot, "Bubble", 1, side),
    // Outside receiver to the bubble side runs a hitch as the
    // bubble's blocker (no actual block in the spec; a Hitch keeps
    // the cornerback honest until the ball is in the air).
    routeAt(bubbleOutside, "Hitch", 5),
    // Backside players give a counter-image — both run go routes to
    // hold the safety, so the playside read is honest.
    routeAt(backsideOutside, "Go", 18),
    routeAt(backsideSlot, "Go", 18),
    ...lineBlocks(variant),
  ];
  return {
    ok: true,
    concept: "Bubble RPO",
    spec: baseSpec(variant, `Bubble RPO ${cap(side)}`, "Spread Doubles", side, assignments),
    notes:
      `Bubble RPO ${cap(side)}: QB reads the playside OLB. ` +
      `If he comes down to fill the run, pull and throw to @${bubbleSlot} on the bubble (he has the outside leverage). ` +
      `If he stays wide on the bubble, give to @B on Inside Zone — the box is light. ` +
      `Backside @${backsideOutside} / @${backsideSlot} run go routes to hold the deep safety.`,
  };
}

/**
 * Jet Reverse — two-handoff misdirection. QB hands to the back at
 * the mesh; back runs strong-side and hands the ball to the weak-
 * side WR coming around. Three ball-handlers, two exchanges. Use the
 * play-level `ballPath` to ledger the exchanges; each carrier's
 * waypoints describe their leg with the ball. Requires
 * `handoff_chain`.
 *
 * Strength: defaults to "right" — initial action goes right, reverse
 * comes back to the left side. Mirrors when strength === "left".
 */
function buildJetReverse(_c: ConceptEntry, opts: ConceptSkeletonOptions): SkeletonResult {
  const variant = opts.variant;
  const side: "left" | "right" = opts.strength ?? "right";
  // Reverse comes from the WEAK side: when strength=right, the reverse
  // carrier is X (left WR); when strength=left, the reverse carrier is
  // Z (right WR).
  const reverseCarrier = side === "right" ? "X" : "Z";
  const sideSign = side === "right" ? 1 : -1;
  // Mesh points: QB→B at the snap (behind the LOS), then B→reverse-
  // carrier a couple yards laterally on the strong side. Both are
  // behind the LOS so the handoffs look natural in the diagram.
  const mesh1: [number, number] = [0, -4];
  const mesh2: [number, number] = [sideSign * 3, -3];
  const assignments: PlayerAssignment[] = [
    // QB hands and gets out of the way — block / no further role.
    { player: "QB", confidence: "high", action: { kind: "block" } },
    // Back takes the first handoff at mesh1, fakes upfield, then
    // hands to the reverse carrier at mesh2. Waypoints describe the
    // ball-carrying leg from mesh1 → mesh2; the renderer prepends
    // B's start position automatically.
    {
      player: "B",
      confidence: "high",
      action: { kind: "carry", waypoints: [mesh1, mesh2] },
    },
    // Reverse carrier: takes the ball at mesh2 and runs to the weak
    // side, ending ~10 yds downfield and 5 yds outside the hashes on
    // the weak side. Waypoints span mesh2 → endpoint; renderer
    // prepends their start position.
    {
      player: reverseCarrier,
      confidence: "high",
      action: {
        kind: "carry",
        waypoints: [mesh2, [-sideSign * 8, -1], [-sideSign * 14, 8]],
      },
    },
    ...lineBlocks(variant),
  ];
  // Routes for the remaining receivers so the formation isn't bare.
  // Add a hitch + a drag on the strong side; backside skill players
  // get unspecified (they sell run by holding their assignment but
  // don't have a defined route in the reverse misdirection).
  const strongOutside = side === "right" ? "Z" : "X";
  const strongSlot = side === "right" ? "S" : "H";
  const backsideSlot = side === "right" ? "H" : "S";
  // Strong-side receivers block downfield (no route assignment) so
  // the reverse runner has a perimeter. Mark them as `unspecified`
  // so the diagram doesn't draw misleading pass routes.
  assignments.push(
    { player: strongOutside, confidence: "med", action: { kind: "unspecified" } },
    { player: strongSlot, confidence: "med", action: { kind: "unspecified" } },
    { player: backsideSlot, confidence: "med", action: { kind: "unspecified" } },
  );
  return {
    ok: true,
    concept: "Jet Reverse",
    spec: {
      ...baseSpec(variant, `Jet Reverse ${cap(side)}`, "Trips Right", side, assignments),
      ballPath: [
        { from: "QB", to: "B", atPoint: mesh1 },
        { from: "B",  to: reverseCarrier, atPoint: mesh2 },
      ],
    },
    notes:
      `Jet Reverse ${cap(side)}: QB hands to @B at the mesh; @B runs strong-side and hands the ball back to @${reverseCarrier} coming around. ` +
      `@${reverseCarrier} attacks the weak side after the defense flows to the initial fake. ` +
      `Two exchanges, three ball-handlers. Best when the defense is over-pursuing the run.`,
  };
}

function cap(s: string): string {
  return s.length > 0 ? s[0].toUpperCase() + s.slice(1) : s;
}

// ── Run-play helpers ────────────────────────────────────────────────────

/**
 * Build a single-handoff run play (Sweep, Dive, Counter, Draw). The
 * shape is the same across all of them — only the back's `runType`,
 * the receiver responsibilities, and the QB's mesh footwork differ.
 *
 * Why the QB is `kind: "carry"` with no runType and explicit
 * waypoints: the user surfaced 2026-05-13 that QB physical movement
 * was never visible. The handoff_arrow at the mesh point shows the
 * exchange but doesn't draw the QB's path from snap to mesh. Adding
 * a `carry` (without a designed runType, so `designed_qb_run` isn't
 * required — see playSpecRules.ts:isDesignedQbCarry) lets the QB's
 * line render alongside the back's. The ballPath ledger correctly
 * records that the QB only HAS the ball at the snap and that the
 * back takes possession at the mesh.
 */
function buildSingleHandoffRun(
  conceptName: "Sweep" | "Dive" | "Counter" | "Draw" | "Power",
  runType: NonNullable<Extract<AssignmentAction, { kind: "carry" }>["runType"]>,
  opts: ConceptSkeletonOptions,
): SkeletonResult {
  const variant = opts.variant;
  const side: "left" | "right" = opts.strength ?? "right";
  const sideSign = side === "right" ? 1 : -1;
  // Mesh point: 4 yards behind the LOS, shading the runtype's direction.
  // Sweep/Counter pull laterally; Dive/Draw stay between the tackles.
  // Power: small lateral bias toward the playside gap (1 yd) — narrower
  // than Sweep (gap-scheme, not edge-attack) but more than Dive (B-gap,
  // not A-gap).
  const lateralBias = conceptName === "Sweep" || conceptName === "Counter"
    ? 1.5
    : conceptName === "Power"
    ? 1
    : 0;
  const mesh: [number, number] = [sideSign * lateralBias, -4];
  // Back's carry path: from start (~7yd deep in backfield) through the
  // mesh, then up the field on the runType's track.
  const backWaypoints = runPathFor(conceptName, sideSign, mesh);
  // QB physical footwork: a short step toward the mesh + back to a
  // post-handoff hold position (no runType — capability gate skipped).
  const qbWaypoints: [number, number][] = [
    mesh,
    [sideSign * lateralBias * 0.5, -3],
  ];

  const assignments: PlayerAssignment[] = [
    {
      player: "QB",
      confidence: "high",
      action: { kind: "carry", waypoints: qbWaypoints },
    },
    {
      player: "B",
      confidence: "high",
      action: { kind: "carry", runType, waypoints: backWaypoints },
    },
    // Receivers in run-blocking / stalk-block posture. `unspecified`
    // keeps them visible in the formation without drawing fake pass
    // routes the defense could read.
    { player: "X", confidence: "med", action: { kind: "unspecified" } },
    { player: "Z", confidence: "med", action: { kind: "unspecified" } },
    { player: "H", confidence: "med", action: { kind: "unspecified" } },
    { player: "S", confidence: "med", action: { kind: "unspecified" } },
    ...lineBlocks(variant),
  ];

  return {
    ok: true,
    concept: conceptName,
    spec: {
      ...baseSpec(variant, `${conceptName} ${cap(side)}`, "Spread Doubles", side, assignments),
      ballPath: [{ from: "QB", to: "B", atPoint: mesh }],
    },
    notes: runNotesFor(conceptName, side),
  };
}

/** Back's carry path for each run-concept type. Each shape ends ~8yd
 *  downfield so the diagram clearly shows where the back is attacking. */
function runPathFor(
  conceptName: "Sweep" | "Dive" | "Counter" | "Draw" | "Power",
  sideSign: 1 | -1,
  mesh: [number, number],
): [number, number][] {
  switch (conceptName) {
    case "Sweep":
      // Wide arc to the edge: mesh → bend outside → vertical at the numbers.
      return [mesh, [sideSign * 6, -2], [sideSign * 10, 6]];
    case "Counter":
      // Jab step away, then back: mesh → cut against the grain → vertical.
      // sideSign here is the play direction; the jab is the opposite,
      // but the FINAL path is to the named side.
      return [mesh, [-sideSign * 1, -3], [sideSign * 4, 2], [sideSign * 5, 8]];
    case "Dive":
      // Interior north-south: mesh → tight inside crease → vertical.
      return [mesh, [sideSign * 1, 0], [sideSign * 1, 8]];
    case "Draw":
      // Late-developing: mesh held → soft middle → vertical through the
      // pocket the rush vacated.
      return [mesh, [0, -2], [0, 8]];
    case "Power":
      // Gap-scheme downhill: mesh → follow the pulling guard through
      // the playside B-gap → vertical at second level. Wider than Dive
      // (B-gap, not A-gap) and tighter than Sweep (gap, not edge).
      return [mesh, [sideSign * 2, 1], [sideSign * 3, 8]];
  }
}

function runNotesFor(
  conceptName: "Sweep" | "Dive" | "Counter" | "Draw" | "Power",
  side: "left" | "right",
): string {
  const dir = cap(side);
  switch (conceptName) {
    case "Sweep":
      return (
        `Sweep ${dir}: @QB hands to @B at the mesh; @B attacks the ${side} edge with the OL reaching playside. ` +
        `Receivers stalk-block their man. Patient feet to the kick-out, then turn vertical when the corner is sealed.`
      );
    case "Dive":
      return (
        `Dive ${dir}: @QB hands to @B at the mesh; @B hits the first available crease between the tackles. ` +
        `OL inside-zone-blocks. Stay on schedule — this softens the interior for the play-action that follows.`
      );
    case "Counter":
      return (
        `Counter ${dir}: @B jab-steps away from the play side to hold the LBs, then takes the handoff going ${side} ` +
        `behind the pulling backside guard and tackle. The defense's pursuit moves the wrong way.`
      );
    case "Draw":
      return (
        `Draw ${dir}: OL pass-sets, receivers run pass-pretend routes to widen the coverage. ` +
        `@QB drops back, then hands LATE to @B hitting the soft middle the rush vacated. Best on obvious passing downs.`
      );
    case "Power":
      return (
        `Power ${dir}: @QB hands to @B at the mesh; the backside guard pulls and leads through the playside B-gap. ` +
        `@B follows the puller, presses the line, and breaks downhill — first defender to fit the gap takes the contact, ` +
        `@B is already through. OL down-blocks playside; receivers stalk-block their man.`
      );
  }
}

function buildSweep(_c: ConceptEntry, opts: ConceptSkeletonOptions): SkeletonResult {
  return buildSingleHandoffRun("Sweep", "sweep", opts);
}
function buildDive(_c: ConceptEntry, opts: ConceptSkeletonOptions): SkeletonResult {
  return buildSingleHandoffRun("Dive", "inside_zone", opts);
}
function buildCounter(_c: ConceptEntry, opts: ConceptSkeletonOptions): SkeletonResult {
  return buildSingleHandoffRun("Counter", "counter", opts);
}
function buildDraw(_c: ConceptEntry, opts: ConceptSkeletonOptions): SkeletonResult {
  return buildSingleHandoffRun("Draw", "draw", opts);
}
function buildPower(_c: ConceptEntry, opts: ConceptSkeletonOptions): SkeletonResult {
  return buildSingleHandoffRun("Power", "power", opts);
}

/**
 * Flea Flicker — trick play. The two-step ballPath is QB → carrier →
 * QB, with the carrier running toward the LOS as if rushing before
 * pitching the ball back BEHIND the LOS. The QB then throws deep to
 * a clear-out receiver.
 *
 * The carrier is configurable via `opts.ballCarrier`. Defaults to Z
 * (the canonical version). The deep receiver is always the OPPOSITE
 * side from wherever the run-fake went, so the deep ball attacks the
 * space the safeties just vacated to react to the run.
 *
 * Mesh points are both behind the LOS — a forward lateral is an
 * incomplete pass (or worse, an illegal forward pass), so the
 * sanitizer also enforces this invariant at render time.
 */
function buildFleaFlicker(_c: ConceptEntry, opts: ConceptSkeletonOptions): SkeletonResult {
  const variant = opts.variant;
  const side: "left" | "right" = opts.strength ?? "right";
  const sideSign = side === "right" ? 1 : -1;
  const carrierId = opts.ballCarrier && opts.ballCarrier.trim().length > 0
    ? opts.ballCarrier.toUpperCase()
    : "Z";
  // mesh1: where QB hands off to the carrier (just behind the LOS,
  // lateral toward the carrier's natural side).
  const mesh1: [number, number] = [sideSign * 2, -3];
  // mesh2: where the carrier pitches back to QB. Slightly DEEPER
  // (-5) so the pitch is unambiguously behind the LOS even after
  // the carrier ran forward.
  const mesh2: [number, number] = [sideSign * 1, -5];
  // The carrier's path: from their start position to mesh1 (handoff),
  // run hard toward the LOS as if rushing, then turn and pitch back at
  // mesh2. The renderer prepends the carrier's start position.
  const carrierWaypoints: [number, number][] = [
    mesh1,
    [sideSign * 3, -1],  // sells the run with forward momentum
    mesh2,                // pivots and pitches back
  ];
  // The QB's path: step to mesh1 (sell the handoff), retreat to a
  // throwing position, catch the lateral at mesh2, then throw. No
  // runType (capability gate skipped).
  const qbWaypoints: [number, number][] = [
    mesh1,
    [0, -6],     // retreat to passing depth
    mesh2,       // catch the pitch
    [0, -7],     // settle to throw
  ];

  // Deep receiver: opposite side from the carrier (so the deep ball
  // attacks the side the defense flowed AWAY from on the run fake).
  const deepSide = carrierId === "Z" ? "X" : carrierId === "X" ? "Z" : sideSign > 0 ? "X" : "Z";
  const secondaryDeep = deepSide === "Z" ? "X" : "Z";

  const assignments: PlayerAssignment[] = [
    {
      player: "QB",
      confidence: "high",
      action: { kind: "carry", waypoints: qbWaypoints },
    },
  ];

  // Carrier — explicit carry, no route (the bug we're fixing was Z
  // being given a route instead of the handoff).
  assignments.push({
    player: carrierId,
    confidence: "high",
    action: { kind: "carry", waypoints: carrierWaypoints },
  });

  // Deep clear-out: a Post or Go ≥15yd to give the QB a target after
  // the run fake. Use Post on the primary side (it attacks the void
  // between the safeties), Go on the backside (vertical clear).
  if (deepSide !== carrierId) {
    assignments.push(routeAt(deepSide, "Post", 18));
  }
  if (secondaryDeep !== carrierId && secondaryDeep !== deepSide) {
    assignments.push(routeAt(secondaryDeep, "Go", 18));
  }

  // Slot / checkdown routes — variant-aware. The 5v5 formation
  // synthesizer remaps any non-canonical id (H/S/B/F) to Y, so the
  // roster is {Q, C, X, Y, Z}; assigning a route to "H" or "S" in
  // 5v5 silently no-ops because no player has that id. 6v6 + 7v7 +
  // tackle keep traditional H/S labels.
  //
  // Surfaced 2026-05-13: a 5v5 Flea Flicker rendered with no routes
  // for Y or C because the skeleton's "H" + "S" Drag assignments
  // never matched the rendered formation.
  let slotIds: string[];
  if (variant === "flag_5v5") {
    // 5v5 roster: {Q, C, X, Y, Z}. C is eligible (the user enables it
    // via playbook setting). Pair Y + C as the shallow-drag layer; if
    // the coach picked Y as the carrier, fall back to just C.
    slotIds = ["Y", "C"].filter((id) => id !== carrierId);
  } else if (variant === "flag_6v6") {
    // 6v6 typically rosters Q, C, X, Y, Z + one extra slot/back. Try
    // Y + H; the synthesizer drops whichever isn't placed.
    slotIds = ["Y", "H"].filter((id) => id !== carrierId);
  } else {
    // 7v7 + tackle: traditional slot labels.
    slotIds = ["H", "S"].filter((id) => id !== carrierId);
  }
  for (const slot of slotIds) {
    assignments.push(routeAt(slot, "Drag", 4));
  }

  // RB outlet — only when the variant actually places a back. 5v5
  // has no B (or any back: the synthesizer remaps to Y), so skip.
  const variantHasBack = variant !== "flag_5v5";
  if (variantHasBack && carrierId !== "B") {
    assignments.push(routeAt("B", "Flat", 2));
  }

  assignments.push(...lineBlocks(variant));

  return {
    ok: true,
    concept: "Flea Flicker",
    spec: {
      ...baseSpec(variant, `Flea Flicker (${carrierId}) ${cap(side)}`, "Spread Doubles", side, assignments),
      ballPath: [
        { from: "QB", to: carrierId, atPoint: mesh1 },
        { from: carrierId, to: "QB", atPoint: mesh2 },
      ],
    },
    notes:
      `Flea Flicker ${cap(side)}: @QB hands to @${carrierId} just behind the LOS; @${carrierId} runs hard at the line ` +
      `to sell the run, then pitches the ball BACK to @QB still behind the LOS. ` +
      `@QB then throws deep — @${deepSide} on the Post at 18yd is the primary target after the safeties bite on the fake. ` +
      `Best AFTER you've established the run game — the defense has to believe the handoff.`,
  };
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
  // Designed-QB-run / RPO / reverse concepts (2026-05-12 build).
  // Capability-gated at save time — the play-tools resolver rejects
  // the spec when the playbook hasn't enabled the corresponding
  // advancedCapabilities flag.
  "QB Draw":        buildQbDraw,
  "Bubble RPO":     buildBubbleRpo,
  "Jet Reverse":    buildJetReverse,
  // 2026-05-13 build: plain run concepts + the Flea Flicker trick play.
  "Sweep":          buildSweep,
  "Dive":           buildDive,
  "Counter":        buildCounter,
  "Draw":           buildDraw,
  // 2026-05-20: Power — gap-scheme downhill run, distinct from Dive
  // (interior north-south) and Counter (misdirection pull).
  "Power":          buildPower,
  "Flea Flicker":   buildFleaFlicker,
};
