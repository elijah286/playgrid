import type { Point2, RouteNode, RouteSegment, SegmentShape, StrokePattern, Route, RouteStyle } from "./types";
import { uid } from "./factory";

/**
 * Canonical route catalog — SINGLE SOURCE OF TRUTH for every named route's
 * geometry, break shape, break direction, and prose definition.
 *
 * The KB seed (supabase/migrations/0144_seed_routes_global.sql, patched by
 * 0184_seed_routes_canonical.sql) intentionally mirrors the `description`
 * field below so Coach Cal's words and the rendered diagram stay consistent.
 *
 * Coordinate system for `points` (offsets from player start):
 *   x: fraction of FIELD WIDTH (per variant). xSign flips at runtime so
 *      "inside"/"outside" tracks the receiver's actual side of the formation.
 *      In TEMPLATE coords: positive x = OUTSIDE (toward sideline);
 *                          negative x = INSIDE (toward middle / where QB is).
 *   y: fraction of FIELD LENGTH (the 25-yard chat / editor window).
 *      0.04 ≈ 1 yd; 0.12 ≈ 3 yds; 0.20 ≈ 5 yds; 0.40 ≈ 10 yds.
 *
 * Segment shapes (per route's `shapes[i]`, segment from points[i] → points[i+1]):
 *   "straight" — sharp corner where two straight segments meet (slants, outs,
 *                ins, posts, digs — anything with a hard 90°/45° break).
 *   "curve"    — Bezier-curve segment, used for routes that round (curl
 *                back to QB, hitch settle, comeback, wheel turnup, fade arc).
 *
 * Angle convention (matches agent prompt + KB): break angles are measured
 * FROM HORIZONTAL (the LOS / sideline-to-sideline axis) unless explicitly
 * stated otherwise. So a "25° slant" runs mostly across with a shallow
 * upfield component.
 *
 * Direction convention: route NAMES imply direction relative to the QB.
 * "Curl", "Hitch", "Sit", "Hook", "In", "Dig", "Slant", "Drag", "Snag",
 * "Whip" all imply the receiver finishes TOWARD THE QB — settle/break
 * point's template-x must be ≤ 0 (inside, toward middle).
 * "Out", "Quick Out", "Corner", "Fade", "Wheel", "Flat", "Arrow",
 * "Comeback", "Bubble" all imply TOWARD THE SIDELINE — final-x must be ≥ 0.
 * "Go", "Seam", "Stop & Go" are vertical — final |x| ≤ 0.10.
 * The assertBreakDirInvariants() function below enforces these at module
 * load — any new template that violates the convention crashes the build,
 * so the bug class "curl drawn going outward" cannot ship.
 *
 * Adding/changing a template? Update three things in lockstep:
 *   1. The template here (geometry + shapes + breakStyle + breakDir + description).
 *   2. The KB entry in 0144_seed_routes_global.sql (so fresh DBs match).
 *   3. A new migration that UPDATEs the live DB row (so existing DBs match).
 */

export type BreakStyle =
  | "none"          // no break — straight line (Go, Seam, Drag, Flat)
  | "sharp"         // single sharp corner (Slant, Out, In, Post, Corner, Dig, Quick Out)
  | "rounded"       // round/curving turn (Curl, Comeback, Hitch, Wheel turnup, Fade)
  | "multi";        // double moves (Out & Up, Stop & Go, Whip)

/**
 * Direction the route's break/finish goes RELATIVE TO THE QB.
 *
 * Enforced at module load by assertBreakDirInvariants(). The check rules:
 *   "toward_qb"       → final point's template-x ≤ 0   (inside / toward middle)
 *   "toward_sideline" → final point's template-x ≥ 0   (outside)
 *   "vertical"        → final point's |template-x| ≤ 0.10 (essentially up the field)
 *   "varies"          → no constraint (used only for routes whose name doesn't
 *                       imply a direction, which is none of our current set)
 *
 * If the invariant fails, the module throws on import. This keeps the
 * "curl that breaks toward the sideline" bug from ever shipping again.
 */
export type BreakDirection =
  | "toward_qb"        // settles inside / faces QB (Curl, Hitch, Sit, In, Dig, Slant, Drag, Snag, Skinny Post, Post, Whip, Z-In)
  | "toward_sideline"  // breaks outside (Out, Quick Out, Corner, Fade, Wheel, Flat, Arrow, Comeback, Bubble, Z-Out, Out & Up)
  | "vertical"         // through the middle / no lateral commitment (Go, Seam, Stop & Go)
  | "varies";          // reserved for future double-moves whose direction is config-dependent

