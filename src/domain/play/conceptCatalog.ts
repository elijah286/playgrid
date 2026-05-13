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
  complexity: "basic",
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
  complexity: "basic",
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
  complexity: "basic",
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
  complexity: "intermediate",
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
  complexity: "intermediate",
};

const MESH: ConceptEntry = {
  name: "Mesh",
  aliases: ["Mesh Concept"],
  description:
    "Two crossing drags that 'mesh' past each other at differentiated depths — one UNDER (~2 yds) and one OVER (~7-8 yds). The depth differentiation + meaningful absolute depth is what makes them mesh visibly: same depth = collision; close depths = visually-collided in the chat preview; both crammed at the LOS = invisible cross. Cal MUST set depthYds explicitly on each drag (e.g. 2 and 8) so the over-drag passes CLEARLY ABOVE the under-drag with unambiguous visible separation. Natural pick / rub action vs man, finds soft spots in zone.",
  required: [
    // Differentiated slots — non-overlapping depth ranges force the
    // two drags to be at different depths AND at meaningful depth (not
    // crammed at the LOS).
    //
    // Depth history:
    //   [1, 2.5] + [3.5, 5]   — original; mesh too shallow against OL
    //   [2, 3.5] + [4.5, 6]   — bumped 2026-05-02 (image 1 retry); 4yd
    //                            gap rendered visually too close in
    //                            the chat preview's compressed aspect
    //   [2, 3.5] + [6, 9]     — current. ~6yd gap renders as
    //                            unambiguously stacked. Coaches won't
    //                            mistake the cross for a collision.
    { role: "any", family: "Drag", depthRangeYds: { min: 2,   max: 3.5 } }, // under-drag (~2yd)
    { role: "any", family: "Drag", depthRangeYds: { min: 6,   max: 9   } }, // over-drag (~7-8yd)
  ],
  complexity: "basic",
};

// ── Concept additions 2026-05-02 (Phase 7b) ────────────────────────────
// The KB has 20+ concepts; the catalog had 6, leaving 14+ unenforced.
// "Cal described Flood correctly in prose but the spec assigned routes
// randomly — no validator caught it." Each concept added below becomes
// a permanent chat-time gate via assertConcept.

const FLOOD: ConceptEntry = {
  name: "Flood",
  aliases: ["Sail", "Flood Concept", "Sail Concept"],
  description:
    "Three receivers stretching ONE SIDE of the field at THREE depths — Corner deep (12-18 yds), Out at the second level (7-10 yds), Flat low (0-4 yds, typically the RB to the flood side). All on the SAME SIDE so the cornerback (high-low) and the flat defender are both stretched. Forces a single underneath defender to pick one. Beats Cover 3 and most rotated zones. Erhardt-Perkins / pro-style staple.",
  required: [
    // Family + depth slots. The chat-time validator additionally
    // enforces sameSideRequired: all 3 matched players must be on the
    // same side of the formation (all x>0 or all x<0). Without that,
    // Cal could assign Corner to the left side and Flat to the right
    // and the matcher would still pass — which is what surfaced
    // 2026-05-02 ("Flood Left" with routes scattered across the
    // formation).
    //
    // Slot family changed 2026-05-02 (coach feedback): the slot's mid
    // route is an OUT at the second level (7-10 yds), NOT a Curl.
    // Curl/Flat is its own concept (high-low on the flat defender at
    // a TIGHT depth). Flood's mid attacks the seam between the
    // corner's deep drop and the flat defender's underneath
    // responsibility — different defender stress, different concept.
    { role: "any", family: "Corner", depthRangeYds: { min: 12, max: 18 } },
    { role: "any", family: "Out",    depthRangeYds: { min: 8,  max: 12 } },
    { role: "any", family: "Flat",   depthRangeYds: { min: 0,  max: 4  } },
  ],
  sameSideRequired: true,
  complexity: "intermediate",
};

const DRIVE: ConceptEntry = {
  name: "Drive",
  aliases: ["Drive Concept"],
  description:
    "Two crossers attacking the middle at differentiated depths — Drag UNDER (2-4 yds) and Dig OVER (10-14 yds). The under-drag rubs through traffic; the dig settles in the void behind the LBs. Beats man (rub on releases) and zone (dig sits in the hole). Often paired with a backside clear.",
  required: [
    { role: "any", family: "Drag", depthRangeYds: { min: 2,  max: 4  } },
    { role: "any", family: "Dig",  depthRangeYds: { min: 10, max: 14 } },
  ],
  complexity: "intermediate",
};

const LEVELS: ConceptEntry = {
  name: "Levels",
  aliases: ["Levels Concept"],
  description:
    "Two crossing in-breaking routes at TWO LEVELS — low In at 6-8 yds and high Dig at 12-14 yds, both breaking inside on the same side. High-low stretches the underneath LB. LB sinks under the dig = throw the low In; LB drives short = throw the dig. Indianapolis Colts (Manning era) staple.",
  required: [
    { role: "any", family: "In",  depthRangeYds: { min: 6,  max: 8  } },
    { role: "any", family: "Dig", depthRangeYds: { min: 10, max: 14 } },
  ],
  complexity: "intermediate",
};

