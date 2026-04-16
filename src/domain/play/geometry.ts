import type {
  PathGeometry,
  Point2,
  Route,
  RouteNode,
  RouteSegment as RouteSegmentType,
} from "./types";
import { uid } from "./factory";

/* ------------------------------------------------------------------ */
/*  SVG coordinate helpers                                            */
/* ------------------------------------------------------------------ */

/** Field coords: y=0 at bottom, y=1 at top. SVG viewBox y grows downward. */
function toSvgY(fieldY: number) {
  return 1 - fieldY;
}

/* ------------------------------------------------------------------ */
/*  Stroke pattern → SVG dash array                                   */
/* ------------------------------------------------------------------ */

export function strokePatternToDash(pattern: RouteSegmentType["strokePattern"]): string | undefined {
  switch (pattern) {
    case "solid":
      return undefined;
    case "dashed":
      return "0.015 0.008";
    case "dotted":
      return "0.003 0.008";
  }
}

/* ------------------------------------------------------------------ */
/*  Segment → SVG path `d` string                                     */
/* ------------------------------------------------------------------ */

function autoControlPoint(from: Point2, to: Point2): Point2 {
  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  const offset = len * 0.2;
  // Perpendicular offset (rotate 90° CCW)
  const nx = -dy / (len || 1);
  const ny = dx / (len || 1);
  return { x: mx + nx * offset, y: my + ny * offset };
}

function zigzagPoints(from: Point2, to: Point2, zigCount = 5): Point2[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  const amplitude = len * 0.06;
  // Perpendicular direction
  const nx = -dy / (len || 1);
  const ny = dx / (len || 1);
  const pts: Point2[] = [from];
  for (let i = 1; i < zigCount; i++) {
    const t = i / zigCount;
    const sign = i % 2 === 1 ? 1 : -1;
    pts.push({
      x: from.x + dx * t + nx * amplitude * sign,
      y: from.y + dy * t + ny * amplitude * sign,
    });
  }
  pts.push(to);
  return pts;
}

/**
 * Render a single segment to an SVG `d` string.
 * Caller provides the resolved node positions.
 */