/**
 * Hard constraints for a route family. Used by the diagram-level validator
 * (validateRouteAssignments) to reject impossible combinations BEFORE they
 * persist — e.g. a "12-yard slant" (slants top out around 7 yds) or a
 * "slant outside" (slants always finish toward the QB).
 *
 * Authored in YARDS measured from the player's start, since coaches and the
 * LLM both reason about routes in yards, not normalized field fractions.
 * fieldLengthYds is 25 across every variant (see sportProfileForVariant), so
 * yards convert cleanly with `template_y_norm * 25`.
 */
export type RouteConstraints = {
  /** Inclusive yard range for the route's deepest waypoint, measured from
   *  the player's start. A 12-yard slant violates `slant`'s [3, 7] range. */
  depthRangeYds: { min: number; max: number };
  /** Required final-waypoint side relative to the player's start.
   *  Mirrors `breakDir` semantically but is what the validator checks
   *  against the assignment's geometry. */
  side: BreakDirection;
};

export type RouteTemplate = {
  /** Display name. Lookup is case-insensitive. */
  name: string;
  /** Alternate names that should resolve to this template (case-insensitive). */
  aliases?: string[];
  /** When true, x-offsets follow: positive x = toward outside, negative x = toward inside.
   *  The xSign is determined by the player's field position. */
  directional?: boolean;
  /** Relative offsets from the player position (field coords, y-up). */
  points: Point2[];
  /** Per-segment shape overrides. Length should be points.length - 1.
   *  Defaults to all-"straight" if omitted. ALWAYS set this explicitly for
   *  any route with a curved segment. */
  shapes?: SegmentShape[];
  /** Coarse semantic label for the route's break shape. */
  breakStyle: BreakStyle;
  /** Direction of the break/finish relative to the QB. Enforced at module
   *  load by assertBreakDirInvariants() — required so the route's NAME
   *  (which implies direction) matches its GEOMETRY (which the renderer
   *  draws). Mismatches throw on import. */
  breakDir: BreakDirection;
  /** Hard constraints checked at diagram-validation time. See RouteConstraints. */
  constraints: RouteConstraints;
  /** Canonical written definition. MUST mirror the KB entry (subtopic
   *  matches `kbSubtopic`). Format: "STEM (if any) → BREAK shape/angle/
   *  direction → CATCH depth. When-to-use. Route tree # if applicable." */
  description: string;
  /** rag_documents subtopic for this route (e.g. "route_slant"). */
  kbSubtopic: string;
};

/* ------------------------------------------------------------------ */
/*  Standard route templates (offsets relative to player position)     */
/* ------------------------------------------------------------------ */

