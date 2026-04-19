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

/**
 * Dash array values for use with SVG `strokeDasharray` when the path has
 * `vectorEffect="non-scaling-stroke"`.  Per the SVG spec, non-scaling-stroke
 * causes both stroke-width AND stroke-dasharray to be interpreted in display
 * (screen-pixel) units rather than user-coordinate units, so values here are
 * in pixels — not SVG viewport fractions.
 */
export function strokePatternToDash(pattern: RouteSegmentType["strokePattern"]): string | undefined {
  switch (pattern) {
    case "solid":
      return undefined;
    case "dashed":
      // 10px dash, 6px gap — visible at any stroke width
      return "10 6";
    case "dotted":
      // Near-zero dash + round linecap = circular dot; 7px gap between dots
      return "1 7";
    case "motion":
      // Motion is rendered as a zig-zag SHAPE (see routeToRenderedSegments),
      // so the stroke itself stays solid.
      return undefined;
  }
}

/** Helper: build an SVG `d` string for a zig-zag between two points. */
function zigzagSvgD(from: Point2, to: Point2): string {
  const pts = zigzagPoints(from, to);
  const parts = pts.map((p, i) => {
    const px = p.x;
    const py = toSvgY(p.y);
    return i === 0 ? `M ${px} ${py}` : `L ${px} ${py}`;
  });
  return parts.join(" ");
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
  // Perpendicular offset (rotate 90° CCW) — fallback only; prefer catmullRomD when route context available
  const nx = -dy / (len || 1);
  const ny = dx / (len || 1);
  return { x: mx + nx * offset, y: my + ny * offset };
}

/**
 * Catmull-Rom → cubic bezier (SVG `C` command).
 * p0/p3 are the previous and next nodes (for tangent computation).
 * When absent, the tangent is extrapolated from p1→p2.
 */
function catmullRomD(
  p0: Point2 | null,
  p1: Point2,
  p2: Point2,
  p3: Point2 | null,
): string {
  // Ghost endpoints when neighbours are missing (extend the tangent linearly)
  const g0x = p0 ? p0.x : p1.x - (p2.x - p1.x);
  const g0y = p0 ? p0.y : p1.y - (p2.y - p1.y);
  const g3x = p3 ? p3.x : p2.x + (p2.x - p1.x);
  const g3y = p3 ? p3.y : p2.y + (p2.y - p1.y);

  // Cubic bezier control points (Catmull-Rom formula, tension = 1/6)
  const cp1x = p1.x + (p2.x - g0x) / 6;
  const cp1y = p1.y + (p2.y - g0y) / 6;
  const cp2x = p2.x - (g3x - p1.x) / 6;
  const cp2y = p2.y - (g3y - p1.y) / 6;

  return (
    `M ${p1.x} ${toSvgY(p1.y)} ` +
    `C ${cp1x} ${toSvgY(cp1y)} ${cp2x} ${toSvgY(cp2y)} ${p2.x} ${toSvgY(p2.y)}`
  );
}

/**
 * Catmull-Rom → single quadratic bezier approximation (for the PathGeometry bridge).
 * Returns the quadratic control point.
 */
function catmullRomQuadControl(
  p0: Point2 | null,
  p1: Point2,
  p2: Point2,
  p3: Point2 | null,
): Point2 {
  const g0x = p0 ? p0.x : p1.x - (p2.x - p1.x);
  const g0y = p0 ? p0.y : p1.y - (p2.y - p1.y);
  const g3x = p3 ? p3.x : p2.x + (p2.x - p1.x);
  const g3y = p3 ? p3.y : p2.y + (p2.y - p1.y);

  const cp1x = p1.x + (p2.x - g0x) / 6;
  const cp1y = p1.y + (p2.y - g0y) / 6;
  const cp2x = p2.x - (g3x - p1.x) / 6;
  const cp2y = p2.y - (g3y - p1.y) / 6;

  // Mid-point of the two cubic CPs ≈ quadratic CP
  return { x: (cp1x + cp2x) / 2, y: (cp1y + cp2y) / 2 };
}