export function segmentToSvgD(
  seg: RouteSegmentType,
  from: Point2,
  to: Point2,
): string {
  const fx = from.x;
  const fy = toSvgY(from.y);
  const tx = to.x;
  const ty = toSvgY(to.y);

  switch (seg.shape) {
    case "straight":
      return `M ${fx} ${fy} L ${tx} ${ty}`;

    case "curve": {
      const ctrl = seg.controlOffset
        ? { x: seg.controlOffset.x, y: seg.controlOffset.y }
        : autoControlPoint(from, to);
      const cx = ctrl.x;
      const cy = toSvgY(ctrl.y);
      return `M ${fx} ${fy} Q ${cx} ${cy} ${tx} ${ty}`;
    }

    case "zigzag": {
      const pts = zigzagPoints(from, to);
      const parts = pts.map((p, i) => {
        const px = p.x;
        const py = toSvgY(p.y);
        return i === 0 ? `M ${px} ${py}` : `L ${px} ${py}`;
      });
      return parts.join(" ");
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Route → array of renderable segment data                          */
/* ------------------------------------------------------------------ */

export type RenderedSegment = {
  segmentId: string;
  d: string;
  dash: string | undefined;
};

export function routeToRenderedSegments(route: Route): RenderedSegment[] {
  const nodeMap = new Map(route.nodes.map((n) => [n.id, n]));
  const result: RenderedSegment[] = [];
  for (const seg of route.segments) {
    const from = nodeMap.get(seg.fromNodeId);
    const to = nodeMap.get(seg.toNodeId);
    if (!from || !to) continue;
    result.push({
      segmentId: seg.id,
      d: segmentToSvgD(seg, from.position, to.position),
      dash: strokePatternToDash(seg.strokePattern),
    });
  }
  return result;
}

/* ------------------------------------------------------------------ */
/*  Route → PathGeometry (compat bridge for print/animation)          */
/* ------------------------------------------------------------------ */

export function routeToPathGeometry(route: Route): PathGeometry {
  const nodeMap = new Map(route.nodes.map((n) => [n.id, n]));
  const segments: PathGeometry["segments"] = [];

  for (const seg of route.segments) {
    const from = nodeMap.get(seg.fromNodeId);
    const to = nodeMap.get(seg.toNodeId);
    if (!from || !to) continue;

    if (seg.shape === "curve") {
      const ctrl = seg.controlOffset ?? autoControlPoint(from.position, to.position);
      segments.push({
        type: "quadratic",
        from: from.position,
        control: ctrl,
        to: to.position,
        kind: "clicked",
      });
    } else if (seg.shape === "zigzag") {
      const pts = zigzagPoints(from.position, to.position);
      for (let i = 0; i < pts.length - 1; i++) {
        segments.push({
          type: "line",
          from: pts[i],
          to: pts[i + 1],
          kind: "clicked",
        });
      }
    } else {
      segments.push({
        type: "line",
        from: from.position,
        to: to.position,
        kind: "clicked",
      });
    }
  }

  return { segments };
}

/* ------------------------------------------------------------------ */
/*  Migration: old PathGeometry → RouteNode[] + RouteSegment[]        */
/* ------------------------------------------------------------------ */

export function migrateGeometryToNodes(
  geometry: PathGeometry,
): { nodes: RouteNode[]; segments: RouteSegmentType[] } {
  if (geometry.segments.length === 0) return { nodes: [], segments: [] };

  const nodes: RouteNode[] = [];
  const segs: RouteSegmentType[] = [];

  // First point
  const first = geometry.segments[0];
  const firstNode: RouteNode = { id: uid("node"), position: first.from };
  nodes.push(firstNode);

  let prevNodeId = firstNode.id;

  for (const s of geometry.segments) {
    const toNode: RouteNode = { id: uid("node"), position: s.to };
    nodes.push(toNode);
    segs.push({
      id: uid("seg"),
      fromNodeId: prevNodeId,
      toNodeId: toNode.id,
      shape: s.type === "quadratic" ? "curve" : "straight",
      strokePattern: "solid",
      controlOffset: s.type === "quadratic" ? s.control : null,
    });
    prevNodeId = toNode.id;
  }

  return { nodes, segments: segs };
}

/* ------------------------------------------------------------------ */
/*  Point-on-segment math (for insert-node hit testing)               */
/* ------------------------------------------------------------------ */

/** Find the closest point on a line segment, return parameter t (0–1) and distance */
export function closestPointOnLine(
  p: Point2,
  a: Point2,
  b: Point2,
): { t: number; distance: number; point: Point2 } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    const d = Math.hypot(p.x - a.x, p.y - a.y);
    return { t: 0, distance: d, point: a };
  }
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  const proj = { x: a.x + t * dx, y: a.y + t * dy };
  return { t, distance: Math.hypot(p.x - proj.x, p.y - proj.y), point: proj };
}

/* ------------------------------------------------------------------ */
/*  Legacy functions (kept for backward compat)                       */
/* ------------------------------------------------------------------ */

/** Douglas–Peucker simplification for freehand polylines */
export function simplifyPolyline(points: Point2[], epsilon: number): Point2[] {
  if (points.length <= 2) return points;

  function perpDistance(p: Point2, a: Point2, b: Point2) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if (dx === 0 && dy === 0) return Math.hypot(p.x - a.x, p.y - a.y);
    const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy);
    const clamped = Math.max(0, Math.min(1, t));
    const proj = { x: a.x + clamped * dx, y: a.y + clamped * dy };
    return Math.hypot(p.x - proj.x, p.y - proj.y);
  }

  function recurse(pts: Point2[], start: number, end: number, out: Point2[]) {
    let maxDist = 0;
    let index = start;
    for (let i = start + 1; i < end; i++) {
      const d = perpDistance(pts[i], pts[start], pts[end]);
      if (d > maxDist) {
        index = i;
        maxDist = d;
      }
    }
    if (maxDist > epsilon) {
      recurse(pts, start, index, out);
      out.push(pts[index]);
      recurse(pts, index, end, out);
    }
  }

  const out: Point2[] = [points[0]];
  recurse(points, 0, points.length - 1, out);
  out.push(points[points.length - 1]);

  const dedup = out.filter(
    (p, i) => i === 0 || p.x !== out[i - 1].x || p.y !== out[i - 1].y,
  );
  return dedup;
}

export function polylineToSegments(
  points: Point2[],
  kind: import("./types").PathSegmentKind,
): PathGeometry["segments"] {
  if (points.length < 2) return [];
  const segments: PathGeometry["segments"] = [];
  for (let i = 0; i < points.length - 1; i++) {
    segments.push({
      type: "line",
      from: points[i],
      to: points[i + 1],
      kind,
    });
  }
  return segments;
}

export function pathGeometryToSvgD(geometry: PathGeometry): string {
  const parts: string[] = [];
  for (const seg of geometry.segments) {
    if (seg.type === "line") {
      const fx = seg.from.x;
      const fy = toSvgY(seg.from.y);
      const tx = seg.to.x;
      const ty = toSvgY(seg.to.y);
      if (parts.length === 0) {
        parts.push(`M ${fx} ${fy}`);
      }
      parts.push(`L ${tx} ${ty}`);
    } else {
      const fx = seg.from.x;
      const fy = toSvgY(seg.from.y);
      const cx = seg.control.x;
      const cy = toSvgY(seg.control.y);
      const tx = seg.to.x;
      const ty = toSvgY(seg.to.y);
      if (parts.length === 0) {
        parts.push(`M ${fx} ${fy}`);
      }
      parts.push(`Q ${cx} ${cy} ${tx} ${ty}`);
    }
  }
  return parts.join(" ");
}
