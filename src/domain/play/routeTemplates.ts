import type { Point2, RouteNode, RouteSegment, SegmentShape, StrokePattern, Route, RouteStyle } from "./types";
import { uid } from "./factory";

export type RouteTemplate = {
  name: string;
  /** When true, x-offsets follow: positive x = toward outside, negative x = toward inside.
   *  The xSign is determined by the player's field position. */
  directional?: boolean;
  /** Relative offsets from the player position (field coords, y-up) */
  points: Point2[];
  /** Per-segment shape overrides (defaults to "straight") */
  shapes?: SegmentShape[];
};

/* ------------------------------------------------------------------ */
/*  Standard route templates (offsets relative to player position)     */
/* ------------------------------------------------------------------ */

export const ROUTE_TEMPLATES: RouteTemplate[] = [
  {
    name: "Go",
    directional: true,
    points: [
      { x: 0, y: 0 },
      { x: 0, y: 0.55 },
    ],
  },
  {
    name: "Slant",
    directional: true,
    // negative x = toward inside (middle), correct for both sides
    points: [
      { x: 0, y: 0 },
      { x: 0, y: 0.08 },
      { x: -0.18, y: 0.28 },
    ],
  },
  {
    name: "Out",
    directional: true,
    // positive x = toward outside (sideline)
    points: [
      { x: 0, y: 0 },
      { x: 0, y: 0.20 },
      { x: 0.20, y: 0.20 },
    ],
  },
  {
    name: "In",
    directional: true,
    // negative x = toward inside (middle)
    points: [
      { x: 0, y: 0 },
      { x: 0, y: 0.20 },
      { x: -0.24, y: 0.20 },
    ],
  },
  {
    name: "Post",
    directional: true,
    // negative x = toward inside (goalpost/middle)
    points: [
      { x: 0, y: 0 },
      { x: 0, y: 0.22 },
      { x: -0.18, y: 0.44 },
    ],
  },
  {
    name: "Corner",
    directional: true,
    // positive x = toward outside (back corner)
    points: [
      { x: 0, y: 0 },
      { x: 0, y: 0.22 },
      { x: 0.18, y: 0.44 },
    ],
  },
  {
    name: "Curl",
    directional: true,
    points: [
      { x: 0, y: 0 },
      { x: 0, y: 0.22 },
      { x: 0.04, y: 0.15 },
    ],
  },
  {
    name: "Comeback",
    directional: true,
    // run up, then come back slightly toward outside
    points: [
      { x: 0, y: 0 },
      { x: 0, y: 0.25 },
      { x: 0.10, y: 0.18 },
    ],
  },
  {
    name: "Flat",
    directional: true,
    // positive x = outside flat
    points: [
      { x: 0, y: 0 },
      { x: 0.22, y: 0.03 },
    ],
  },
  {
    name: "Wheel",
    directional: true,
    points: [
      { x: 0, y: 0 },
      { x: 0.12, y: 0.04 },
      { x: 0.14, y: 0.38 },
    ],
    shapes: ["straight", "curve"],
  },
  {
    name: "Out & Up",
    directional: true,
    points: [
      { x: 0, y: 0 },
      { x: 0, y: 0.20 },
      { x: 0.18, y: 0.20 },
      { x: 0.18, y: 0.52 },
    ],
  },
  {
    name: "Arrow",
    directional: true,
    // short sharp outside angle
    points: [
      { x: 0, y: 0 },
      { x: 0, y: 0.10 },
      { x: 0.16, y: 0.04 },
    ],
  },
  {
    name: "Sit",
    directional: true,
    // run up then stop/sit — final node slightly back
    points: [
      { x: 0, y: 0 },
      { x: 0, y: 0.22 },
      { x: 0, y: 0.17 },
    ],
  },
  {
    name: "Hitch",
    directional: true,
    // quick stop and turn back toward QB
    points: [
      { x: 0, y: 0 },
      { x: 0, y: 0.12 },
      { x: 0.05, y: 0.08 },
    ],
  },
  {
    name: "Drag",
    directional: true,
    // shallow cross toward inside (behind the line)
    points: [
      { x: 0, y: 0 },
      { x: -0.32, y: 0.05 },
    ],
  },
  {
    name: "Seam",
    directional: true,
    // slight inside then straight vertical
    points: [
      { x: 0, y: 0 },
      { x: -0.05, y: 0.20 },
      { x: -0.05, y: 0.55 },
    ],
  },
  {
    name: "Fade",
    directional: true,
    // go while fading toward sideline
    points: [
      { x: 0, y: 0 },
      { x: 0.08, y: 0.22 },
      { x: 0.14, y: 0.52 },
    ],
    shapes: ["straight", "curve"],
  },
  {
    name: "Bubble",
    directional: true,
    // very quick outside flat (screen concept)
    points: [
      { x: 0, y: 0 },
      { x: 0.12, y: -0.02 },
    ],
  },
  {
    name: "Spot",
    directional: true,
    // run to a specific spot and hold (like a crossing sit)
    points: [
      { x: 0, y: 0 },
      { x: -0.10, y: 0.15 },
    ],
  },
];

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
