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

/** Compact assignments shape for the 5v5 roster {Q, C, X, Y, Z}.
 *
 *  Phase 2 follow-up (2026-05-24): every concept-builder originally
 *  hardcoded tackle/7v7 IDs (S, H, B). In flag_5v5 the synthesizer
 *  silently drops routes for non-existent IDs, leaving 2-3 of 5
 *  players standing still — the Snag-out-of-Bunch regression. This
 *  helper centralizes the 5v5 roster mapping so each builder's 5v5
 *  branch is a tiny declarative routes block.
 *
 *  The 5v5 mapping convention:
 *  - The "back" role (tackle's @B) maps to @Y. The 5v5 roster has no
 *    traditional backfield runner; @Y absorbs both the slot and the
 *    back roles depending on the play.
 *  - The "inside slot" role (tackle's @H or @S) ALSO maps to @Y
 *    when the back/back-equivalent isn't needed, OR to @C when both
 *    are needed (the center IS an eligible receiver in 5v5; the
 *    snapper-eligible underneath is a real route option).
 *  - @X and @Z keep their outside-receiver roles.
 *
 *  Caller controls collision resolution by passing roles directly:
 *  `flagFiveRoutes({ Y: {family: "Drag", depthYds: 2}, C: {family: "Drag", depthYds: 8} })`.
 *  Optional `direction` on a route forces the lateral side (used for
 *  RB/back flats that need to release wide regardless of natural x). */
function flagFiveRoutes(routes: Record<string, { family: string; depthYds: number; direction?: "left" | "right" }>): PlayerAssignment[] {
  const assignments: PlayerAssignment[] = [];
  for (const [id, r] of Object.entries(routes)) {
    assignments.push(routeAt(id, r.family, r.depthYds, r.direction));
  }
  assignments.push(qbDropback());
  return assignments;
}

/** Compact assignments shape for the 4v4 roster {Q, X, Y, Z} (no C).
 *
 *  In 4v4 there are only 3 eligible receivers. Concepts that rely on a
 *  4th underneath option (Curl-Flat's C-flat, Snag's Spot-route, Mesh's
 *  second drag, 4 Verts's 4th vertical) drop the extra slot and become
 *  legitimate 3-receiver adaptations. The concept-match validator's
 *  LENIENT_PATTERN_VARIANTS set already accepts these for flag_4v4.
 *
 *  Roster mapping convention (analogous to flagFiveRoutes):
 *  - @X and @Z keep their outside-receiver roles
 *  - @Y is the middle/slot eligible — absorbs C-equivalent roles
 *    (snapper-as-eligible, inside-the-trips, underneath outlet)
 *  - There is NO C / RB / FB / TE in 4v4 — caller must not pass those
 *    keys (any non-{X,Y,Z,Q} ids are silently dropped before the
 *    synthesizer fails on unknown players)
 *
 *  Caller pattern: pass {ID: {family, depthYds}} for whichever subset
 *  of X/Y/Z gets a route. QB is added automatically. */
function flagFourRoutes(routes: Record<string, { family: string; depthYds: number }>): PlayerAssignment[] {
  const ALLOWED = new Set(["X", "Y", "Z"]);
  const assignments: PlayerAssignment[] = [];
  for (const [id, r] of Object.entries(routes)) {
    if (!ALLOWED.has(id)) continue;
    assignments.push(routeAt(id, r.family, r.depthYds));
  }
  assignments.push(qbDropback());
  return assignments;
}

/** Compact assignments shape for the 6v6 roster {QB, C, X, H, Z, B}.
 *
 *  Added 2026-05-26 to fix the systemic 6v6 concept regression. Every
 *  pass-concept builder previously fell through to a default branch
 *  that referenced @S (the second slot) — but 6v6 has only ONE slot
 *  (@H), so the renderer silently dropped the @S route on EVERY 6v6
 *  concept. Symptoms: Flood didn't actually flood (missing the
 *  mid-level out), Mesh missed a drag, Drive missed an outlet, etc.
 *
 *  Roster mapping convention:
 *  - @X and @Z keep their outside-receiver roles
 *  - @H is THE slot (no @S — 6v6 has only one slot)
 *  - @B is the back; usually runs an outlet (Flat / Drag) — exists,
 *    unlike 5v5 where the back maps to @Y
 *  - @C is the eligible underneath (same convention as 5v5)
 *
 *  Open formation issue (NOT fixed here): the 6v6 formation synth
 *  places @H at x=+6 (right of center) regardless of `strength`. So
 *  strength="left" makes @H the geographic backside slot. Concept
 *  builders accept this asymmetry — the right fix lives one layer
 *  down in formation synth. Tracking separately. */
function flagSixRoutes(routes: Record<string, { family: string; depthYds: number; direction?: "left" | "right" }>): PlayerAssignment[] {
  const ALLOWED = new Set(["X", "Z", "C", "H", "B"]);
  const assignments: PlayerAssignment[] = [];
  for (const [id, r] of Object.entries(routes)) {
    if (!ALLOWED.has(id)) continue;
    assignments.push(routeAt(id, r.family, r.depthYds, r.direction));
  }
  assignments.push(qbDropback());
  return assignments;
}

// ── Per-concept builders ────────────────────────────────────────────────

function buildCurlFlat(_c: ConceptEntry, opts: ConceptSkeletonOptions): SkeletonResult {
  const variant = opts.variant;
  const side: "left" | "right" = opts.strength ?? "right";
  const outsideWR = side === "right" ? "Z" : "X";
  const backsideWR = side === "right" ? "X" : "Z";
  let assignments: PlayerAssignment[];
  let notes: string;
  if (variant === "flag_4v4") {
    // 4v4 roster {Q,X,Y,Z} — no C. The middle eligible @Y absorbs the
    // flat (low) role that @C plays in 5v5. Three routes total + QB.
    assignments = flagFourRoutes({
      [outsideWR]: { family: "Curl", depthYds: 5 },
      Y: { family: "Flat", depthYds: 4 },
      [backsideWR]: { family: "Go", depthYds: 12 },
    });
    notes =
      `Curl-Flat ${cap(side)}: @${outsideWR} curl @ 5yd (high), @Y flat @ 4yd (low) — high-low on the flat defender (4v4: middle eligible @Y is the underneath outlet). @${backsideWR} go @ 12yd to clear.`;
  } else if (variant === "flag_5v5") {
    // 5v5 roster {Q,C,X,Y,Z}. Curl (high) on outside Z, Flat (low) on
    // C — the snapper-eligible underneath as the high-low partner. Y
    // takes the slot Sit; backside X clears.
    assignments = flagFiveRoutes({
      [outsideWR]: { family: "Curl", depthYds: 5 },
      C: { family: "Flat", depthYds: 4 },
      Y: { family: "Sit", depthYds: 6 },
      [backsideWR]: { family: "Go", depthYds: 18 },
    });
    notes =
      `Curl-Flat ${cap(side)}: @${outsideWR} curl @ 5yd (high), @C flat @ 4yd (low) — high-low on the flat defender (5v5: C is the eligible underneath outlet). @Y sit @ 6yd; @${backsideWR} go @ 18yd to clear.`;
  } else if (variant === "flag_6v6") {
    // 6v6 roster {QB,C,B,X,Z,H}: one slot @H, plus a back @B (unlike
    // 5v5). Maps the 7v7+/tackle shape down: B takes the flat (low),
    // outside WR runs the curl (high), H is the slot sit, backside
    // WR clears, C is the eligible underneath.
    assignments = flagSixRoutes({
      [outsideWR]: { family: "Curl", depthYds: 5 },
      B: { family: "Flat", depthYds: 4, direction: side },
      H: { family: "Sit", depthYds: 6 },
      [backsideWR]: { family: "Go", depthYds: 18 },
      C: { family: "Sit", depthYds: 5 },
    });
    notes =
      `Curl-Flat ${cap(side)} (6v6): @${outsideWR} curl @ 5yd (high), @B flat @ 4yd to the ${side} (low) — high-low on the flat defender. @H sit @ 6yd; @${backsideWR} go @ 18yd to clear; @C sits @ 5yd as the eligible underneath.`;
  } else {
    const slot = side === "right" ? "S" : "H";
    const backsideSlot = side === "right" ? "H" : "S";
    assignments = [
      routeAt(outsideWR, "Curl", 5),     // the curl (high)
      routeAt("B", "Flat", 4),           // the flat (low) — RB swings
      routeAt(slot, "Sit", 6),           // sensible secondary
      routeAt(backsideWR, "Go", 18),     // backside clear
      routeAt(backsideSlot, "Drag", 3),  // backside outlet
      qbDropback(),
      ...lineBlocks(variant),
    ];
    notes =
      `Curl-Flat ${cap(side)}: ${outsideWR} curl @ 5yd (high), B flat @ 4yd (low) — high-low on the flat defender. ` +
      `${slot} sit @ 6yd as secondary, ${backsideWR} go @ 18yd to clear backside.`;
  }
  return {
    ok: true,
    concept: "Curl-Flat",
    spec: baseSpec(variant, `Curl-Flat ${cap(side)}`, "Spread Doubles", side, assignments),
    notes,
  };
}