function zigzagPoints(from: Point2, to: Point2, zigCount?: number): Point2[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  // Tight motion marks: fixed amplitude in normalized field coords and
  // wavelength scaled to segment length (min 10 zigs, ~1 zig per 2.5% field).
  const amplitude = 0.012;
  const zigs = zigCount ?? Math.max(14, Math.round(len / 0.018));
  const nx = -dy / (len || 1);
  const ny = dx / (len || 1);
  const pts: Point2[] = [from];
  for (let i = 1; i < zigs; i++) {
    const t = i / zigs;
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

  // Build adjacency for Catmull-Rom neighbour lookup.
  // segTo[nodeId]   = the segment whose toNodeId === nodeId (its predecessor)
  // segFrom[nodeId] = the segment whose fromNodeId === nodeId (its successor)
  // Note: in branching routes multiple segs can share a fromNodeId; we just pick
  // the first match — good enough for visual smoothing.
  const segTo = new Map<string, RouteSegmentType>();
  const segFrom = new Map<string, RouteSegmentType>();
  for (const s of route.segments) {
    if (!segTo.has(s.toNodeId)) segTo.set(s.toNodeId, s);
    if (!segFrom.has(s.fromNodeId)) segFrom.set(s.fromNodeId, s);
  }

  const result: RenderedSegment[] = [];

  for (const seg of route.segments) {
    const fromNode = nodeMap.get(seg.fromNodeId);
    const toNode = nodeMap.get(seg.toNodeId);
    if (!fromNode || !toNode) continue;

    let d: string;

    if (seg.strokePattern === "motion") {
      // Motion is a visual zig-zag (classic pre-snap motion symbol),
      // regardless of the segment's declared shape.
      d = zigzagSvgD(fromNode.position, toNode.position);
    } else if (seg.shape === "curve") {
      if (seg.controlOffset) {
        // Manual override — keep quadratic bezier
        const fx = fromNode.position.x;
        const fy = toSvgY(fromNode.position.y);
        const tx = toNode.position.x;
        const ty = toSvgY(toNode.position.y);
        const cx = seg.controlOffset.x;
        const cy = toSvgY(seg.controlOffset.y);
        d = `M ${fx} ${fy} Q ${cx} ${cy} ${tx} ${ty}`;
      } else {
        // Auto — use Catmull-Rom with neighbouring nodes for natural flow
        const prevSeg = segTo.get(seg.fromNodeId);
        const nextSeg = segFrom.get(seg.toNodeId);
        const prevNode = prevSeg ? nodeMap.get(prevSeg.fromNodeId) : undefined;
        const nextNode = nextSeg ? nodeMap.get(nextSeg.toNodeId) : undefined;
        d = catmullRomD(
          prevNode?.position ?? null,
          fromNode.position,
          toNode.position,
          nextNode?.position ?? null,
        );
      }
    } else {
      d = segmentToSvgD(seg, fromNode.position, toNode.position);
    }

    result.push({
      segmentId: seg.id,
      d,
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

  // Same adjacency lookup as routeToRenderedSegments for consistent curves
  const segTo = new Map<string, RouteSegmentType>();
  const segFrom = new Map<string, RouteSegmentType>();
  for (const s of route.segments) {
    if (!segTo.has(s.toNodeId)) segTo.set(s.toNodeId, s);
    if (!segFrom.has(s.fromNodeId)) segFrom.set(s.fromNodeId, s);
  }

  const segments: PathGeometry["segments"] = [];

  for (const seg of route.segments) {
    const from = nodeMap.get(seg.fromNodeId);
    const to = nodeMap.get(seg.toNodeId);
    if (!from || !to) continue;

    if (seg.strokePattern === "motion") {
      // Motion renders as a zig-zag regardless of declared shape
      const pts = zigzagPoints(from.position, to.position);
      for (let i = 0; i < pts.length - 1; i++) {
        segments.push({
          type: "line",
          from: pts[i],
          to: pts[i + 1],
          kind: "clicked",
        });
      }
      continue;
    }

    if (seg.shape === "curve") {
      let ctrl: Point2;
      if (seg.controlOffset) {
        ctrl = seg.controlOffset;
      } else {
        const prevSeg = segTo.get(seg.fromNodeId);
        const nextSeg = segFrom.get(seg.toNodeId);
        const prevNode = prevSeg ? nodeMap.get(prevSeg.fromNodeId) : undefined;
        const nextNode = nextSeg ? nodeMap.get(nextSeg.toNodeId) : undefined;
        ctrl = catmullRomQuadControl(
          prevNode?.position ?? null,
          from.position,
          to.position,
          nextNode?.position ?? null,
        );
      }
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