export const ROUTE_TEMPLATES: RouteTemplate[] = [
  {
    name: "Go",
    aliases: ["Fly", "Streak", "Vertical", "9"],
    directional: true,
    points: [
      { x: 0, y: 0 },
      { x: 0, y: 0.55 },
    ],
    shapes: ["straight"],
    breakStyle: "none",
    breakDir: "vertical",
    constraints: { depthRangeYds: { min: 10, max: 25 }, side: "vertical" },
    kbSubtopic: "route_go",
    description:
      "Straight vertical sprint downfield (route tree #9). No break — full-speed release, accelerate upfield, ball thrown over the top. Stretches the defense vertically. Best vs single-high coverage with no deep help.",
  },
  {
    name: "Slant",
    directional: true,
    // 3-yd vertical stem then a 25°-above-horizontal cut across the middle.
    // Mostly lateral with a shallow upfield component. Sharp plant + cut.
    // flag_7v7 (30yd width, 25yd length): stem (0,3) → break (-6, 5.8) yds.
    // x: -6/30 = -0.20, y: 5.8/25 = 0.232.
    points: [
      { x: 0, y: 0 },
      { x: 0, y: 0.12 },
      { x: -0.20, y: 0.232 },
    ],
    shapes: ["straight", "straight"],
    breakStyle: "sharp",
    breakDir: "toward_qb",
    constraints: { depthRangeYds: { min: 3, max: 7 }, side: "toward_qb" },
    kbSubtopic: "route_slant",
    description:
      "3-yard vertical stem then a SHARP 25°-above-horizontal cut across the middle (angle measured from horizontal — mostly lateral with a shallow upfield lean, NOT a steep vertical-leaning break). Catches at 5-6 yds depth, having gained 5-7 yds laterally (route tree #2). Beats press man (inside leverage fast) and Cover 2 (slant fits between underneath defenders).",
  },
  {
    name: "Out",
    aliases: ["Square-Out"],
    directional: true,
    points: [
      { x: 0, y: 0 },
      { x: 0, y: 0.40 },
      { x: 0.20, y: 0.40 },
    ],
    shapes: ["straight", "straight"],
    breakStyle: "sharp",
    breakDir: "toward_sideline",
    constraints: { depthRangeYds: { min: 8, max: 12 }, side: "toward_sideline" },
    kbSubtopic: "route_out",
    description:
      "Vertical 10 yards then a SHARP 90° break toward the sideline (route tree #3). Stops the clock — common late-game call. Vulnerable to a jumping cornerback if undisguised.",
  },
  {
    name: "In",
    directional: true,
    // negative x = toward inside (middle)
    points: [
      { x: 0, y: 0 },
      { x: 0, y: 0.32 },
      { x: -0.24, y: 0.32 },
    ],
    shapes: ["straight", "straight"],
    breakStyle: "sharp",
    breakDir: "toward_qb",
    constraints: { depthRangeYds: { min: 6, max: 10 }, side: "toward_qb" },
    kbSubtopic: "route_in",
    description:
      "Vertical 8 yards then a SHARP 90° break to the inside (toward the QB / middle of the field). Shallower than a Dig — sits in front of the LBs / under the safeties. Common quick-game intermediate vs zone.",
  },
  {
    name: "Post",
    directional: true,
    // Stem 11 yds, sharp 45° break inside toward goalpost, finishing deep.
    points: [
      { x: 0, y: 0 },
      { x: 0, y: 0.44 },
      { x: -0.18, y: 0.62 },
    ],
    shapes: ["straight", "straight"],
    breakStyle: "sharp",
    breakDir: "toward_qb",
    constraints: { depthRangeYds: { min: 10, max: 18 }, side: "toward_qb" },
    kbSubtopic: "route_post",
    description:
      "Vertical 11-12 yards then a SHARP 45°-above-horizontal break inside toward the goalpost / middle of the field (route tree #8). Beats single-high (Cover 1, Cover 3) when the safety bites, and beats Cover 2 between the safeties. Pair with a deep crosser to clear the safety.",
  },
  {
    name: "Corner",
    aliases: ["Flag"],
    directional: true,
    points: [
      { x: 0, y: 0 },
      { x: 0, y: 0.44 },
      { x: 0.18, y: 0.62 },
    ],
    shapes: ["straight", "straight"],
    breakStyle: "sharp",
    breakDir: "toward_sideline",
    constraints: { depthRangeYds: { min: 10, max: 18 }, side: "toward_sideline" },
    kbSubtopic: "route_corner",
    description:
      "Vertical 11-12 yards then a SHARP 45°-above-horizontal break outside toward the back pylon (route tree #7). Beats Cover 2 (corner sits flat) and Cover 4 (corner stays inside on outside #1). Often the high in a smash concept.",
  },
  {
    name: "Curl",
    aliases: ["Hook"],
    directional: true,
    // Stem 11 yds, ROUNDED ~180° turn back toward QB, settle ~9 yds depth
    // with a SLIGHT INSIDE LEAN (toward the middle, where the QB is).
    // breakDir invariant: settle's template-x must be ≤ 0.
    points: [
      { x: 0, y: 0 },
      { x: 0, y: 0.44 },
      { x: -0.04, y: 0.36 },
    ],
    shapes: ["straight", "curve"],
    breakStyle: "rounded",
    breakDir: "toward_qb",
    constraints: { depthRangeYds: { min: 8, max: 13 }, side: "toward_qb" },
    kbSubtopic: "route_curl",
    description:
      "Vertical 10-12 yards then a ROUNDED ~180° turn back toward the QB, settling in a soft spot in the zone at ~9 yds depth (route tree #6). The break is a smooth turn-back, NOT a sharp corner — receiver decelerates, faces the QB, and finishes with a slight inside lean toward the middle. Reliable vs zone — find the window between defenders.",
  },
  {
    name: "Comeback",
    directional: true,
    // Stem 13 yds, rounded break back toward sideline, finish ~10 yds.
    // "Comeback" = comes back down in DEPTH while breaking toward sideline —
    // it's a SIDELINE route despite the name.
    points: [
      { x: 0, y: 0 },
      { x: 0, y: 0.52 },
      { x: 0.10, y: 0.40 },
    ],
    shapes: ["straight", "curve"],
    breakStyle: "rounded",
    breakDir: "toward_sideline",
    constraints: { depthRangeYds: { min: 9, max: 14 }, side: "toward_sideline" },
    kbSubtopic: "route_comeback",
    description:
      "Vertical 12-13 yards then a ROUNDED break back at ~45° toward the sideline, settling at ~10 yds depth (route tree #5). 'Comeback' refers to coming back DOWN in depth, not toward the QB — it's a sideline route. Stops the clock. Defender must drive forward — comeback wins on the cushion.",
  },
  {
    name: "Flat",
    directional: true,
    // positive x = outside flat
    points: [
      { x: 0, y: 0 },
      { x: 0.22, y: 0.08 },
    ],
    shapes: ["straight"],
    breakStyle: "none",
    breakDir: "toward_sideline",
    constraints: { depthRangeYds: { min: 0, max: 4 }, side: "toward_sideline" },
    kbSubtopic: "route_flat",
    description:
      "Receiver releases directly to the sideline at 0-3 yards depth. Common RB or slot route paired with a curl/corner over the top to high-low the flat defender.",
  },
  {
    name: "Wheel",
    directional: true,
    // Flat release outside, ROUNDED turnup along the sideline.
    points: [
      { x: 0, y: 0 },
      { x: 0.12, y: 0.04 },
      { x: 0.18, y: 0.16 },
      { x: 0.18, y: 0.48 },
    ],
    shapes: ["straight", "curve", "straight"],
    breakStyle: "rounded",
    breakDir: "toward_sideline",
    constraints: { depthRangeYds: { min: 10, max: 22 }, side: "toward_sideline" },
    kbSubtopic: "route_wheel",
    description:
      "RB or slot releases flat to the sideline (~3 yds depth, ~6 yds out), then ROUNDS UP and runs vertical along the sideline (the rounded turnup is the wheel). Beats LBs in man coverage who can't run with a back. Common pair with a deep crosser to clear the safety.",
  },
  {
    name: "Out & Up",
    aliases: ["Out and Up"],
    directional: true,
    points: [
      { x: 0, y: 0 },
      { x: 0, y: 0.20 },
      { x: 0.18, y: 0.20 },
      { x: 0.18, y: 0.52 },
    ],
    shapes: ["straight", "straight", "straight"],
    breakStyle: "multi",
    breakDir: "toward_sideline",
    constraints: { depthRangeYds: { min: 10, max: 22 }, side: "toward_sideline" },
    kbSubtopic: "route_out_and_up",
    description:
      "Sell the quick out at 5 yds, then SHARPLY break vertical up the sideline. Beats corners who jump outs. Effective on the boundary.",
  },
  {
    name: "Arrow",
    directional: true,
    // Slight depth (~3 yds) toward outside flat.
    points: [
      { x: 0, y: 0 },
      { x: 0.16, y: 0.12 },
    ],
    shapes: ["straight"],
    breakStyle: "none",
    breakDir: "toward_sideline",
    constraints: { depthRangeYds: { min: 1, max: 5 }, side: "toward_sideline" },
    kbSubtopic: "route_arrow",
    description:
      "RB or slot releases at a slight angle to the flat, gaining a bit of depth (~3 yds). Outlet for the QB and high-low partner with a sit/curl over the top.",
  },
  {
    name: "Sit",
    aliases: ["Stick"],
    directional: true,
    // Run to ~5-6 yds and settle facing QB. The sit is a small ROUNDED
    // turn-back, not a sharp corner. No lateral movement (settle in place).
    points: [
      { x: 0, y: 0 },
      { x: 0, y: 0.22 },
      { x: 0, y: 0.18 },
    ],
    shapes: ["straight", "curve"],
    breakStyle: "rounded",
    breakDir: "toward_qb",
    constraints: { depthRangeYds: { min: 3, max: 7 }, side: "toward_qb" },
    kbSubtopic: "route_stick",
    description:
      "Vertical stem to 5-6 yards, then a small ROUNDED settle facing the QB (the receiver stops and turns back). Foundation of the stick concept (with a flat underneath and a clear over the top). Quick-game staple, 3rd-and-medium reliable.",
  },
  {
    name: "Hitch",
    directional: true,
    // 5-yd stem then ROUNDED settle back toward QB at ~4 yds, with a
    // slight INSIDE LEAN (toward the middle, where the QB is).
    points: [
      { x: 0, y: 0 },
      { x: 0, y: 0.20 },
      { x: -0.02, y: 0.16 },
    ],
    shapes: ["straight", "curve"],
    breakStyle: "rounded",
    breakDir: "toward_qb",
    constraints: { depthRangeYds: { min: 3, max: 6 }, side: "toward_qb" },
    kbSubtopic: "route_hitch",
    description:
      "5-yard vertical release then a ROUNDED quick turn back toward the QB, settling at 4-5 yds with a slight inside lean (route tree #1). The turn-back is a smooth settle, not a sharp corner. Beats off-coverage instantly. Quick-game staple.",
  },
  {
    name: "Quick Out",
    aliases: ["Speed Out"],
    directional: true,
    points: [
      { x: 0, y: 0 },
      { x: 0, y: 0.20 },
      { x: 0.20, y: 0.20 },
    ],
    shapes: ["straight", "straight"],
    breakStyle: "sharp",
    breakDir: "toward_sideline",
    constraints: { depthRangeYds: { min: 4, max: 7 }, side: "toward_sideline" },
    kbSubtopic: "route_quick_out",
    description:
      "5-yard out — vertical then SHARP 90° break to the sideline at full speed (no break-down). Catches at 4-5 yds. Beats off-man, stops the clock, gets the ball out fast vs pressure.",
  },
  {
    name: "Drag",
    aliases: ["Shallow", "Shallow Cross"],
    directional: true,
    // Canonical drag shape: brief inside release stem (~1 yd vertical),
    // then a SMOOTH CURVED cross all the way across the formation,
    // ending past the opposite slot/tackle. The cross is rendered as a
    // gentle Bezier arc (NOT a sharp break and NOT a single rigid
    // diagonal) — receiver bends naturally as he releases inside and
    // gains a small amount of depth across.
    // Lateral 0.40 of field width → ~21 yds in tackle_11 (slot to
    // opposite slot), ~12 yds in 7v7, ~10 yds in 5v5 — all of which
    // actually cross the formation. The cross segment angle is ~5° from
    // horizontal: the receiver gains only 1-2 yds of additional depth
    // across ~20 yds of lateral travel. This matches the smooth-arc
    // look coaches recognize from playbook art (Throw Deep, Hudl).
    points: [
      { x: 0, y: 0 },
      { x: -0.03, y: 0.04 },
      { x: -0.40, y: 0.12 },
    ],
    shapes: ["straight", "curve"],
    // breakStyle: "none" — semantically the drag has no hard break;
    // it's a continuous shallow cross. The "curve" segment shape above
    // controls VISUAL rendering (Bezier arc, not a rigid line); the
    // breakStyle is the semantic label that describes the route's
    // structure to coaches.
    breakStyle: "none",
    breakDir: "toward_qb",
    constraints: { depthRangeYds: { min: 1, max: 4 }, side: "toward_qb" },
    kbSubtopic: "route_drag",
    description:
      "Shallow crossing route — receiver takes a 1-yard inside release then crosses the ENTIRE formation on a SMOOTH ARC at 2-3 yds depth, ending past the opposite slot/tackle. The cross itself is at a very shallow angle (~5° from horizontal) — the receiver gains only minimal depth as he travels laterally; he is NOT climbing diagonally and the path is NOT a rigid straight line. Foundation of mesh, drive, and shallow-cross concepts. Beats man coverage — the defender has to fight through traffic that the offense's other routes generate underneath.",
  },
  {
    name: "Seam",
    directional: true,
    // Slight inside release then sustained vertical.
    points: [
      { x: 0, y: 0 },
      { x: -0.04, y: 0.06 },
      { x: -0.04, y: 0.55 },
    ],
    shapes: ["straight", "straight"],
    breakStyle: "none",
    breakDir: "vertical",
    constraints: { depthRangeYds: { min: 10, max: 25 }, side: "vertical" },
    kbSubtopic: "route_seam",
    description:
      "Vertical sprint from a slot or TE alignment, splitting the deep safeties. No hard break — slight inside release, then sustained vertical. Beats Cover 2 (gap between safeties) and Cover 4 (vertical the safety can't carry). Foundation route in 4 verts.",
  },
  {
    name: "Fade",
    directional: true,
    // Vertical with a ROUNDED outside arc.
    points: [
      { x: 0, y: 0 },
      { x: 0.06, y: 0.22 },
      { x: 0.14, y: 0.52 },
    ],
    shapes: ["curve", "curve"],
    breakStyle: "rounded",
    breakDir: "toward_sideline",
    constraints: { depthRangeYds: { min: 10, max: 22 }, side: "toward_sideline" },
    kbSubtopic: "route_fade",
    description:
      "Vertical release with a ROUNDED outside arc toward the sideline (no hard break). Ball thrown back-shoulder or up-and-away. Red-zone staple — defender can't recover when the throw is placed up-and-away. Usually a tall WR vs a short DB.",
  },
  {
    name: "Bubble",
    aliases: ["Bubble Screen"],
    directional: true,
    // Banana arc behind the LOS toward the sideline.
    points: [
      { x: 0, y: 0 },
      { x: 0.04, y: -0.04 },
      { x: 0.16, y: -0.02 },
    ],
    shapes: ["curve", "curve"],
    breakStyle: "rounded",
    breakDir: "toward_sideline",
    constraints: { depthRangeYds: { min: -3, max: 1 }, side: "toward_sideline" },
    kbSubtopic: "route_bubble_screen",
    description:
      "Receiver releases backward and outside in a ROUNDED banana arc, catching a quick lateral pass behind the LOS. Other receivers block downfield. Common RPO tag.",
  },
  {
    name: "Spot",
    aliases: ["Snag"],
    directional: true,
    // Inside release to a soft spot, deliberate sit.
    points: [
      { x: 0, y: 0 },
      { x: -0.10, y: 0.22 },
    ],
    shapes: ["straight"],
    breakStyle: "none",
    breakDir: "toward_qb",
    constraints: { depthRangeYds: { min: 3, max: 7 }, side: "toward_qb" },
    kbSubtopic: "route_snag",
    description:
      "Receiver releases inside on a slight angle, settling 5-6 yards downfield in a soft spot. More deliberate than a hitch. Often the inside route in a snag concept (with corner over and flat under).",
  },
  {
    name: "Skinny Post",
    aliases: ["Glance"],
    directional: true,
    // Like Post but breaks at a much shallower inside angle (~70° above horiz).
    points: [
      { x: 0, y: 0 },
      { x: 0, y: 0.40 },
      { x: -0.07, y: 0.60 },
    ],
    shapes: ["straight", "straight"],
    breakStyle: "sharp",
    breakDir: "toward_qb",
    constraints: { depthRangeYds: { min: 10, max: 18 }, side: "toward_qb" },
    kbSubtopic: "route_skinny_post",
    description:
      "Vertical 10 yards then a SHALLOW inside break (~70° above horizontal — much closer to vertical than a true 45° post). Beats Cover 3 between the corner and the deep middle safety. Common as the pass option in inside-zone RPOs.",
  },
  {
    name: "Whip",
    aliases: ["Whip-In"],
    directional: true,
    // Sell out for 3 yds, snap back inside on slant angle. Final dir: inside.
    points: [
      { x: 0, y: 0 },
      { x: 0.10, y: 0.12 },
      { x: -0.16, y: 0.20 },
    ],
    shapes: ["straight", "straight"],
    breakStyle: "multi",
    breakDir: "toward_qb",
    constraints: { depthRangeYds: { min: 4, max: 8 }, side: "toward_qb" },
    kbSubtopic: "route_whip",
    description:
      "Receiver fakes outward (like a quick out) for 3-5 yards, then SHARPLY whips back inside on a slant angle. Misdirection — beats man when defender bites on the out fake. The 'whip' refers to the inside snap-back, finishing toward the QB.",
  },
  {
    name: "Z-Out",
    directional: true,
    // Deeper out break (~7 yds), typically Z (flanker).
    points: [
      { x: 0, y: 0 },
      { x: 0, y: 0.28 },
      { x: 0.22, y: 0.28 },
    ],
    shapes: ["straight", "straight"],
    breakStyle: "sharp",
    breakDir: "toward_sideline",
    constraints: { depthRangeYds: { min: 5, max: 9 }, side: "toward_sideline" },
    kbSubtopic: "route_out",
    description:
      "Deeper variant of the Out — vertical 7 yds then a SHARP 90° break to the sideline. Typically run by the Z (flanker) when a regular Out's depth is wrong for the timing. Same family as Out (route tree #3); see Route: Out for details.",
  },
  {
    name: "Z-In",
    directional: true,
    // Deeper in break (~7 yds), typically Z (flanker).
    points: [
      { x: 0, y: 0 },
      { x: 0, y: 0.28 },
      { x: -0.28, y: 0.28 },
    ],
    shapes: ["straight", "straight"],
    breakStyle: "sharp",
    breakDir: "toward_qb",
    constraints: { depthRangeYds: { min: 5, max: 9 }, side: "toward_qb" },
    kbSubtopic: "route_in",
    description:
      "Deeper variant of the In — vertical 7 yds then a SHARP 90° break to the inside (toward the QB / middle). Typically run by the Z (flanker) when a regular In's depth is wrong for the timing. Same family as In; see Route: In for details.",
  },
  {
    name: "Stop & Go",
    aliases: ["Sluggo", "Hitch and Go"],
    directional: true,
    // Stem 5, fake stop (small back-step / settle), then release deep vertical.
    points: [
      { x: 0, y: 0 },
      { x: 0, y: 0.20 },
      { x: 0.04, y: 0.16 },
      { x: 0, y: 0.55 },
    ],
    shapes: ["straight", "curve", "straight"],
    breakStyle: "multi",
    breakDir: "vertical",
    constraints: { depthRangeYds: { min: 12, max: 25 }, side: "vertical" },
    kbSubtopic: "route_hitch_and_go",
    description:
      "Stem 5 yds, fake the hitch (small ROUNDED settle), then release vertical at full speed. Beats off-coverage corners who break aggressively on the hitch. Same family as sluggo (slant-and-go).",
  },
  {
    name: "Dig",
    aliases: ["Square-In"],
    directional: true,
    // Deep in-breaker (~13 yds), sharp 90° inside toward the middle.
    points: [
      { x: 0, y: 0 },
      { x: 0, y: 0.52 },
      { x: -0.30, y: 0.52 },
    ],
    shapes: ["straight", "straight"],
    breakStyle: "sharp",
    breakDir: "toward_qb",
    constraints: { depthRangeYds: { min: 10, max: 16 }, side: "toward_qb" },
    kbSubtopic: "route_dig",
    description:
      "Vertical 12-15 yards then a SHARP 90° break to the inside (toward the QB / middle), finishing across the middle (route tree #4). Beats man and zone — sits in the window between LB depth and safety depth. Foundation of dig-post and levels concepts.",
  },
];