/**
 * Slant-Flat — quick-game variant of Curl-Flat. Outside receiver runs a
 * slant (5yd inside cut at ~25° above horizontal) instead of a curl;
 * back/slot releases to the flat as the low element of the high-low.
 * Added 2026-05-24 (Phase 1d) to back the Slant-Flat KG concept entry
 * that was previously referenced by reactor patterns but absent from
 * CONCEPT_CATALOG.
 */
function buildSlantFlat(_c: ConceptEntry, opts: ConceptSkeletonOptions): SkeletonResult {
  const variant = opts.variant;
  const side: "left" | "right" = opts.strength ?? "right";
  const outsideWR = side === "right" ? "Z" : "X";
  const backsideWR = side === "right" ? "X" : "Z";
  let assignments: PlayerAssignment[];
  let notes: string;
  if (variant === "flag_4v4") {
    // 4v4: same shape, @Y as the flat outlet (no C).
    assignments = flagFourRoutes({
      [outsideWR]: { family: "Slant", depthYds: 5 },
      Y: { family: "Flat", depthYds: 3 },
      [backsideWR]: { family: "Go", depthYds: 12 },
    });
    notes =
      `Slant-Flat ${cap(side)}: @${outsideWR} slant @ 5yd (high), @Y flat @ 3yd (low) — high-low on the flat defender (4v4: middle eligible underneath). @${backsideWR} go @ 12yd to clear.`;
  } else if (variant === "flag_5v5") {
    // CORRECTED 2026-05-26 (audit finding #7). Prior version put @C
    // (center) on the Flat — but the center can't release outside
    // the outside WR running the slant, so the flat ends up INSIDE
    // the slant route (the catalog's own `commonMistakes` warns
    // against this exact pattern: "Flat releases under the slant;
    // should be on the OUTSIDE so the QB has a clean look at both
    // options"). The center on the LOS has no clean release angle
    // to get outside the slant's release.
    //
    // Fix: @Y (RB) runs the flat with explicit `direction: side`
    // so he releases wide to the flood-side numbers. @C plays the
    // short underneath sit (his natural role from the snap point).
    assignments = flagFiveRoutes({
      [outsideWR]: { family: "Slant", depthYds: 5 },
      Y: { family: "Flat", depthYds: 3, direction: side },
      C: { family: "Sit", depthYds: 5 },
      [backsideWR]: { family: "Go", depthYds: 18 },
    });
    notes =
      `Slant-Flat ${cap(side)}: @${outsideWR} slant @ 5yd (high), @Y flat @ 3yd (low, releases wide to the ${side} numbers) — high-low on the flat defender. @C sits @ 5yd as the eligible underneath; @${backsideWR} go @ 18yd to clear.`;
  } else if (variant === "flag_6v6") {
    // 6v6: B takes the flat (with explicit direction so it goes wide
    // to the flood side regardless of B's natural x), outside slants,
    // H sits, backside clears, C is the eligible underneath.
    assignments = flagSixRoutes({
      [outsideWR]: { family: "Slant", depthYds: 5 },
      B: { family: "Flat", depthYds: 3, direction: side },
      H: { family: "Sit", depthYds: 6 },
      [backsideWR]: { family: "Go", depthYds: 18 },
      C: { family: "Sit", depthYds: 5 },
    });
    notes =
      `Slant-Flat ${cap(side)} (6v6): @${outsideWR} slant @ 5yd (high), @B flat @ 3yd to the ${side} (low) — high-low on the flat defender. @H sit @ 6yd; @${backsideWR} go @ 18yd to clear; @C sits @ 5yd as the eligible underneath.`;
  } else {
    const slot = side === "right" ? "S" : "H";
    const backsideSlot = side === "right" ? "H" : "S";
    assignments = [
      routeAt(outsideWR, "Slant", 5),
      routeAt("B", "Flat", 3),
      routeAt(slot, "Sit", 6),
      routeAt(backsideWR, "Go", 18),
      routeAt(backsideSlot, "Drag", 3),
      qbDropback(),
      ...lineBlocks(variant),
    ];
    notes =
      `Slant-Flat ${cap(side)}: ${outsideWR} slant @ 5yd (high), B flat @ 3yd (low) — high-low on the flat defender. ` +
      `Quick-game variant of Curl-Flat — faster to release, beats press man (slant cuts inside immediately). ` +
      `${slot} sit @ 6yd as secondary, ${backsideWR} go @ 18yd to clear backside.`;
  }
  return {
    ok: true,
    concept: "Slant-Flat",
    spec: baseSpec(variant, `Slant-Flat ${cap(side)}`, "Spread Doubles", side, assignments),
    notes,
  };
}

function buildSmash(_c: ConceptEntry, opts: ConceptSkeletonOptions): SkeletonResult {
  const variant = opts.variant;
  const side: "left" | "right" = opts.strength ?? "right";
  const outsideWR = side === "right" ? "Z" : "X";
  const backsideWR = side === "right" ? "X" : "Z";
  let assignments: PlayerAssignment[];
  let notes: string;
  if (variant === "flag_4v4") {
    // 4v4 Smash: same high-low (Hitch+Corner), backside go to clear.
    // No 4th eligible for an additional flat — the lenient validator
    // accepts the 3-route shape.
    assignments = flagFourRoutes({
      [outsideWR]: { family: "Hitch", depthYds: 5 },
      Y: { family: "Corner", depthYds: 10 },
      [backsideWR]: { family: "Go", depthYds: 12 },
    });
    notes =
      `Smash ${cap(side)}: @${outsideWR} hitch @ 5yd (low), @Y corner @ 10yd (high) — high-low on the corner. @${backsideWR} go @ 12yd to clear backside.`;
  } else if (variant === "flag_5v5") {
    // Smash 5v5: high-low on the corner. Y runs the corner over the
    // outside Hitch; C takes the Flat as the eligible underneath.
    assignments = flagFiveRoutes({
      [outsideWR]: { family: "Hitch", depthYds: 5 },
      Y: { family: "Corner", depthYds: 13 },
      C: { family: "Flat", depthYds: 4 },
      [backsideWR]: { family: "Go", depthYds: 18 },
    });
    notes =
      `Smash ${cap(side)}: @${outsideWR} hitch @ 5yd (low), @Y corner @ 13yd (high) — high-low on the corner. @C flat @ 4yd; @${backsideWR} go @ 18yd to clear backside.`;
  } else if (variant === "flag_6v6") {
    // 6v6 Smash: high-low on the corner. H runs the corner over the
    // outside Hitch; B takes the flat (low). Backside clear; C is
    // the eligible underneath.
    assignments = flagSixRoutes({
      [outsideWR]: { family: "Hitch", depthYds: 5 },
      H: { family: "Corner", depthYds: 13 },
      B: { family: "Flat", depthYds: 4, direction: side },
      [backsideWR]: { family: "Go", depthYds: 18 },
      C: { family: "Sit", depthYds: 5 },
    });
    notes =
      `Smash ${cap(side)} (6v6): @${outsideWR} hitch @ 5yd (low), @H corner @ 13yd (high) — high-low on the corner. @B flat @ 4yd to the ${side}; @${backsideWR} go @ 18yd to clear backside; @C sits @ 5yd as the eligible underneath.`;
  } else {
    const slot = side === "right" ? "S" : "H";
    const backsideSlot = side === "right" ? "H" : "S";
    assignments = [
      routeAt(outsideWR, "Hitch", 5),
      routeAt(slot, "Corner", 13),
      routeAt("B", "Flat", 4),
      routeAt(backsideWR, "Go", 18),
      routeAt(backsideSlot, "Drag", 3),
      qbDropback(),
      ...lineBlocks(variant),
    ];
    notes =
      `Smash ${cap(side)}: ${outsideWR} hitch @ 5yd (low), ${slot} corner @ 13yd (high) — high-low on the cornerback. ` +
      `B flat @ 4yd, ${backsideWR} go @ 18yd to clear backside.`;
  }
  return {
    ok: true,
    concept: "Smash",
    spec: baseSpec(variant, `Smash ${cap(side)}`, "Spread Doubles", side, assignments),
    notes,
  };
}