const Y_CROSS: ConceptEntry = {
  name: "Y-Cross",
  aliases: ["Y Cross", "Y-Cross Concept"],
  description:
    "TE/Y runs a DEEP crosser at 14-16 yds, paired with a deep clear-out (Post or Go) on top and a flat/drag underneath. Triangle stretch — high (clear), medium (deep cross), low (flat) on the same side. QB reads the safety, then the LB. Beats man and zone equally. Air Raid + West Coast staple.",
  required: [
    { role: "any", family: "Dig",  depthRangeYds: { min: 14, max: 16 } }, // the deep cross
    { role: "any", family: "Post", depthRangeYds: { min: 12, max: 18 } }, // the clear (Post or Go acceptable; Post is canonical)
    { role: "any", family: "Flat", depthRangeYds: { min: 0,  max: 4  } },
  ],
  complexity: "advanced",
};

const DAGGER: ConceptEntry = {
  name: "Dagger",
  aliases: ["Dagger Concept"],
  description:
    "Inside receiver runs a Seam (vertical clear, 14+ yds) to clear the deep safety; outside receiver runs a DEEP DIG at 14-16 yds in the void the seam created. Modern NFL shot play — the seam pulls the safety, the dig hits the soft spot behind the LB and in front of the safety's vacated zone. Best vs single-high coverage.",
  required: [
    { role: "any", family: "Seam", depthRangeYds: { min: 14, max: 25 } },
    { role: "any", family: "Dig",  depthRangeYds: { min: 14, max: 16 } },
  ],
  complexity: "advanced",
};

// ── Designed-QB-run / RPO / reverse concepts (2026-05-12 build) ────────
// These are the first catalog entries that lean on the `structural`
// field instead of (or in addition to) the route-based `required`
// pattern. The matcher checks both. Each entry below requires the
// playbook to have the corresponding `advancedCapabilities` enabled
// (designed_qb_run / rpo_read / handoff_chain) — otherwise the
// play-tools resolver rejects the spec before save.

const QB_DRAW: ConceptEntry = {
  name: "QB Draw",
  aliases: ["Quarterback Draw", "QB Lead Draw"],
  description:
    "Designed QB run from shotgun. The OL pass-sets to sell pass; receivers run pass routes (hitches / verts) to widen and pull the defense; the QB hesitates as if reading, then runs straight through the soft middle. Best against rush-heavy fronts on obvious passing downs — coverage drops, the box is light, the QB takes the easy yards.",
  // No route requirements — the play is defined by the QB's run, not
  // by any particular route shape. The supporting routes vary by
  // formation and personnel.
  required: [],
  complexity: "basic",
  structural: {
    requiresCarry: {
      player: "qb",
      runTypes: ["draw", "qb_keep"],
    },
  },
};

const BUBBLE_RPO: ConceptEntry = {
  name: "Bubble RPO",
  aliases: ["Bubble Screen RPO", "RPO Bubble", "Inside Zone Bubble"],
  description:
    "Run-pass option built on Inside Zone with a bubble screen tag. The OL run-blocks; the back takes the Inside Zone path; a slot receiver releases on a bubble (lateral release, settling 0–2 yds behind the LOS); the QB reads the conflict defender (typically the playside OLB / overhang). If the conflict defender comes down to fill the run, the QB pulls and throws the bubble — the slot has the perimeter outflanked. If the defender stays out to play the bubble, the QB gives and the back hits a 5-on-5 box. Modern HS / college / NFL staple.",
  // The Bubble route is part of the structure — list it as a required
  // slot so the matcher catches "this called itself a Bubble RPO but
  // nobody runs a Bubble."
  required: [
    { role: "slot", family: "Bubble", depthRangeYds: { min: -2, max: 2 } },
  ],
  complexity: "advanced",
  structural: {
    requiresRpoRead: true,
    requiresCarry: {
      player: "back",
      runTypes: ["inside_zone"],
    },
  },
};

const JET_REVERSE: ConceptEntry = {
  name: "Jet Reverse",
  aliases: ["Reverse", "Reverse Jet", "End-Around Reverse"],
  description:
    "Multi-handoff misdirection. QB takes the snap and hands to the back (or jet-motion receiver) running toward one side; the back/jet then hands the ball back to the weak-side receiver coming around from the opposite direction. Two exchanges, three ball-handlers. The whole defense flows to the initial fake; the reverse runner attacks the vacated weak side. Best when the defense is over-pursuing the run game and your perimeter blockers (slot, weak-side WR) can seal the cornerback.",
  required: [],
  complexity: "intermediate",
  structural: {
    requiresBallPathSteps: 2,
  },
};