/* ------------------------------------------------------------------ */
/*  Direction invariant — runs at module load                          */
/* ------------------------------------------------------------------ */

/**
 * Verifies every template's geometry matches its declared `breakDir`.
 *
 * Why: route NAMES imply direction (Curl = toward QB, Out = toward sideline)
 * and coaches expect the diagram to match. A previous bug had the curl
 * settle 1.2 yds OUTSIDE — visually wrong, though the prose said "toward
 * QB". This invariant catches that class of mistake at module load so the
 * bug can never ship.
 *
 * Rules (applied to the FINAL waypoint in template coords):
 *   toward_qb       → x ≤ 0          (inside, since template +x = outside)
 *   toward_sideline → x ≥ 0          (outside)
 *   vertical        → |x| ≤ 0.10     (essentially up the field, no commit)
 *   varies          → no constraint
 */
function assertBreakDirInvariants(): void {
  const VERTICAL_TOLERANCE = 0.10;
  for (const t of ROUTE_TEMPLATES) {
    const last = t.points[t.points.length - 1];
    if (!last) {
      throw new Error(`Route template "${t.name}" has no points.`);
    }
    const fx = last.x;
    switch (t.breakDir) {
      case "toward_qb":
        if (fx > 0) {
          throw new Error(
            `Route template "${t.name}" declared breakDir="toward_qb" but its final point has x=${fx} (positive = OUTSIDE). ` +
            `Toward-QB routes must finish with x ≤ 0 (inside, toward the middle where the QB is). Fix the template's last point or change breakDir.`,
          );
        }
        break;
      case "toward_sideline":
        if (fx < 0) {
          throw new Error(
            `Route template "${t.name}" declared breakDir="toward_sideline" but its final point has x=${fx} (negative = INSIDE). ` +
            `Sideline routes must finish with x ≥ 0 (outside). Fix the template's last point or change breakDir.`,
          );
        }
        break;
      case "vertical":
        if (Math.abs(fx) > VERTICAL_TOLERANCE) {
          throw new Error(
            `Route template "${t.name}" declared breakDir="vertical" but its final point has |x|=${Math.abs(fx)} (> ${VERTICAL_TOLERANCE}). ` +
            `Vertical routes must finish near the same x as the start. Fix the template or use "toward_qb"/"toward_sideline".`,
          );
        }
        break;
      case "varies":
        // No constraint.
        break;
    }
  }
}