function buildStick(_c: ConceptEntry, opts: ConceptSkeletonOptions): SkeletonResult {
  const variant = opts.variant;
  const side: "left" | "right" = opts.strength ?? "right";
  const outsideWR = side === "right" ? "Z" : "X";
  const backsideWR = side === "right" ? "X" : "Z";
  if (variant === "flag_4v4") {
    // 4v4 Stick: classic 3-receiver triangle. @Y plays the stick at 6yd,
    // outside WR runs the flat as the low element, backside WR clears.
    const assignments = flagFourRoutes({
      Y: { family: "Sit", depthYds: 6 },
      [outsideWR]: { family: "Flat", depthYds: 4 },
      [backsideWR]: { family: "Go", depthYds: 12 },
    });
    return {
      ok: true,
      concept: "Stick",
      spec: baseSpec(variant, `Stick ${cap(side)}`, "Trips", side, assignments),
      notes:
        `Stick ${cap(side)}: @Y stick @ 6yd, @${outsideWR} flat @ 4yd — high-low on the flat defender (4v4 3-receiver triangle). @${backsideWR} go @ 12yd to clear backside.`,
    };
  }
  if (variant === "flag_5v5") {
    // Stick 5v5: CORRECTED 2026-05-26 (audit finding #3). Prior
    // version had both outside WRs running Hitch @ 5 — which is
    // WRONG because the outside WR (#1) needs to RUN A CLEAR
    // (fade/go) to pull the corner over the top. Without that
    // clear, the corner camps at 5-8yd over the stick and erases
    // the concept's "high-low on the flat defender" stretch. The
    // backside WR's hitch was acceptable, but the strong-side one
    // was breaking the play.
    //
    // Routes:
    //   @Y stick @ 6yd      — the slot stick (sit facing QB)
    //   @C flat @ 4yd       — the eligible underneath (5v5 has C)
    //   @[outsideWR] go @ 18yd — clears the corner (the strong-
    //                            side outside WR)
    //   @[backsideWR] hitch @ 5yd — backside hitch (acceptable
    //                            since the stick side is what
    //                            needs the clear)
    const assignments = flagFiveRoutes({
      Y: { family: "Sit", depthYds: 6 },
      C: { family: "Flat", depthYds: 4 },
      [outsideWR]: { family: "Go", depthYds: 18 },
      [backsideWR]: { family: "Hitch", depthYds: 5 },
    });
    return {
      ok: true,
      concept: "Stick",
      spec: baseSpec(variant, `Stick ${cap(side)}`, "Trips", side, assignments),
      notes:
        `Stick ${cap(side)}: @Y stick @ 6yd, @C flat @ 4yd — high-low (5v5: C is the eligible underneath). @${outsideWR} go @ 18yd clears the corner over the top; @${backsideWR} hitch @ 5yd backside.`,
    };
  }
  if (variant === "flag_6v6") {
    // 6v6 Stick: @H plays the stick (slot sit at 6yd), @B takes the
    // flat (low element), @[outsideWR] clears with Go to pull the
    // corner off the stick, @[backsideWR] runs a hitch backside, @C
    // sits as the eligible underneath.
    const assignments = flagSixRoutes({
      H: { family: "Sit", depthYds: 6 },
      B: { family: "Flat", depthYds: 4, direction: side },
      [outsideWR]: { family: "Go", depthYds: 18 },
      [backsideWR]: { family: "Hitch", depthYds: 5 },
      C: { family: "Sit", depthYds: 5 },
    });
    return {
      ok: true,
      concept: "Stick",
      spec: baseSpec(variant, `Stick ${cap(side)}`, "Trips", side, assignments),
      notes:
        `Stick ${cap(side)} (6v6): @H stick @ 6yd, @B flat @ 4yd to the ${side} — high-low on the flat defender. @${outsideWR} go @ 18yd clears the corner; @${backsideWR} hitch @ 5yd backside; @C sits @ 5yd as the eligible underneath.`,
    };
  }
  const slot = side === "right" ? "S" : "H";
  const backsideSlot = side === "right" ? "H" : "S";
  const assignments: PlayerAssignment[] = [
    routeAt(slot, "Sit", 6),           // the stick
    routeAt("B", "Flat", 4),           // the flat
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
      `Stick ${cap(side)}: ${slot} sit @ 6yd (the 'stick'), B flat @ 4yd — high-low on the flat defender. ` +
      `${outsideWR} clears with go @ 18yd.`,
  };
}

function buildSnag(_c: ConceptEntry, opts: ConceptSkeletonOptions): SkeletonResult {
  const variant = opts.variant;
  const side: "left" | "right" = opts.strength ?? "right";
  const outsideWR = side === "right" ? "Z" : "X";
  const backsideWR = side === "right" ? "X" : "Z";
  let assignments: PlayerAssignment[];
  let notes: string;
  if (variant === "flag_4v4") {
    // 4v4 Snag: only 3 eligibles, so the triangle reduces to
    // Spot+Corner+Flat with no extra clear. Lenient validator
    // accepts the 3-route adaptation as a valid Snag.
    assignments = [
      routeAt("Y", "Spot", 5),
      routeAt(outsideWR, "Corner", 10),
      routeAt(backsideWR, "Flat", 4),
      qbDropback(),
    ];
    notes =
      `Snag ${cap(side)}: @Y spot @ 5yd, @${outsideWR} corner @ 10yd, @${backsideWR} flat @ 4yd — 3-receiver triangle stretch (4v4 adaptation).`;
  } else if (variant === "flag_5v5") {
    // 5v5 roster: {Q, C, X, Y, Z}. No traditional slot or back, so the
    // triangle maps to: Y=Spot (the inside short), C=Flat (the
    // snapper-eligible underneath outlet — required per the 5v5
    // center-is-eligible rule), Z=Corner (deep outside), X=Go
    // (backside clear). Every non-QB player gets a route, satisfying
    // the offensive-coverage gate.
    assignments = [
      routeAt("Y", "Spot", 5),         // the snag/spot
      routeAt(outsideWR, "Corner", 13),// the over
      routeAt("C", "Flat", 4),         // the flat (C as eligible outlet)
      routeAt(backsideWR, "Go", 18),   // backside clear
      qbDropback(),
    ];
    notes =
      `Snag ${cap(side)}: @Y spot @ 5yd, @${outsideWR} corner @ 13yd, @C flat @ 4yd — triangle stretch (5v5: C is the eligible underneath, no traditional back).`;
  } else if (variant === "flag_6v6") {
    // 6v6 Snag: triangle stretch with @H on the spot, outside on the
    // corner, @B on the flat (low). Backside clear; @C sits.
    assignments = [
      routeAt("H", "Spot", 5),
      routeAt(outsideWR, "Corner", 13),
      routeAt("B", "Flat", 4, side),
      routeAt(backsideWR, "Go", 18),
      routeAt("C", "Sit", 5),
      qbDropback(),
    ];
    notes =
      `Snag ${cap(side)} (6v6): @H spot @ 5yd, @${outsideWR} corner @ 13yd, @B flat @ 4yd to the ${side} — triangle stretch. @${backsideWR} go @ 18yd to clear; @C sits @ 5yd as the eligible underneath.`;
  } else {
    // 7v7 + tackle: traditional Trips Bunch with slot + back.
    const slot = side === "right" ? "S" : "H";
    const backsideSlot = side === "right" ? "H" : "S";
    assignments = [
      routeAt(slot, "Spot", 5),          // the snag/spot
      routeAt(outsideWR, "Corner", 13),  // the over
      routeAt("B", "Flat", 4),           // the flat
      routeAt(backsideWR, "Go", 18),
      routeAt(backsideSlot, "Drag", 3),
      qbDropback(),
      ...lineBlocks(variant),
    ];
    notes =
      `Snag ${cap(side)}: ${slot} spot @ 5yd, ${outsideWR} corner @ 13yd, B flat @ 4yd — triangle stretch.`;
  }
  return {
    ok: true,
    concept: "Snag",
    spec: baseSpec(variant, `Snag ${cap(side)}`, "Trips Bunch", side, assignments),
    notes,
  };
}

