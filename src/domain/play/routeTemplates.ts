import type { Point2, RouteNode, RouteSegment, SegmentShape, StrokePattern, Route, RouteStyle } from "./types";
import { uid } from "./factory";

export type RouteTemplate = {
  name: string;
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
    points: [
      { x: 0, y: 0 },
      { x: 0, y: 0.35 },
    ],
  },
  {
    name: "Slant",
    points: [
      { x: 0, y: 0 },
      { x: 0, y: 0.08 },
      { x: -0.12, y: 0.25 },
    ],
  },
  {
    name: "Out",
    points: [
      { x: 0, y: 0 },
      { x: 0, y: 0.18 },
      { x: 0.15, y: 0.18 },
    ],
  },
  {
    name: "In",
    points: [
      { x: 0, y: 0 },
      { x: 0, y: 0.18 },
      { x: -0.15, y: 0.18 },
    ],
  },
  {
    name: "Post",
    points: [
      { x: 0, y: 0 },
      { x: 0, y: 0.18 },
      { x: -0.10, y: 0.35 },
    ],
  },
  {
    name: "Corner",
    points: [
      { x: 0, y: 0 },
      { x: 0, y: 0.18 },
      { x: 0.12, y: 0.35 },
    ],
  },
  {
    name: "Curl",
    points: [
      { x: 0, y: 0 },
      { x: 0, y: 0.20 },
      { x: 0.02, y: 0.15 },
    ],
    shapes: ["straight", "curve"],
  },
  {
    name: "Comeback",
    points: [
      { x: 0, y: 0 },
      { x: 0, y: 0.22 },
      { x: 0.08, y: 0.16 },
    ],
  },
  {
    name: "Flat",
    points: [
      { x: 0, y: 0 },
      { x: 0.18, y: 0.03 },
    ],
  },
  {
    name: "Wheel",
    points: [
      { x: 0, y: 0 },
      { x: 0.10, y: 0.02 },
      { x: 0.12, y: 0.30 },
    ],
    shapes: ["straight", "curve"],
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
  const nodes: RouteNode[] = template.points.map((offset) => ({
    id: uid("node"),
    position: {
      x: Math.min(1, Math.max(0, playerPosition.x + offset.x)),
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
