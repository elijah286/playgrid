import type { Point2, RouteNode, RouteSegment, SegmentShape, StrokePattern, Route, RouteStyle } from "./types";
import { uid } from "./factory";

/**
 * Canonical route catalog — SINGLE SOURCE OF TRUTH for every named route's
 * geometry, break shape, and prose definition.
 *
 * The KB seed (supabase/migrations/0144_seed_routes_global.sql, patched by
 * 0184_seed_routes_canonical.sql) intentionally mirrors the `description`
 * field below so Coach Cal's words and the rendered diagram stay consistent.
 *
 * Coordinate system for `points` (offsets from player start):
 *   x: fraction of FIELD WIDTH (per variant). xSign flips at runtime so
 *      "inside"/"outside" tracks the receiver's actual side of the formation.
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
 * Adding/changing a template? Update three things in lockstep:
 *   1. The template here (geometry + shapes + description + breakStyle).
 *   2. The KB entry in 0144_seed_routes_global.sql (so fresh DBs match).
 *   3. A new migration that UPDATEs the live DB row (so existing DBs match).
 */

export type BreakStyle =
  | "none"          // no break — straight line (Go, Seam, Drag, Flat)
  | "sharp"         // single sharp corner (Slant, Out, In, Post, Corner, Dig, Quick Out)
  | "rounded"       // round/curving turn (Curl, Comeback, Hitch, Wheel turnup, Fade)
  | "multi";        // double moves (Out & Up, Stop & Go, Whip)

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
    kbSubtopic: "route_in",
    description:
      "Vertical 8 yards then a SHARP 90° break to the inside. Shallower than a Dig — sits in front of the LBs / under the safeties. Common quick-game intermediate vs zone.",
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
    kbSubtopic: "route_post",
    description:
      "Vertical 11-12 yards then a SHARP 45°-above-horizontal break inside toward the goalpost (route tree #8). Beats single-high (Cover 1, Cover 3) when the safety bites, and beats Cover 2 between the safeties. Pair with a deep crosser to clear the safety.",
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
    kbSubtopic: "route_corner",
    description:
      "Vertical 11-12 yards then a SHARP 45°-above-horizontal break outside toward the back pylon (route tree #7). Beats Cover 2 (corner sits flat) and Cover 4 (corner stays inside on outside #1). Often the high in a smash concept.",
  },
  {
    name: "Curl",
    aliases: ["Hook"],
    directional: true,
    // Stem 11 yds, ROUNDED ~180° turn back toward QB, settle ~9 yds depth.
    // The curl is defined by the round turn-back — NOT a sharp corner.
    points: [
      { x: 0, y: 0 },
      { x: 0, y: 0.44 },
      { x: 0.04, y: 0.36 },
    ],
    shapes: ["straight", "curve"],
    breakStyle: "rounded",
    kbSubtopic: "route_curl",
    description:
      "Vertical 10-12 yards then a ROUNDED ~180° turn back toward the QB, settling in a soft spot in the zone at ~9 yds depth (route tree #6). The break is a smooth turn-back, NOT a sharp corner — receiver decelerates and curls. Reliable vs zone — find the window between defenders.",
  },
  {
    name: "Comeback",
    directional: true,
    // Stem 13 yds, rounded break back toward sideline, finish ~10 yds.
    points: [
      { x: 0, y: 0 },
      { x: 0, y: 0.52 },
      { x: 0.10, y: 0.40 },
    ],
    shapes: ["straight", "curve"],
    breakStyle: "rounded",
    kbSubtopic: "route_comeback",
    description:
      "Vertical 12-13 yards then a ROUNDED break back at ~45° toward the sideline, settling at ~10 yds depth (route tree #5). Sideline route, stops the clock. Defender must drive forward — comeback wins on the cushion.",
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
    kbSubtopic: "route_arrow",
    description:
      "RB or slot releases at a slight angle to the flat, gaining a bit of depth (~3 yds). Outlet for the QB and high-low partner with a sit/curl over the top.",
  },
  {
    name: "Sit",
    aliases: ["Stick"],
    directional: true,
    // Run to ~5-6 yds and settle facing QB. The sit is a small ROUNDED
    // turn-back, not a sharp corner.
    points: [
      { x: 0, y: 0 },
      { x: 0, y: 0.22 },
      { x: 0, y: 0.18 },
    ],
    shapes: ["straight", "curve"],
    breakStyle: "rounded",
    kbSubtopic: "route_stick",
    description:
      "Vertical stem to 5-6 yards, then a small ROUNDED settle facing the QB (the receiver stops and turns back). Foundation of the stick concept (with a flat underneath and a clear over the top). Quick-game staple, 3rd-and-medium reliable.",
  },
  {
    name: "Hitch",
    directional: true,
    // 5-yd stem then ROUNDED settle back toward QB at ~4 yds.
    points: [
      { x: 0, y: 0 },
      { x: 0, y: 0.20 },
      { x: 0.02, y: 0.16 },
    ],
    shapes: ["straight", "curve"],
    breakStyle: "rounded",
    kbSubtopic: "route_hitch",
    description:
      "5-yard vertical release then a ROUNDED quick turn back toward the QB, settling at 4-5 yds (route tree #1). The turn-back is a smooth settle, not a sharp corner. Beats off-coverage instantly. Quick-game staple.",
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
    kbSubtopic: "route_quick_out",
    description:
      "5-yard out — vertical then SHARP 90° break to the sideline at full speed (no break-down). Catches at 4-5 yds. Beats off-man, stops the clock, gets the ball out fast vs pressure.",
  },
  {
    name: "Drag",
    aliases: ["Shallow", "Shallow Cross"],
    directional: true,
    // Shallow cross at ~3 yds depth across the formation.
    points: [
      { x: 0, y: 0 },
      { x: -0.32, y: 0.10 },
    ],
    shapes: ["straight"],
    breakStyle: "none",
    kbSubtopic: "route_drag",
    description:
      "Shallow crossing route — receiver releases across the formation at 2-4 yds depth, gaining a small amount of depth as he crosses. No hard break. Foundation of mesh and shallow concepts. Beats man — defender has to fight through traffic.",
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
    kbSubtopic: "route_fade",
    description:
      "Vertical release with a ROUNDED outside arc toward the sideline (no hard break). Ball thrown back-shoulder or up-and-away. Red-zone staple — defender can't recover when the throw is placed up-and-away. Usually a tall WR vs a short DB.",
  },
  {
    name: "Bubble",
    aliases: ["Bubble Screen"],
    directional: true,
    // Banana arc behind the LOS.
    points: [
      { x: 0, y: 0 },
      { x: 0.04, y: -0.04 },
      { x: 0.16, y: -0.02 },
    ],
    shapes: ["curve", "curve"],
    breakStyle: "rounded",
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
    kbSubtopic: "route_skinny_post",
    description:
      "Vertical 10 yards then a SHALLOW inside break (~70° above horizontal — much closer to vertical than a true 45° post). Beats Cover 3 between the corner and the deep middle safety. Common as the pass option in inside-zone RPOs.",
  },
  {
    name: "Whip",
    aliases: ["Whip-In"],
    directional: true,
    // Sell out for 3 yds, snap back inside on slant angle.
    points: [
      { x: 0, y: 0 },
      { x: 0.10, y: 0.12 },
      { x: -0.16, y: 0.20 },
    ],
    shapes: ["straight", "straight"],
    breakStyle: "multi",
    kbSubtopic: "route_whip",
    description:
      "Receiver fakes outward (like a quick out) for 3-5 yards, then SHARPLY whips back inside on a slant angle. Misdirection — beats man when defender bites on the out fake.",
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
    kbSubtopic: "route_in",
    description:
      "Deeper variant of the In — vertical 7 yds then a SHARP 90° break to the inside. Typically run by the Z (flanker) when a regular In's depth is wrong for the timing. Same family as In; see Route: In for details.",
  },
  {
    name: "Stop & Go",
    aliases: ["Sluggo", "Hitch and Go"],
    directional: true,
    // Stem 5, fake stop (small back-step / settle), then release deep.
    points: [
      { x: 0, y: 0 },
      { x: 0, y: 0.20 },
      { x: 0.04, y: 0.16 },
      { x: 0, y: 0.55 },
    ],
    shapes: ["straight", "curve", "straight"],
    breakStyle: "multi",
    kbSubtopic: "route_hitch_and_go",
    description:
      "Stem 5 yds, fake the hitch (small ROUNDED settle), then release vertical at full speed. Beats off-coverage corners who break aggressively on the hitch. Same family as sluggo (slant-and-go).",
  },
  {
    name: "Dig",
    aliases: ["Square-In"],
    directional: true,
    // Deep in-breaker (~13 yds), sharp 90° inside.
    points: [
      { x: 0, y: 0 },
      { x: 0, y: 0.52 },
      { x: -0.30, y: 0.52 },
    ],
    shapes: ["straight", "straight"],
    breakStyle: "sharp",
    kbSubtopic: "route_dig",
    description:
      "Vertical 12-15 yards then a SHARP 90° break to the inside, finishing across the middle (route tree #4). Beats man and zone — sits in the window between LB depth and safety depth. Foundation of dig-post and levels concepts.",
  },
];

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