function buildFourVerts(_c: ConceptEntry, opts: ConceptSkeletonOptions): SkeletonResult {
  const variant = opts.variant;
  if (variant === "flag_4v4") {
    // 4v4 "Four Verticals" → 3 Verts. Three eligibles all run vertical;
    // QB picks the open seam. Lenient validator accepts as Four Verts.
    const assignments = flagFourRoutes({
      X: { family: "Go", depthYds: 12 },
      Y: { family: "Seam", depthYds: 10 },
      Z: { family: "Go", depthYds: 12 },
    });
    return {
      ok: true,
      concept: "Four Verticals",
      spec: baseSpec(variant, "Four Verticals", "Trips", undefined, assignments),
      notes:
        `Four Verticals (4v4 scale → 3 Verts): @X+@Z go routes outside, @Y seam @ 10yd up the middle. With only 3 eligibles, the "fourth vert" simply doesn't exist — QB picks the open seam vs whatever coverage shell the defense shows.`,
    };
  }
  if (variant === "flag_5v5") {
    // Four Verticals in 5v5 is structurally a 3-Verts concept (only 3
    // true receivers besides QB+C): X+Z go, Y seams. C runs a quick
    // outlet (Sit/Stick at 5yd) — eligible per the center-eligible
    // rule. Same vertical-stretch intent, scaled to the roster.
    const assignments = flagFiveRoutes({
      X: { family: "Go", depthYds: 18 },
      Z: { family: "Go", depthYds: 18 },
      Y: { family: "Seam", depthYds: 14 },
      C: { family: "Sit", depthYds: 5 },
    });
    return {
      ok: true,
      concept: "Four Verticals",
      spec: baseSpec(variant, "Four Verticals", "Spread Doubles", undefined, assignments),
      notes:
        `Four Verticals (5v5 scale): @X+@Z go routes outside, @Y seam @ 14yd inside, @C sits @ 5yd as the eligible outlet. 5v5 has only 3 true receivers + C, so the "fourth vert" is replaced by the snap-quick C outlet.`,
    };
  }
  if (variant === "flag_6v6") {
    // 6v6 Four Verts: X+Z go outside, @H seams inside (one slot
    // only), @B checkdown flat, @C eligible underneath sit. Scales
    // the 7v7+ 4-vertical stretch down by one seam.
    const assignments = flagSixRoutes({
      X: { family: "Go", depthYds: 18 },
      Z: { family: "Go", depthYds: 18 },
      H: { family: "Seam", depthYds: 14 },
      B: { family: "Flat", depthYds: 4 },
      C: { family: "Sit", depthYds: 5 },
    });
    return {
      ok: true,
      concept: "Four Verticals",
      spec: baseSpec(variant, "Four Verticals", "Spread Doubles", undefined, assignments),
      notes:
        `Four Verticals (6v6 scale): @X+@Z go routes outside, @H seam @ 14yd inside (6v6 has one slot), @B flat @ 4yd as the checkdown, @C sits @ 5yd as the eligible outlet. The "fourth vert" simplifies to a single inside seam plus a checkdown.`,
    };
  }
  const assignments: PlayerAssignment[] = [
    routeAt("X", "Go", 18),
    routeAt("Z", "Go", 18),
    routeAt("H", "Seam", 18),
    routeAt("S", "Seam", 18),
    routeAt("B", "Flat", 4),  // checkdown
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
  // Canonical Mesh depths (audit finding #9, 2026-05-26): BOTH
  // drags at 5-6yd with 1yd of vertical separation at the mesh
  // point. The prior 2/8 was a deliberate rendering workaround
  // from 2026-05-02 (3+5 and 2+6 were visually unclear in the
  // chat preview); the play editor's depth precision is now
  // sufficient to distinguish 5 vs 6 cleanly, so we revert to
  // the football-correct geometry.
  if (variant === "flag_4v4") {
    // 4v4 Mesh: two outside WRs cross at 5+6; @Y is the over-the-
    // top outlet.
    const assignments = flagFourRoutes({
      X: { family: "Drag", depthYds: 5 },
      Z: { family: "Drag", depthYds: 6 },
      Y: { family: "Curl", depthYds: 10 },
    });
    return {
      ok: true,
      concept: "Mesh",
      spec: baseSpec(variant, "Mesh", "Trips", undefined, assignments),
      notes:
        `Mesh (4v4): @X under-drag @ 5yd + @Z over-drag @ 6yd — the two outside WRs cross from opposite sides with 1yd of vertical separation at the mesh point. @Y curl @ 10yd over the top as the eligible underneath outlet.`,
    };
  }
  if (variant === "flag_5v5") {
    // Mesh 5v5: @Y (RB) + @X (outside WR) cross at 5+6; @C plays
    // the underneath sit (no clean release angle to cross from the
    // snap point); @Z clears.
    const assignments = flagFiveRoutes({
      Y: { family: "Drag", depthYds: 5 },
      X: { family: "Drag", depthYds: 6 },
      C: { family: "Sit", depthYds: 5 },
      Z: { family: "Go", depthYds: 18 },
    });
    return {
      ok: true,
      concept: "Mesh",
      spec: baseSpec(variant, "Mesh", "Spread Doubles", undefined, assignments),
      notes:
        `Mesh (5v5): @Y under-drag @ 5yd + @X over-drag @ 6yd — RB and outside WR cross from opposite sides with 1yd of vertical separation at the mesh point. @C sits @ 5yd as the eligible underneath outlet (center has no clean release angle from the snap point); @Z go @ 18yd clears the strong side.`,
    };
  }
  if (variant === "flag_6v6") {
    // Mesh 6v6: the two crossers come from OPPOSITE sides. @H (slot
    // at x=+6) under-drags right-to-left; @X (outside, x=-10)
    // over-drags left-to-right — 1yd of vertical separation at the
    // mesh point. @Z clears the right; @B flat as outlet.
    //
    // @C sits at 4yd (NOT 5+yd) intentionally: a Sit @ 5–7yd
    // combined with a Flat @ 0–4yd matches the Stick concept's
    // pattern exactly, so detectConcept would label the diagram
    // "Stick" in the prose lead. Sit @ 4 stays a valid Sit (catalog
    // range [3,7]) but moves it below Stick's required [5,7]. Same
    // adjustment applies to Drive / Levels / Dagger 6v6 below.
    const assignments = flagSixRoutes({
      H: { family: "Drag", depthYds: 5 },
      X: { family: "Drag", depthYds: 6 },
      Z: { family: "Go", depthYds: 18 },
      B: { family: "Flat", depthYds: 4 },
      C: { family: "Sit", depthYds: 4 },
    });
    return {
      ok: true,
      concept: "Mesh",
      spec: baseSpec(variant, "Mesh", "Spread Doubles", undefined, assignments),
      notes:
        `Mesh (6v6): @H under-drag @ 5yd + @X over-drag @ 6yd — slot and outside WR cross from opposite sides with 1yd of vertical separation at the mesh point. @Z go @ 18yd clears; @B flat @ 4yd as outlet; @C sits @ 4yd as the eligible underneath.`,
    };
  }
  // 7v7+/tackle: inside slots run the crossing drags (H under, S over).
  // X curls over the top, Z clears, B is the flat outlet.
  const assignments: PlayerAssignment[] = [
    routeAt("H", "Drag", 5),    // under-drag
    routeAt("S", "Drag", 6),    // over-drag (1yd above the under)
    // X runs a Curl @ 12yd: deeper than the over-drag, settles facing
    // the QB. Was Sit @ 12 before 2026-05-20 but Sit's canonical range
    // is [3, 7] — that combination tripped the save-time route-
    // assignment validator (route_kind="Sit" cannot be 12 yds). Curl
    // [4, 13] is the right family for a deep settle facing QB.
    routeAt("X", "Curl", 12),
    routeAt("Z", "Go", 18),     // single deep clear
    routeAt("B", "Flat", 4),    // outlet
    qbDropback(),
    ...lineBlocks(variant),
  ];
  return {
    ok: true,
    concept: "Mesh",
    spec: baseSpec(variant, "Mesh", "Spread Doubles", undefined, assignments),
    notes:
      `Mesh: H under-drag @ 5yd + S over-drag @ 6yd — 1yd of vertical separation at the mesh point, canonical Air Raid depths. X sits @ 12yd over the top, Z clears with go @ 18yd, B is the flat outlet.`,
  };
}

function buildFlood(_c: ConceptEntry, opts: ConceptSkeletonOptions): SkeletonResult {
  const variant = opts.variant;
  const side: "left" | "right" = opts.strength ?? "right";
  const outsideWR = side === "right" ? "Z" : "X";
  const backsideWR = side === "right" ? "X" : "Z";
  if (variant === "flag_4v4") {
    // 4v4 Flood: three levels to the strong side stretches the
    // defense without needing 5 receivers. Outside corner (high),
    // Y out (mid), backside WR drags toward the flood as the low.
    // With only 3 eligibles there's no "backside clear" — the
    // backside drag IS the low element of the flood.
    const assignments = flagFourRoutes({
      [outsideWR]: { family: "Corner", depthYds: 10 },
      Y: { family: "Out", depthYds: 6 },
      [backsideWR]: { family: "Drag", depthYds: 3 },
    });
    return {
      ok: true,
      concept: "Flood",
      spec: baseSpec(variant, `Flood ${cap(side)}`, "Trips", side, assignments),
      notes:
        `Flood ${cap(side)} (4v4 3-level): @${outsideWR} corner @ 10yd (high), @Y out @ 6yd (mid), @${backsideWR} drag @ 3yd (low, crosses ${side === "right" ? "left-to-right" : "right-to-left"} into the flood). Three-level vertical stretch using all 3 eligibles.`,
    };
  }
  if (variant === "flag_5v5") {
    // Flood 5v5: three levels to the strong side. Outside corner @ 14
    // (high), Y out @ 8 (mid, second-level break), C flat @ 4 (low —
    // eligible underneath). Backside X clears.
    //
    // CORRECTED 2026-05-26 (audit finding #13). @C's flat needs an
    // explicit `direction: side` override because the center lines
    // up at x≈0 (centered on the snap) — without the override the
    // Flat template infers direction from the player's natural x,
    // which is ambiguous for a center. The override forces the
    // flat to the FLOOD side, so all three levels stack on the
    // same side as canonical Flood requires. Mirrors the fix
    // applied to tackle's @B flat in the same builder.
    const assignments = flagFiveRoutes({
      [outsideWR]: { family: "Corner", depthYds: 14 },
      Y: { family: "Out", depthYds: 8 },
      C: { family: "Flat", depthYds: 4, direction: side },
      [backsideWR]: { family: "Go", depthYds: 18 },
    });
    return {
      ok: true,
      concept: "Flood",
      spec: baseSpec(variant, `Flood ${cap(side)}`, "Spread Doubles", side, assignments),
      notes:
        `Flood ${cap(side)} (5v5): @${outsideWR} corner @ 14yd (deep), @Y out @ 8yd (mid), @C flat @ 4yd (low — eligible underneath, releases to the ${side} flood side). @${backsideWR} go @ 18yd to clear backside. Three strong-side levels stretch the corner + flat defender.`,
    };
  }
  if (variant === "flag_6v6") {
    // **6v6 FLOOD — fixed 2026-05-26.** The prior fallthrough emitted
    // an @S Out @ 8yd that the renderer silently dropped (no @S in the
    // 6v6 roster), so the diagram had only 2 levels instead of 3 and
    // the concept stopped being a flood — coach surfaced this. The
    // 6v6 mapping:
    //   high : @[outsideWR] corner @ 14
    //   mid  : @H out @ 8 (the slot — 6v6's only slot, conveniently
    //          at x=+6 so the "mid out" naturally goes to the right
    //          when strength=right)
    //   low  : @B flat @ 4 (with explicit direction so it releases
    //          wide to the flood side regardless of B's natural x)
    //   clear: @[backsideWR] go @ 18 to clear the backside safety
    //   outlet: @C sits @ 5 as the eligible underneath
    //
    // Note (formation issue): @H is fixed at x=+6 by the 6v6 synth
    // regardless of strength. For strength="left" the mid-out goes
    // backside — not ideal but doesn't drop a route. Tracked
    // separately at the formation layer.
    const assignments = flagSixRoutes({
      [outsideWR]: { family: "Corner", depthYds: 14 },
      H: { family: "Out", depthYds: 8 },
      B: { family: "Flat", depthYds: 4, direction: side },
      [backsideWR]: { family: "Go", depthYds: 18 },
      C: { family: "Sit", depthYds: 5 },
    });
    return {
      ok: true,
      concept: "Flood",
      spec: baseSpec(variant, `Flood ${cap(side)}`, "Spread Doubles", side, assignments),
      notes:
        `Flood ${cap(side)} (6v6): @${outsideWR} corner @ 14yd (deep), @H out @ 8yd (mid), @B flat @ 4yd to the ${side} (low) — three strong-side levels stretch the cornerback and flat defender. @${backsideWR} go @ 18yd to clear backside; @C sits @ 5yd as the eligible underneath.`,
    };
  }
  const slot = side === "right" ? "S" : "H";
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
  //
  // 6v6 special case from 2026-05-24 was DELETED 2026-05-26 — 6v6
  // now has its own builder branch above (no longer falls through
  // here), so this path is reached only for 7v7+/tackle.
  const assignments: PlayerAssignment[] = [
    routeAt(outsideWR, "Corner", 14),       // strong-side outside, deep corner
    routeAt(slot, "Out", 8),                // strong-side slot, second-level out
    routeAt("B", "Flat", 4, side),          // RB flat to the flood side (explicit direction)
    routeAt(backsideWR, "Go", 18),          // backside outside, deep clear
    routeAt(backsideSlot, "Drag", 3, side), // shallow cross toward flood
    qbDropback(),
    ...lineBlocks(variant),
  ];
  return {
    ok: true,
    concept: "Flood",
    spec: baseSpec(variant, `Flood ${cap(side)}`, "Spread Doubles", side, assignments),
    notes:
      `Flood ${cap(side)}: ${outsideWR} corner @ 14yd (deep), ${slot} out @ 8yd (mid — second level break to the sideline), B flat @ 4yd (low — RB swings ${side}). ${backsideWR} go @ 18yd (backside clear), ${backsideSlot} drag @ 3yd (crosses ${side === "right" ? "left-to-right" : "right-to-left"} toward the flood as outlet). Three strong-side levels stretch the cornerback and flat defender; backside drag gives the QB a hot read vs blitz.`,
  };
}

function buildDrive(_c: ConceptEntry, opts: ConceptSkeletonOptions): SkeletonResult {
  const variant = opts.variant;
  if (variant === "flag_4v4") {
    // 4v4 Drive: under-drag + over-dig high-low on the middle. With
    // only 3 eligibles the backside is the deep clear.
    const assignments = flagFourRoutes({
      Y: { family: "Drag", depthYds: 3 },
      X: { family: "Dig", depthYds: 10 },
      Z: { family: "Go", depthYds: 12 },
    });
    return {
      ok: true,
      concept: "Drive",
      spec: baseSpec(variant, "Drive", "Spread", undefined, assignments),
      notes:
        `Drive (4v4): @Y under-drag @ 3yd + @X dig @ 10yd over the top — two crossers attacking the middle at differentiated depths. @Z go @ 12yd to clear backside.`,
    };
  }
  if (variant === "flag_5v5") {
    const assignments = flagFiveRoutes({
      Y: { family: "Drag", depthYds: 3 },
      X: { family: "Dig", depthYds: 12 },
      Z: { family: "Go", depthYds: 18 },
      C: { family: "Sit", depthYds: 5 },
    });
    return {
      ok: true,
      concept: "Drive",
      spec: baseSpec(variant, "Drive", "Spread Doubles", undefined, assignments),
      notes:
        `Drive (5v5): @Y under-drag @ 3yd + @X dig @ 12yd over the top — two crossers at differentiated depths. @Z deep clear; @C sits @ 5yd as the eligible underneath.`,
    };
  }
  if (variant === "flag_6v6") {
    // 6v6 Drive: @H under-drag, @X dig over the top, @Z deep clear,
    // @B flat as checkdown, @C eligible underneath sit. @C Sit @ 4
    // (not 5+) to avoid satisfying Stick's Sit [5–7] + Flat [0–4]
    // pattern — see the comment on Mesh 6v6 above.
    const assignments = flagSixRoutes({
      H: { family: "Drag", depthYds: 3 },
      X: { family: "Dig", depthYds: 12 },
      Z: { family: "Go", depthYds: 18 },
      B: { family: "Flat", depthYds: 4 },
      C: { family: "Sit", depthYds: 4 },
    });
    return {
      ok: true,
      concept: "Drive",
      spec: baseSpec(variant, "Drive", "Spread Doubles", undefined, assignments),
      notes:
        `Drive (6v6): @H under-drag @ 3yd + @X dig @ 12yd over the top — two crossers attacking the middle at differentiated depths. @Z deep clear; @B flat @ 4yd as checkdown; @C sits @ 4yd as the eligible underneath.`,
    };
  }
  const assignments: PlayerAssignment[] = [
    routeAt("H", "Drag", 3),    // under (the rub)
    routeAt("X", "Dig", 12),    // over (the void route)
    routeAt("Z", "Go", 18),     // backside clear
    routeAt("S", "Sit", 6),     // backside outlet
    routeAt("B", "Flat", 4),    // checkdown
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
  // CORRECTED 2026-05-26 (audit finding #6). Canonical Levels has
  // BOTH in-breakers on the SAME side, stacked to high-low the
  // hook/curl defender (and the corner). The prior implementation
  // put the In route on the slot and the Dig on the BACKSIDE
  // outside WR — opposite sides — which loses the same-side high-
  // low stretch the concept depends on.
  //
  // Fix: route the dig to the STRONG-SIDE outside WR (above the
  // strong-side slot's in-route), and clear the backside with the
  // weak-side outside WR. Same-side stack of in-breakers.
  const variant = opts.variant;
  const side: "left" | "right" = opts.strength ?? "right";
  const strongOutside = side === "right" ? "Z" : "X";
  const backsideOutside = side === "right" ? "X" : "Z";
  if (variant === "flag_4v4") {
    // 4v4 Levels: in 4v4, @Y is the only inside receiver, so he
    // takes the low in-route. The strong outside takes the dig.
    // Backside clear pulls the deep defender.
    const assignments = flagFourRoutes({
      Y: { family: "In", depthYds: 6 },
      [strongOutside]: { family: "Dig", depthYds: 10 },
      [backsideOutside]: { family: "Go", depthYds: 12 },
    });
    return {
      ok: true,
      concept: "Levels",
      spec: baseSpec(variant, `Levels ${cap(side)}`, "Spread", side, assignments),
      notes:
        `Levels ${cap(side)} (4v4): @Y in @ 6yd (low) + @${strongOutside} dig @ 10yd (high) — both in-breaking on the strong side. @${backsideOutside} go @ 12yd to clear backside.`,
    };
  }
  if (variant === "flag_5v5") {
    // 5v5 Levels: @Y is the inside/RB and takes the low In. Strong-
    // side outside takes the Dig at 12. Backside clear; @C eligible
    // underneath sit.
    const assignments = flagFiveRoutes({
      Y: { family: "In", depthYds: 7 },
      [strongOutside]: { family: "Dig", depthYds: 12 },
      [backsideOutside]: { family: "Go", depthYds: 18 },
      C: { family: "Sit", depthYds: 5 },
    });
    return {
      ok: true,
      concept: "Levels",
      spec: baseSpec(variant, `Levels ${cap(side)}`, "Spread Doubles", side, assignments),
      notes:
        `Levels ${cap(side)} (5v5): @Y in @ 7yd (low) + @${strongOutside} dig @ 12yd (high) — both in-breaking on the strong side. @${backsideOutside} clears backside; @C sits @ 5yd as the eligible underneath.`,
    };
  }
  if (variant === "flag_6v6") {
    // 6v6 Levels: @H runs the low In (slot at x=+6, naturally on
    // the right when strength=right → strong side); @strongOutside
    // runs the Dig over the top; @backsideOutside clears; @B flat
    // as outlet; @C sits as eligible underneath at depth 4 (not 5+)
    // — see Mesh 6v6 comment for the detectConcept anti-Stick reason.
    const assignments = flagSixRoutes({
      H: { family: "In", depthYds: 7 },
      [strongOutside]: { family: "Dig", depthYds: 12 },
      [backsideOutside]: { family: "Go", depthYds: 18 },
      B: { family: "Flat", depthYds: 4 },
      C: { family: "Sit", depthYds: 4 },
    });
    return {
      ok: true,
      concept: "Levels",
      spec: baseSpec(variant, `Levels ${cap(side)}`, "Spread Doubles", side, assignments),
      notes:
        `Levels ${cap(side)} (6v6): @H in @ 7yd (low) + @${strongOutside} dig @ 12yd (high) — both in-breaking on the strong side, high-low on the hook/curl defender. @${backsideOutside} clears; @B checkdown; @C sits @ 4yd as the eligible underneath.`,
    };
  }
  // 7v7+/tackle: strong slot runs the low In; strong outside runs the
  // Dig over the top; backside outside clears.
  const strongSlot = side === "right" ? "S" : "H";
  const backsideSlot = side === "right" ? "H" : "S";
  const assignments: PlayerAssignment[] = [
    routeAt(strongSlot, "In", 7),         // low in (strong side)
    routeAt(strongOutside, "Dig", 12),    // high dig (over the in, SAME side)
    routeAt(backsideOutside, "Go", 18),   // backside clear
    routeAt(backsideSlot, "Sit", 6),      // backside outlet
    routeAt("B", "Flat", 4),
    qbDropback(),
    ...lineBlocks(variant),
  ];
  return {
    ok: true,
    concept: "Levels",
    spec: baseSpec(variant, `Levels ${cap(side)}`, "Spread Doubles", side, assignments),
    notes:
      `Levels ${cap(side)}: @${strongSlot} in @ 7yd (low) + @${strongOutside} dig @ 12yd (high) — both in-breaking on the strong side, high-low on the hook/curl defender. @${backsideOutside} clears, @B checkdown.`,
  };
}

function buildYCross(_c: ConceptEntry, opts: ConceptSkeletonOptions): SkeletonResult {
  const variant = opts.variant;
  if (variant === "flag_5v5") {
    // Y-Cross 5v5: @Y already exists as the inside receiver and runs
    // the deep cross. @X post clears the safety. @C flat as the
    // eligible underneath outlet. @Z backside go.
    const assignments = flagFiveRoutes({
      Y: { family: "Dig", depthYds: 15 },
      X: { family: "Post", depthYds: 14 },
      C: { family: "Flat", depthYds: 4 },
      Z: { family: "Go", depthYds: 18 },
    });
    return {
      ok: true,
      concept: "Y-Cross",
      spec: baseSpec(variant, "Y-Cross", "Singleback", undefined, assignments),
      notes:
        `Y-Cross (5v5): @Y deep cross @ 15yd, @X post @ 14yd to clear the safety, @C flat @ 4yd outlet. @Z backside go @ 18yd.`,
    };
  }
  if (variant === "flag_6v6") {
    // Y-Cross 6v6: no @Y in this variant's Singleback roster. @H
    // (the slot) runs the deep cross in place of the Y/TE; @X
    // posts to clear the safety; @B flat as outlet; @Z backside
    // clear; @C sits as eligible underneath.
    const assignments = flagSixRoutes({
      H: { family: "Dig", depthYds: 15 },
      X: { family: "Post", depthYds: 14 },
      B: { family: "Flat", depthYds: 4 },
      Z: { family: "Go", depthYds: 18 },
      C: { family: "Sit", depthYds: 5 },
    });
    return {
      ok: true,
      concept: "Y-Cross",
      spec: baseSpec(variant, "Y-Cross", "Singleback", undefined, assignments),
      notes:
        `Y-Cross (6v6): @H runs the deep cross @ 15yd (6v6 has no @Y/TE — the slot fills the role); @X post @ 14yd clears the safety; @B flat @ 4yd outlet; @Z backside go; @C sits @ 5yd as the eligible underneath.`,
    };
  }
  // "Singleback" formation produces a Y/TE (which Y-Cross requires by
  // definition — the Y is the deep crosser). Spread Doubles has no Y,
  // so a Y-Cross skeleton emitted under that formation would silently
  // drop the @Y assignment when synthesized.
  const assignments: PlayerAssignment[] = [
    routeAt("Y", "Dig", 15),    // the Y/TE deep cross
    routeAt("X", "Post", 14),   // the clear (post)
    routeAt("B", "Flat", 4),    // the outlet
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
      `Y-Cross: Y deep cross @ 15yd, X post @ 14yd to clear the safety, B flat @ 4yd outlet — triangle stretch. Z backside clear. Singleback formation provides the Y/TE.`,
  };
}

function buildDagger(_c: ConceptEntry, opts: ConceptSkeletonOptions): SkeletonResult {
  const variant = opts.variant;
  if (variant === "flag_5v5") {
    // X Dig @ 15 (not 12) so the depth falls inside Dagger's
    // required Dig [14,16] range and detectConcept counts it as
    // a satisfied slot. Without this, 5v5 Dagger labels itself as
    // Four Verticals because Four Verts's lenient 2-Go-1-Seam
    // partial outscored Dagger's 1-of-2 strict partial.
    const assignments = flagFiveRoutes({
      Y: { family: "Seam", depthYds: 14 },
      X: { family: "Dig", depthYds: 15 },
      Z: { family: "Go", depthYds: 18 },
      C: { family: "Sit", depthYds: 5 },
    });
    return {
      ok: true,
      concept: "Dagger",
      spec: baseSpec(variant, "Dagger", "Spread Doubles", undefined, assignments),
      notes:
        `Dagger (5v5): @Y seam @ 14yd (vertical clear) + @X dig @ 15yd (in the void) — same vertical-stretch + dig logic as 7v7/tackle. @Z deep clear; @C sits @ 5yd as the eligible outlet.`,
    };
  }
  if (variant === "flag_6v6") {
    // Dagger 6v6: @H seam (clear) + @X dig (in the void behind LB),
    // @Z backside go, @B flat outlet, @C eligible sit.
    // - X Dig @ 15 (not 12) so the depth lands inside Dagger's
    //   required Dig [14,16] range and the concept matcher counts
    //   it as satisfied.
    // - C Sit @ 4 (not 5+) to stay out of Stick's Sit [5,7] range
    //   (see Mesh 6v6 comment for context).
    const assignments = flagSixRoutes({
      H: { family: "Seam", depthYds: 14 },
      X: { family: "Dig", depthYds: 15 },
      Z: { family: "Go", depthYds: 18 },
      B: { family: "Flat", depthYds: 4 },
      C: { family: "Sit", depthYds: 4 },
    });
    return {
      ok: true,
      concept: "Dagger",
      spec: baseSpec(variant, "Dagger", "Spread Doubles", undefined, assignments),
      notes:
        `Dagger (6v6): @H seam @ 14yd (vertical clear) + @X dig @ 15yd (in the void). @Z deep clear; @B flat outlet; @C sits @ 4yd as the eligible underneath.`,
    };
  }
  const assignments: PlayerAssignment[] = [
    routeAt("H", "Seam", 18),   // the clear (vertical seam)
    routeAt("X", "Dig", 15),    // the deep dig in the void
    routeAt("Z", "Go", 18),     // backside clear
    routeAt("S", "Sit", 6),
    routeAt("B", "Flat", 4),
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
  // QB carry is variant-agnostic.
  const qbCarry: PlayerAssignment = {
    player: "QB",
    confidence: "high",
    action: { kind: "carry", runType: "draw", waypoints: [[0, -3], [0, 2], [0, 6]] },
  };
  // Variant-specific receiver assignments. Canonical QB Draw uses
  // VERTICAL CLEARS (Go's + Seams) to pull defenders AWAY from the
  // run lane the QB is about to attack. The previous version
  // assigned routes to @H + @S + @B universally — but those IDs
  // don't exist in 5v5 (no B/H/S) or 6v6 (no S), so the renderer
  // silently dropped those routes and the QB ran through traffic
  // that hadn't been pulled deep. Per-variant branches now match
  // each roster's actual receivers.
  let assignments: PlayerAssignment[];
  if (variant === "flag_5v5") {
    // 5v5 roster {QB, C, X, Y, Z}: no @B (so no pass-block back).
    // @Y plays the back-equivalent role and stays in to "block"
    // (model as a short Sit; pass-blocking isn't a real flag
    // mechanic). All three WRs run vertical clears; @C eligible
    // sit.
    assignments = [
      qbCarry,
      routeAt("X", "Go", 18),
      routeAt("Z", "Go", 18),
      routeAt("Y", "Sit", 5),
      routeAt("C", "Sit", 5),
    ];
  } else if (variant === "flag_6v6") {
    // 6v6 roster {QB, C, B, X, Z, H}: @B stays in (sells pass),
    // @X+@Z clear, @H seams, @C sits.
    assignments = [
      qbCarry,
      { player: "B", confidence: "high", action: { kind: "block", target: "blitz" } },
      routeAt("X", "Go", 18),
      routeAt("Z", "Go", 18),
      routeAt("H", "Seam", 18),
      routeAt("C", "Sit", 5),
    ];
  } else {
    // 7v7 + tackle: @B blocks, all WRs clear, both slots seam.
    assignments = [
      qbCarry,
      { player: "B", confidence: "high", action: { kind: "block", target: "blitz" } },
      routeAt("X", "Go", 18),
      routeAt("Z", "Go", 18),
      routeAt("H", "Seam", 18),
      routeAt("S", "Seam", 18),
      ...lineBlocks(variant),
    ];
  }
  // Note we do NOT include qbDropback(): the QB is the runner.
  return {
    ok: true,
    concept: "QB Draw",
    spec: baseSpec(variant, "QB Draw", "Spread Doubles", undefined, assignments),
    notes:
      `QB Draw: QB takes the snap, hesitates as if reading, then runs straight up the middle. ` +
      `OL pass-sets to sell pass; receivers run VERTICAL CLEARS (gos + seams) to pull defenders AWAY from the run lane. ` +
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
  const bubbleOutside = side === "right" ? "Z" : "X";
  const backsideOutside = side === "right" ? "X" : "Z";
  // Per-variant slot mapping. The bubble runner is the strong-side
  // slot in 7v7+/tackle, but 5v5/6v6 have only one slot each — so
  // they get fold-down treatments. We also need to drop @B-as-back
  // in 5v5 (no @B in roster) and substitute @Y.
  if (variant === "flag_5v5") {
    // 5v5 roster {QB, C, X, Y, Z}: no @B, no @S, no @H. The bubble
    // option is @Y (the slot/back hybrid in 5v5). The Inside Zone
    // give isn't really an option without a back, so model it as
    // QB keep — but that requires `designed_qb_run`. Simpler: drop
    // the run option and route this as a true Bubble screen +
    // backside clear. RPO purity drops, but the geometry renders.
    const assignments: PlayerAssignment[] = [
      {
        player: "QB",
        confidence: "high",
        action: {
          kind: "rpo_read",
          keyDefenderRole: "playside_lb",
          giveTo: "Y",
          passTo: "Y",
          pullIf: "in",
        },
      },
      routeAt("Y", "Bubble", 1, side),
      routeAt(bubbleOutside, "Hitch", 5),
      routeAt(backsideOutside, "Go", 18),
      routeAt("C", "Sit", 5),
    ];
    return {
      ok: true,
      concept: "Bubble RPO",
      spec: baseSpec(variant, `Bubble RPO ${cap(side)} (5v5)`, "Spread Doubles", side, assignments),
      notes:
        `Bubble RPO ${cap(side)} (5v5): QB reads the playside LB. @Y runs the bubble to the ${side} (5v5 has one slot). @${bubbleOutside} hitch in front; @${backsideOutside} go to clear backside; @C sits as eligible underneath.`,
    };
  }
  if (variant === "flag_6v6") {
    // 6v6 roster {QB, C, B, X, Z, H}: one slot @H. @H runs the
    // bubble (regardless of strength — 6v6 places H at x=+6 so the
    // bubble naturally goes to the right; strength="left" makes
    // the bubble go backside, a known formation issue tracked
    // separately).
    const assignments: PlayerAssignment[] = [
      {
        player: "QB",
        confidence: "high",
        action: {
          kind: "rpo_read",
          keyDefenderRole: "playside_lb",
          giveTo: "B",
          passTo: "H",
          pullIf: "in",
        },
      },
      { player: "B", confidence: "high", action: { kind: "carry", runType: "inside_zone" } },
      routeAt("H", "Bubble", 1, side),
      routeAt(bubbleOutside, "Hitch", 5),
      routeAt(backsideOutside, "Go", 18),
      routeAt("C", "Sit", 5),
    ];
    return {
      ok: true,
      concept: "Bubble RPO",
      spec: baseSpec(variant, `Bubble RPO ${cap(side)} (6v6)`, "Spread Doubles", side, assignments),
      notes:
        `Bubble RPO ${cap(side)} (6v6): QB reads the playside LB. If he fills the run, pull and throw to @H on the bubble. If he stays wide, give to @B on Inside Zone. @${bubbleOutside} hitch in front of the bubble; @${backsideOutside} go to clear backside; @C sits as eligible underneath.`,
    };
  }
  // 7v7+/tackle: traditional bubble RPO with two slots.
  const bubbleSlot = side === "right" ? "S" : "H";
  const backsideSlot = side === "right" ? "H" : "S";
  const assignments: PlayerAssignment[] = [
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
    { player: "B", confidence: "high", action: { kind: "carry", runType: "inside_zone" } },
    routeAt(bubbleSlot, "Bubble", 1, side),
    // Outside receiver to the bubble side: in tackle, must stalk-
    // block the corner. In flag, Hitch @ 5 satisfies the offensive-
    // coverage gate (flag has no stalk-block mechanic).
    variant === "tackle_11"
      ? {
          player: bubbleOutside,
          confidence: "high",
          action: { kind: "block", target: "corner" },
        }
      : routeAt(bubbleOutside, "Hitch", 5),
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
 * Jet Reverse — two-handoff misdirection. CORRECTED 2026-05-26
 * (audit finding #5).
 *
 * Prior implementation had @B as the first carrier — no jet motion
 * modeled — which made this a "Counter Reverse" in disguise rather
 * than a true jet reverse. The defining mechanic of Jet Reverse is
 * the pre-snap motion: a WR sprinting across the formation full-
 * speed, taking the handoff IN STRIDE, then handing back to the
 * weak-side reverse runner.
 *
 * Corrected flow:
 *   1. Strong-side outside WR (the JET) starts in pre-snap motion
 *      across the formation toward the weak side.
 *   2. QB hands to the JET as the jet crosses behind the QB.
 *   3. Jet runs a few yards opposite the original strength (into
 *      the play's "strong" direction), then hands BACKWARDS to the
 *      reverse carrier (a WR coming from the OPPOSITE side).
 *   4. Reverse carrier attacks the perimeter on the OPPOSITE side
 *      from where the jet motion was going (real opposite-flow
 *      misdirection).
 *
 * Two-step ballPath: QB → jet, jet → reverse carrier.
 *
 * @B is now a blocker/fake, not the first carrier — matches what
 * coaches actually run.
 *
 * Strength: defaults to "right" — the jet motions from right→left
 * (across the formation), takes the handoff, then the reverse
 * comes back to the right (the original strong side). Mirrors
 * when strength === "left".
 */
function buildJetReverse(_c: ConceptEntry, opts: ConceptSkeletonOptions): SkeletonResult {
  const variant = opts.variant;
  const side: "left" | "right" = opts.strength ?? "right";
  const sideSign = side === "right" ? 1 : -1;
  // The jet motion WR: the strong-side outside WR. He motions FROM
  // the strong side ACROSS the formation, taking the handoff as he
  // crosses the QB.
  const jetWR = side === "right" ? "Z" : "X";
  // Reverse carrier: comes from the WEAK side and runs BACK to the
  // strong side after the handback.
  const reverseCarrier = side === "right" ? "X" : "Z";
  // Mesh points:
  //   mesh1 = QB→jet handoff, right behind QB on the strong side
  //           (jet has crossed from his alignment to here at speed)
  //   mesh2 = jet→reverseCarrier handback, a few yards opposite
  //           strength — the jet has carried the ball briefly
  //           AGAINST the original motion direction, selling the
  //           run; reverse carrier catches the handback and runs
  //           back to the original strong side
  const mesh1: [number, number] = [sideSign * 1, -3];
  const mesh2: [number, number] = [-sideSign * 3, -3];
  const assignments: PlayerAssignment[] = [
    // QB hands and gets out of the way — block / no further role.
    { player: "QB", confidence: "high", action: { kind: "block" } },
    // Jet motion WR — pre-snap motion explicit on the action, then
    // the carry path describes the in-stride handoff + brief carry
    // before the handback. Waypoints start at the jet's natural
    // alignment (~ sideSign * 10 yds outside, behind the LOS), go
    // through mesh1 (handoff in stride), continue briefly to mesh2
    // (handback to reverse carrier). The renderer reads this as a
    // motion-then-carry path; the leading waypoint outside the
    // formation signals the motion origin.
    {
      player: jetWR,
      confidence: "high",
      action: {
        kind: "carry",
        waypoints: [
          [sideSign * 10, -1], // pre-snap motion origin (outside WR alignment)
          mesh1,                // QB→jet handoff in stride
          mesh2,                // jet→reverse handback
        ],
      },
    },
    // Reverse carrier — takes the handback at mesh2 and runs back
    // to the original STRONG side perimeter.
    {
      player: reverseCarrier,
      confidence: "high",
      action: {
        kind: "carry",
        waypoints: [mesh2, [sideSign * 6, -1], [sideSign * 14, 8]],
      },
    },
    ...lineBlocks(variant),
  ];
  // @B fakes a run / sells the flow — only in variants where @B
  // exists. 5v5 has no @B (roster is {Q,C,X,Y,Z}), so the fake-
  // block was silently dropped at render. The "decoy back" concept
  // doesn't apply when there's no back.
  if (variant !== "flag_5v5") {
    assignments.push(
      { player: "B", confidence: "med", action: { kind: "block" } },
    );
  }
  // Remaining receivers. The strong-side slot blocks for the reverse
  // (since the reverse comes BACK to the strong side); backside
  // receivers hold their alignment to sell the motion direction.
  // Per-variant slot mapping:
  //   - 5v5 {Q,C,X,Y,Z}: @Y is the only non-{jet,reverse} skill
  //     player; @C is eligible. No @S/@H/@B in roster.
  //   - 6v6 {QB,C,B,X,Z,H}: one slot @H; @C eligible.
  //   - 7v7+/tackle: traditional @S + @H slots.
  if (variant === "flag_5v5") {
    assignments.push(
      { player: "Y", confidence: "med", action: { kind: "unspecified" } },
      { player: "C", confidence: "med", action: { kind: "unspecified" } },
    );
  } else if (variant === "flag_6v6") {
    assignments.push(
      { player: "H", confidence: "med", action: { kind: "unspecified" } },
      { player: "C", confidence: "med", action: { kind: "unspecified" } },
    );
  } else {
    const strongSlot = side === "right" ? "S" : "H";
    const backsideSlot = side === "right" ? "H" : "S";
    assignments.push(
      { player: strongSlot, confidence: "med", action: { kind: "unspecified" } },
      { player: backsideSlot, confidence: "med", action: { kind: "unspecified" } },
    );
  }
  return {
    ok: true,
    concept: "Jet Reverse",
    spec: {
      ...baseSpec(variant, `Jet Reverse ${cap(side)}`, "Trips Right", side, assignments),
      ballPath: [
        { from: "QB", to: jetWR, atPoint: mesh1 },
        { from: jetWR, to: reverseCarrier, atPoint: mesh2 },
      ],
    },
    notes:
      `Jet Reverse ${cap(side)}: @${jetWR} comes in PRE-SNAP MOTION across the formation; QB hands to @${jetWR} in stride at the mesh. @${jetWR} carries briefly OPPOSITE the motion direction, then hands BACK to @${reverseCarrier} coming from the other side. @${reverseCarrier} attacks the ${side} perimeter after the defense has flowed against the jet motion. Two exchanges, three ball-handlers. Defense bites hard on the jet motion = the reverse springs.`,
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

  // The "back" / ballcarrier id is variant-dependent. In flag_5v5 there
  // is no @B in the roster {Q, C, X, Y, Z} — the back maps to @Y. In
  // 7v7 + tackle the canonical @B exists.
  const carrierId = variant === "flag_5v5" ? "Y" : "B";

  // Receiver coverage in flag variants. Tackle uses `unspecified` for
  // skill players because they can legally stalk-block; the validator
  // doesn't require routes for tackle. In flag, the offensive-coverage
  // gate REQUIRES a route or motion for every non-QB skill player —
  // `unspecified` ships a play with idle receivers. Replace with a
  // short stalk-hitch (3yd) so the receivers look like stalk-blockers
  // in shape while satisfying the gate.
  const isFlag =
    variant === "flag_4v4" ||
    variant === "flag_5v5" ||
    variant === "flag_6v6" ||
    variant === "flag_7v7" ||
    variant === "touch_7v7";
  // AUDIT FINDING #4 (2026-05-26): Draw is a pass-action concept —
  // the OL sells pass, the receivers must run VERTICAL CLEARS to
  // pull LBs and safeties AWAY from the soft middle the back will
  // hit. Hitches/drags at 3-5yd keep defenders at the LB level,
  // exactly where the back is going. The other run concepts
  // (Sweep / Counter / Power / Dive) are run-action plays where
  // stalk-block-as-Hitch is the correct posture for the perimeter
  // (stalks read as blockers; the play is a run). Draw differs.
  const isPassAction = conceptName === "Draw";
  const stalkAction: AssignmentAction = isPassAction
    ? { kind: "route", family: "Go", depthYds: 18 } // vertical clear for Draw
    : isFlag
      ? { kind: "route", family: "Hitch", depthYds: 3 } // stalk-block posture for run plays
      : { kind: "unspecified" };

  const assignments: PlayerAssignment[] = [
    {
      player: "QB",
      confidence: "high",
      action: { kind: "carry", waypoints: qbWaypoints },
    },
    {
      player: carrierId,
      confidence: "high",
      action: { kind: "carry", runType, waypoints: backWaypoints },
    },
  ];

  // Receivers in run-blocking / stalk-block posture. Per-variant
  // rosters:
  //   5v5  {C, X, Z} besides QB + carrier (Y)
  //   6v6  {C, H, X, Z} besides QB + carrier (B)  — one slot only
  //   7v7+ {X, Z, H, S} besides QB + carrier (B)
  //   tackle adds the OL via lineBlocks below.
  // Prior version omitted the 6v6 branch and fell through to the
  // 7v7+ list — silently dropping the @S stalk in 6v6 (no @S in
  // roster). Audit 2026-05-26.
  const stalkReceivers: string[] =
    variant === "flag_5v5"
      ? ["X", "Z", "C"]
      : variant === "flag_6v6"
        ? ["X", "Z", "H", "C"]
        : ["X", "Z", "H", "S"];
  for (const id of stalkReceivers) {
    if (id === carrierId) continue;
    assignments.push({ player: id, confidence: "med", action: stalkAction });
  }
  assignments.push(...lineBlocks(variant));

  return {
    ok: true,
    concept: conceptName,
    spec: {
      ...baseSpec(variant, `${conceptName} ${cap(side)}`, "Spread Doubles", side, assignments),
      ballPath: [{ from: "QB", to: carrierId, atPoint: mesh }],
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
      // CORRECTED 2026-05-26 (audit finding #1). The canonical Sweep
      // path is LATERAL FIRST — the RB runs parallel to the LOS to
      // clear the edge of the formation, THEN makes ONE decisive cut
      // upfield after pulling blockers or the natural edge seals.
      //
      // The prior path `[mesh, (6,-2), (10,6)]` was a smooth diagonal
      // from mesh to the numbers — the back was climbing while still
      // running laterally, which a coach correctly identified as "the
      // back ends up running up the middle." A real sweep has the back
      // pressing the edge first.
      //
      // Geometry (right-strength, sideSign=1):
      //   mesh   = (1.5, -4)  →  initial alignment behind QB, slight playside
      //   leg 1: (4,   -3)    →  lateral movement, gained 2.5yd lateral and only 1yd shallower (basically parallel to LOS)
      //   leg 2: (7,   -2.5)  →  continued lateral with slight forward (3yd lateral, 0.5yd up) — pressing the edge
      //   leg 3: (8,   5)     →  the cut UPFIELD (1yd lateral, 7.5yd vertical) — the "ONE decisive cut" once the lane opens
      //
      // The visual signature: a J-shape, not a smooth diagonal. Coach
      // recognizes it instantly as a sweep.
      return [
        mesh,
        [sideSign * 4, -3],
        [sideSign * 7, -2.5],
        [sideSign * 8, 5],
      ];
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
    // 6v6 roster {QB, C, B, X, Z, H}: no @Y. Prior comment was
    // wrong — corrected 2026-05-26 audit. Use @H (the single slot)
    // plus @C (eligible underneath) as the shallow-drag layer.
    slotIds = ["H", "C"].filter((id) => id !== carrierId);
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
    assignments.push(routeAt("B", "Flat", 4));
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
  "Slant-Flat":     buildSlantFlat,
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