// ── Plain run concepts (2026-05-13) ─────────────────────────────────────
// Single-handoff run plays. Catalog absence was forcing Cal to
// hand-author waypoints + diaper-pattern the play geometry — exactly
// what Rule 8 (constructive composition) is supposed to make impossible
// for catalog concepts. Each entry is gated on the `handoff_chain`
// capability via the ballPath structural requirement; the back's
// `runType` further filters which concept matches what the spec
// actually shows.

const SWEEP: ConceptEntry = {
  name: "Sweep",
  aliases: ["Outside Sweep", "Toss Sweep", "Stretch"],
  description:
    "Wide perimeter run. QB hands to the back, who attacks the edge with the OL pulling or reaching playside. The back's footwork is patient-then-fast: read the kick-out block, then turn vertical when the corner is sealed. Best vs over-aligned interior fronts where the perimeter is light.",
  required: [],
  complexity: "basic",
  structural: {
    requiresCarry: { player: "back", runTypes: ["sweep", "outside_zone"] },
    requiresBallPathSteps: 1,
  },
};

const DIVE: ConceptEntry = {
  name: "Dive",
  aliases: ["Inside Dive", "Iso", "Lead Dive"],
  description:
    "North-south interior run. QB hands to the back attacking the A/B gap downhill — first available crease wins. OL inside-zone-blocks (or pin-and-pull for a power flavor). Stays on schedule, eats clock, and softens up a stout interior for the play-action that follows.",
  required: [],
  complexity: "basic",
  structural: {
    requiresCarry: { player: "back", runTypes: ["inside_zone", "trap", "power"] },
    requiresBallPathSteps: 1,
  },
};

const COUNTER: ConceptEntry = {
  name: "Counter",
  aliases: ["Counter Trey", "Counter GT", "Counter OF"],
  description:
    "Misdirection run. The back jab-steps strong-side to hold the LBs, then takes the handoff going BACK weak-side behind pulling blockers (typically the backside guard + tackle). The 'counter' is the defense's pursuit moving the wrong way. Best vs defenses that flow hard to initial back action.",
  required: [],
  complexity: "intermediate",
  structural: {
    requiresCarry: { player: "back", runTypes: ["counter"] },
    requiresBallPathSteps: 1,
  },
};

const DRAW: ConceptEntry = {
  name: "Draw",
  aliases: ["RB Draw", "Lead Draw"],
  description:
    "Late-developing interior run that sells pass first. The OL pass-sets to draw the rush upfield; receivers run hitches / verts to widen the coverage; QB drops back, then hands LATE to the back hitting the soft middle vacated by the rush. Best on obvious passing downs against rush-heavy fronts.",
  required: [],
  complexity: "intermediate",
  structural: {
    requiresCarry: { player: "back", runTypes: ["draw"] },
    requiresBallPathSteps: 1,
  },
};

// ── Trick play: Flea Flicker (2026-05-13) ───────────────────────────────
// The play that surfaced this whole build. Distinct from Jet Reverse
// because the ball RETURNS to the original handler (the QB) and the
// play-defining moment is the DEEP PASS off the run fake — not the
// final ball-carrier's run. The matcher checks (a) 2-step ballPath
// returning to origin AND (b) at least one deep route present.
const FLEA_FLICKER: ConceptEntry = {
  name: "Flea Flicker",
  aliases: ["Flicker", "Halfback Flicker", "WR Flicker"],
  description:
    "Trick play that sells run, then attacks deep. QB hands to a back / WR going forward to the LOS; that player runs hard as if rushing, then PITCHES the ball BACK to the QB still behind the LOS. The defense has already triggered on the run fake; deep receivers clear out and find the void behind the now-collapsing safeties. Two backwards passes / handoffs, one deep throw. Best after the run game has been established — the defense has to believe the fake.",
  required: [],
  complexity: "advanced",
  structural: {
    requiresBallPathSteps: 2,
    requiresBallPathReturnsToOrigin: true,
  },
};

export const CONCEPT_CATALOG: ConceptEntry[] = [
  CURL_FLAT,
  SMASH,
  STICK,
  SNAG,
  FOUR_VERTS,
  MESH,
  FLOOD,
  DRIVE,
  LEVELS,
  Y_CROSS,
  DAGGER,
  // Run / RPO / reverse concepts (designed-QB-run, RPO, multi-handoff
  // capability-gated). Appearance order chosen so detectConcept tries
  // the existing pass concepts first.
  QB_DRAW,
  BUBBLE_RPO,
  JET_REVERSE,
  // Plain run concepts + trick play (2026-05-13). All gated on
  // handoff_chain via their `requiresBallPathSteps` structural
  // requirement; the run concepts further restrict on the back's
  // runType so a "Sweep" with `runType: counter` won't match.
  SWEEP,
  DIVE,
  COUNTER,
  DRAW,
  FLEA_FLICKER,
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
