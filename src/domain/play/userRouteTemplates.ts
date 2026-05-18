// Per-user custom route templates. Stored in public.user_route_templates and
// surfaced in the Quick Routes panel under "Your routes". Separate from the
// canonical ROUTE_TEMPLATES catalog (src/domain/play/routeTemplates.ts):
//
//   - System catalog is Cal's single source of geometric truth (AGENTS.md
//     Rule 5/6). User templates are editor-only and never feed Cal.
//   - System templates carry catalog metadata (constraints, kbSubtopic,
//     breakDir invariants). User templates carry just enough to round-trip
//     a coach-drawn route: geometry + per-segment shape + visual style.
//
// Coordinate convention matches the system catalog: positive x = OUTSIDE
// (toward sideline), negative x = INSIDE (toward middle). When the
// originating player is on the left half of the field (x < 0.5), we mirror
// the captured offsets so the saved template's "outside" reads consistently
// regardless of which side it was drawn on. Applying back to a left-side
// player re-mirrors and recovers the original geometry; applying to a
// right-side player produces the mirror-image (e.g. a right-side slant
// drawn on a right WR becomes a left-side slant for a left WR — the same
// "across the middle" shape relative to QB).

import type {
  Point2,
  Route,
  RouteNode,
  RouteSegment,
  RouteStyle,
  SegmentShape,
  StrokePattern,
} from "./types";
import { uid } from "./factory";

export type UserRouteTemplate = {
  id: string;
  name: string;
  /** Relative offsets from player start in template-coords (+x = outside). */
  points: Point2[];
  /** Per-segment shape, length = points.length - 1. */
  shapes: SegmentShape[];
  /** Per-segment stroke pattern (solid / dashed / dotted), length = points.length - 1. */
  strokePatterns?: StrokePattern[];
  /** Route style captured at save time. */
  style: RouteStyle;
  createdAt: string;
};

/** Resolved sign of "outside" for a player on the field. Right-half (x >= 0.5)
 *  is +1 (template-coords are already outside-positive); left-half is -1 so
 *  the captured offsets mirror cleanly. Mirrors the convention in
 *  routeTemplates.ts → instantiateTemplate. */
function outsideSign(playerPosition: Point2): 1 | -1 {
  return playerPosition.x >= 0.5 ? 1 : -1;
}

/**
 * Convert a coach-authored Route back into a UserRouteTemplate's raw fields.
 * The caller adds the `name` + persists; this function only handles the
 * geometric + style normalization.
 *
 * The Route's nodes hold ABSOLUTE field positions; we subtract the player's
 * start and apply the outside-sign so the stored offsets follow the system
 * catalog's outside/inside convention.
 */
export function normalizeRouteToTemplate(
  route: Route,
  playerPosition: Point2,
): Pick<UserRouteTemplate, "points" | "shapes" | "strokePatterns" | "style"> {
  const xSign = outsideSign(playerPosition);

  const nodesById = new Map(route.nodes.map((n) => [n.id, n]));

  // Order the nodes by following the segment chain from the first segment's
  // `from` outward. Falls back to the raw node order if the chain is broken
  // (defensive — Route invariant says segments form a chain, but tolerate
  // gaps rather than crash a save).
  const orderedNodes: RouteNode[] = [];
  if (route.segments.length > 0) {
    const firstFrom = nodesById.get(route.segments[0].fromNodeId);
    if (firstFrom) orderedNodes.push(firstFrom);
    for (const seg of route.segments) {
      const to = nodesById.get(seg.toNodeId);
      if (to) orderedNodes.push(to);
    }
  }
  const nodes = orderedNodes.length > 0 ? orderedNodes : route.nodes;

  const points: Point2[] = nodes.map((n) => ({
    x: (n.position.x - playerPosition.x) * xSign,
    y: n.position.y - playerPosition.y,
  }));

  const shapes: SegmentShape[] = route.segments.map((s) => s.shape);
  const strokePatterns: StrokePattern[] = route.segments.map((s) => s.strokePattern);

  return {
    points,
    shapes,
    strokePatterns,
    style: { ...route.style },
  };
}

/**
 * Instantiate a saved user template onto a player. Mirrors the system
 * catalog's instantiateTemplate but consumes the user template shape and
 * preserves the SAVED style (system templates adopt the editor's active
 * style — user templates do not, per design).
 */
export function instantiateUserTemplate(
  template: Pick<UserRouteTemplate, "points" | "shapes" | "strokePatterns" | "style">,
  playerPosition: Point2,
  playerId: string,
): Route {
  const xSign = outsideSign(playerPosition);

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
      shape: template.shapes[i] ?? "straight",
      strokePattern: template.strokePatterns?.[i] ?? "solid",
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
      stroke: template.style.stroke,
      strokeWidth: template.style.strokeWidth,
      ...(template.style.dash ? { dash: template.style.dash } : {}),
    },
  };
}
