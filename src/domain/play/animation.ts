import type { Point2, Route, RouteSegment } from "./types";

/* ------------------------------------------------------------------ */
/*  Route discretization → uniform (x,y) polyline in field coords     */
/* ------------------------------------------------------------------ */

/**
 * A single route flattened to a polyline so we can sample positions by
 * arc-length. Curves are sampled densely so the animated path matches the
 * rendered route. Motion segments collapse to a straight line from the
 * motion's starting anchor to its end anchor — the visible zig-zag is a
 * pre-snap convention, not a path the player actually runs.
 *
 * If a route branches, the player follows the first branch created at each
 * fork (segments are picked in their route.segments array order). A player
 * can only be in one place at a time.
 */
export type FlatRoute = {
  routeId: string;
  carrierPlayerId: string;
  /** Polyline points in field coords (y-up), length >= 2. */
  points: Point2[];
  /** Running sum of Euclidean distances between consecutive points. */
  cumulative: number[];
  /** Total length == cumulative[cumulative.length - 1]. */
  length: number;
  /**
   * Arc-length at which post-motion segments begin. 0 means the whole route
   * is post-snap. Equal to `length` when the whole route is motion.
   */
  motionBoundary: number;
  /**
   * Pre-rendered SVG `d` string matching the static route render, so the
   * overlay can draw an exact copy of the visible path (curves and all).
   * Ordered along the same walk used to build `points`.
   */
  fullD: string;
};

const CURVE_SAMPLES = 32;

function toSvgY(y: number) {
  return 1 - y;
}

function quadPoint(from: Point2, ctrl: Point2, to: Point2, t: number): Point2 {
  const u = 1 - t;
  return {
    x: u * u * from.x + 2 * u * t * ctrl.x + t * t * to.x,
    y: u * u * from.y + 2 * u * t * ctrl.y + t * t * to.y,
  };
}

function autoControl(from: Point2, to: Point2): Point2 {
  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  const offset = len * 0.2;
  const nx = -dy / (len || 1);
  const ny = dx / (len || 1);
  return { x: mx + nx * offset, y: my + ny * offset };
}

/** Catmull-Rom → single quadratic control point (mirror of geometry.ts). */
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
  return { x: (cp1x + cp2x) / 2, y: (cp1y + cp2y) / 2 };
}

/**
 * Pick the segment to follow from a given node. When multiple segments leave
 * the same node (a branch), we pick the one that appeared first in
 * `route.segments` — the first branch created.
 */
function buildWalk(route: Route): RouteSegment[] {
  const incoming = new Set(route.segments.map((s) => s.toNodeId));
  let rootId: string | null = null;
  for (const n of route.nodes) {
    if (!incoming.has(n.id)) {
      rootId = n.id;
      break;
    }
  }
  if (!rootId) rootId = route.nodes[0]?.id ?? null;
  if (!rootId) return [];

  // Ordered outgoing segments per node (preserves route.segments order).
  const outgoing = new Map<string, RouteSegment[]>();
  for (const s of route.segments) {
    const arr = outgoing.get(s.fromNodeId) ?? [];
    arr.push(s);
    outgoing.set(s.fromNodeId, arr);
  }

  const walked: RouteSegment[] = [];
  const seen = new Set<string>();
  let cur = rootId;
  while (true) {
    const outs = outgoing.get(cur);
    if (!outs || outs.length === 0) break;
    const next = outs[0];
    if (seen.has(next.id)) break;
    seen.add(next.id);
    walked.push(next);
    cur = next.toNodeId;
  }
  return walked;
}

/**
 * Sample a segment into (>=1) interior points ending at `to`. The caller
 * already has `from` as the previous polyline point, so we do NOT include it.
 */
function samplesForSegment(
  seg: RouteSegment,
  from: Point2,
  to: Point2,
  prevFrom: Point2 | null,
  nextTo: Point2 | null,
): Point2[] {
  // Motion: player runs a straight line from motion start to motion end.
  if (seg.strokePattern === "motion") return [to];

  if (seg.shape === "curve") {
    const ctrl = seg.controlOffset
      ? seg.controlOffset
      : catmullRomQuadControl(prevFrom, from, to, nextTo);
    const out: Point2[] = [];
    for (let i = 1; i <= CURVE_SAMPLES; i++) {
      out.push(quadPoint(from, ctrl, to, i / CURVE_SAMPLES));
    }
    return out;
  }

  // Zigzag: treat as a straight line for pacing (short amplitude wouldn't
  // meaningfully change player travel; visual zigzag is covered by the
  // overlay's fullD render).
  return [to];
}