// Run immediately so a bad template crashes at import time, not at runtime.
assertBreakDirInvariants();

/**
 * Verifies every template's `constraints.depthRangeYds` actually contains
 * its canonical geometry's deepest waypoint, AND that `constraints.side`
 * agrees with `breakDir`. Catches the class of bug where a coach widens a
 * template's break point without updating the constraint, or where the
 * declared side flips out from under the geometry.
 *
 * fieldLengthYds is 25 for every variant (see sportProfileForVariant), so
 * yards = template_y_norm * 25.
 */
function assertConstraintsMatchGeometry(): void {
  const FIELD_LENGTH_YDS = 25;
  for (const t of ROUTE_TEMPLATES) {
    if (!t.constraints) {
      throw new Error(`Route template "${t.name}" is missing constraints.`);
    }
    const { depthRangeYds, side } = t.constraints;
    if (side !== t.breakDir) {
      throw new Error(
        `Route template "${t.name}" has constraints.side="${side}" but breakDir="${t.breakDir}". They MUST agree — side is what the diagram validator checks against; breakDir is what the geometry validator checks against. Set them to the same value.`,
      );
    }
    // The "deepest" yard for the constraint = max y across the route's
    // template points (yards from start). Most routes finish at their max,
    // but curl/sit settle back so check the whole path.
    let maxYds = 0;
    let minYds = 0;
    for (const p of t.points) {
      const yds = p.y * FIELD_LENGTH_YDS;
      if (yds > maxYds) maxYds = yds;
      if (yds < minYds) minYds = yds;
    }
    // The canonical depth is the deepest point reached. Allow 0.5yd of
    // slack on each side — author intent is a band, not a hairline.
    const canonical = Math.max(Math.abs(maxYds), Math.abs(minYds)) === Math.abs(minYds) && minYds < 0
      ? minYds
      : maxYds;
    if (canonical < depthRangeYds.min - 0.5 || canonical > depthRangeYds.max + 0.5) {
      throw new Error(
        `Route template "${t.name}" canonical depth ${canonical.toFixed(1)} yds falls outside its declared depthRangeYds [${depthRangeYds.min}, ${depthRangeYds.max}]. Either widen the range or move the template's break point.`,
      );
    }
    if (depthRangeYds.min > depthRangeYds.max) {
      throw new Error(
        `Route template "${t.name}" has inverted depth range [${depthRangeYds.min}, ${depthRangeYds.max}].`,
      );
    }
  }
}

assertConstraintsMatchGeometry();

/* ------------------------------------------------------------------ */
/*  Lookup helpers                                                     */
/* ------------------------------------------------------------------ */

/** Case-insensitive lookup that respects aliases. Returns null if no match. */
export function findTemplate(rawName: string): RouteTemplate | null {
  const q = rawName.trim().toLowerCase();
  if (!q) return null;
  for (const t of ROUTE_TEMPLATES) {
    if (t.name.toLowerCase() === q) return t;
    if (t.aliases?.some((a) => a.toLowerCase() === q)) return t;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*  Instantiate a template for a player                               */
/* ------------------------------------------------------------------ */

export function instantiateTemplate(
  template: RouteTemplate,
  playerPosition: Point2,
  playerId: string,
  style?: Partial<RouteStyle>,
): Route {
  // Determine which direction "outside" is for this player
  const xSign = template.directional
    ? playerPosition.x >= 0.5 ? 1 : -1
    : 1;

  const nodes: RouteNode[] = template.points.map((offset) => ({
    id: uid("node"),
    position: {
      x: Math.min(1, Math.max(0, playerPosition.x + offset.x * xSign)),
      y: Math.min(1, Math.max(0, playerPosition.y + offset.y)),
    },
  }));

  const segments: RouteSegment[] = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    segments.push({
      id: uid("seg"),
      fromNodeId: nodes[i].id,
      toNodeId: nodes[i + 1].id,
      shape: template.shapes?.[i] ?? "straight",
      strokePattern: "solid" as StrokePattern,
      controlOffset: null,
    });
  }

  return {
    id: uid("route"),
    carrierPlayerId: playerId,
    semantic: null,
    nodes,
    segments,
    style: {
      stroke: style?.stroke ?? "#FFFFFF",
      strokeWidth: style?.strokeWidth ?? 2.5,
      ...style,
    },
  };
}