/**
 * Build the SVG `d` string for the full walked route, matching the static
 * render exactly: per-segment `M … L/Q …` commands (motion becomes a plain
 * straight line here — the zig-zag motion symbol is baked into the static
 * render; during playback we show a clean line since the player runs it).
 */
function walkToFullD(
  walked: RouteSegment[],
  nodeMap: Map<string, { position: Point2 }>,
): string {
  const parts: string[] = [];
  walked.forEach((seg, i) => {
    const from = nodeMap.get(seg.fromNodeId)?.position;
    const to = nodeMap.get(seg.toNodeId)?.position;
    if (!from || !to) return;
    const fx = from.x;
    const fy = toSvgY(from.y);
    const tx = to.x;
    const ty = toSvgY(to.y);

    if (seg.strokePattern !== "motion" && seg.shape === "curve") {
      const prevFrom = i > 0 ? nodeMap.get(walked[i - 1].fromNodeId)?.position ?? null : null;
      const nextTo = i < walked.length - 1
        ? nodeMap.get(walked[i + 1].toNodeId)?.position ?? null
        : null;
      const ctrl = seg.controlOffset
        ? seg.controlOffset
        : catmullRomQuadControl(prevFrom, from, to, nextTo);
      parts.push(`M ${fx} ${fy} Q ${ctrl.x} ${toSvgY(ctrl.y)} ${tx} ${ty}`);
    } else {
      parts.push(`M ${fx} ${fy} L ${tx} ${ty}`);
    }
  });
  return parts.join(" ");
}

export function flattenRoute(route: Route): FlatRoute | null {
  if (route.nodes.length < 2 || route.segments.length === 0) return null;

  const nodeMap = new Map(route.nodes.map((n) => [n.id, n]));
  const walked = buildWalk(route);
  if (walked.length === 0) return null;

  const startNode = nodeMap.get(walked[0].fromNodeId);
  if (!startNode) return null;

  const points: Point2[] = [startNode.position];
  let motionBoundaryIdx: number | null = null;
  let inMotion = false;

  walked.forEach((seg, i) => {
    const fromNode = nodeMap.get(seg.fromNodeId);
    const toNode = nodeMap.get(seg.toNodeId);
    if (!fromNode || !toNode) return;

    const isMotion = seg.strokePattern === "motion";
    if (isMotion) inMotion = true;
    if (!isMotion && inMotion && motionBoundaryIdx === null) {
      // Last point already in `points` is where motion ended.
      motionBoundaryIdx = points.length - 1;
    }

    const prevFrom = i > 0 ? nodeMap.get(walked[i - 1].fromNodeId)?.position ?? null : null;
    const nextTo = i < walked.length - 1
      ? nodeMap.get(walked[i + 1].toNodeId)?.position ?? null
      : null;
    const added = samplesForSegment(seg, fromNode.position, toNode.position, prevFrom, nextTo);
    points.push(...added);
  });

  if (points.length < 2) return null;

  const cumulative: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    cumulative.push(cumulative[i - 1] + Math.hypot(dx, dy));
  }
  const length = cumulative[cumulative.length - 1];

  let motionBoundary = 0;
  if (inMotion) {
    const idx = motionBoundaryIdx ?? points.length - 1;
    motionBoundary = cumulative[idx] ?? length;
  }

  return {
    routeId: route.id,
    carrierPlayerId: route.carrierPlayerId,
    points,
    cumulative,
    length,
    motionBoundary,
    fullD: walkToFullD(walked, nodeMap),
  };
}

/** Arc-length of the motion portion (0 if no motion). */
export function motionLength(f: FlatRoute): number {
  return f.motionBoundary;
}

export function hasMotion(f: FlatRoute): boolean {
  return f.motionBoundary > 0;
}

/* ------------------------------------------------------------------ */
/*  Sampling                                                          */
/* ------------------------------------------------------------------ */

export function sampleAt(f: FlatRoute, s: number): Point2 {
  const clamped = Math.max(0, Math.min(f.length, s));
  let lo = 0;
  let hi = f.cumulative.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (f.cumulative[mid] < clamped) lo = mid + 1;
    else hi = mid;
  }
  if (lo === 0) return f.points[0];
  const segStart = f.cumulative[lo - 1];
  const segEnd = f.cumulative[lo];
  const segLen = segEnd - segStart;
  const t = segLen > 0 ? (clamped - segStart) / segLen : 0;
  const a = f.points[lo - 1];
  const b = f.points[lo];
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}
