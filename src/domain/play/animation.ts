import type { Point2, Route, RouteSegment } from "./types";

/* ------------------------------------------------------------------ */
/*  Route discretization → uniform (x,y) polyline in field coords     */
/* ------------------------------------------------------------------ */

/**
 * A single route flattened to a polyline so we can sample positions by
 * arc-length. All segment shapes (straight, curve, zigzag, motion zig-zag)
 * reduce to line-strip samples here.
 *
 * `length` is Euclidean length in field-units (x:0..1, y:0..1). Since the
 * field square is drawn with uniform aspect (the scale(fieldAspect,1) group
 * compensates rendering), two routes of equal field-unit length animate for
 * the same duration — which is what we want for "1 yard per tick" feel.
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
   * Index in `points` at which post-motion segments begin. 0 means the whole
   * route is post-snap (no motion). points.length - 1 means the whole route
   * is motion (rare). Used to split animation into pre-snap + post-snap.
   */
  motionSplitIndex: number;
};

const CURVE_SAMPLES = 24;
const ZIGZAG_SAMPLES = 2;

function quadPoint(
  from: Point2,
  ctrl: Point2,
  to: Point2,
  t: number,
): Point2 {
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

function samplesForSegment(
  seg: RouteSegment,
  from: Point2,
  to: Point2,
): Point2[] {
  // Motion renders as a zig-zag regardless of declared shape, but for
  // animation purposes the player moves along the straight line between
  // endpoints (the zig-zag is a visual convention, not a path to run).
  if (seg.strokePattern === "motion") {
    return [to];
  }
  if (seg.shape === "curve") {
    const ctrl = seg.controlOffset ?? autoControl(from, to);
    const out: Point2[] = [];
    for (let i = 1; i <= CURVE_SAMPLES; i++) {
      out.push(quadPoint(from, ctrl, to, i / CURVE_SAMPLES));
    }
    return out;
  }
  if (seg.shape === "zigzag") {
    const out: Point2[] = [];
    for (let i = 1; i <= ZIGZAG_SAMPLES; i++) {
      const t = i / ZIGZAG_SAMPLES;
      out.push({
        x: from.x + (to.x - from.x) * t,
        y: from.y + (to.y - from.y) * t,
      });
    }
    return out;
  }
  return [to];
}

/**
 * Flatten a Route into a polyline plus cumulative arc-length table, with a
 * split index marking where motion (pre-snap) ends and the live route begins.
 *
 * Branching routes are flattened as a single chain by walking fromNodeId →
 * toNodeId in segment order; for the playback feature this is good enough.
 */
export function flattenRoute(route: Route): FlatRoute | null {
  if (route.nodes.length < 2 || route.segments.length === 0) return null;

  const nodeMap = new Map(route.nodes.map((n) => [n.id, n]));
  const first = nodeMap.get(route.segments[0].fromNodeId);
  if (!first) return null;

  const points: Point2[] = [first.position];
  let motionSplitIndex = 0;
  let sawMotion = false;

  for (const seg of route.segments) {
    const fromNode = nodeMap.get(seg.fromNodeId);
    const toNode = nodeMap.get(seg.toNodeId);
    if (!fromNode || !toNode) continue;

    // Track motion→non-motion boundary. As soon as we encounter a motion
    // segment, remember the index of its starting point (we can't know the
    // end yet); when we first see a non-motion segment *after* motion, the
    // current points.length is where post-motion begins.
    if (seg.strokePattern === "motion" && !sawMotion) {
      sawMotion = true;
      motionSplitIndex = points.length; // motion segments start appending from here
    }
    if (seg.strokePattern !== "motion" && sawMotion) {
      // If we've already started appending the motion's end-point,
      // points.length here is the post-motion start.
      if (motionSplitIndex === 0) motionSplitIndex = points.length;
    }

    const added = samplesForSegment(seg, fromNode.position, toNode.position);
    points.push(...added);
  }

  if (points.length < 2) return null;

  // If the whole route was motion, the split is the final point (nothing
  // post-snap). If sawMotion but split never moved past 0, set split to end
  // of motion (covers the case where the entire route is motion).
  if (sawMotion && motionSplitIndex === 0) {
    motionSplitIndex = points.length - 1;
  }
  // Also: when the motion→non-motion transition happened mid-route, find the
  // actual boundary by re-walking. Above logic is approximate; the exact
  // boundary is the first sample contributed by a non-motion segment after
  // motion segments began.
  {
    let walkedPoints = 1; // first point
    let inMotion = false;
    let boundary = 0;
    for (const seg of route.segments) {
      const fromNode = nodeMap.get(seg.fromNodeId);
      const toNode = nodeMap.get(seg.toNodeId);
      if (!fromNode || !toNode) continue;
      const added = samplesForSegment(seg, fromNode.position, toNode.position);
      const isMotion = seg.strokePattern === "motion";
      if (isMotion) inMotion = true;
      if (!isMotion && inMotion && boundary === 0) {
        boundary = walkedPoints; // index at which this non-motion segment's samples start
      }
      walkedPoints += added.length;
    }
    if (sawMotion) {
      motionSplitIndex = boundary || points.length - 1;
    }
  }

  const cumulative: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    cumulative.push(cumulative[i - 1] + Math.hypot(dx, dy));
  }

  return {
    routeId: route.id,
    carrierPlayerId: route.carrierPlayerId,
    points,
    cumulative,
    length: cumulative[cumulative.length - 1],
    motionSplitIndex,
  };
}

/**
 * Arc-length at which the motion portion ends (pre-snap). 0 if no motion.
 * Everything from this length onward is post-snap.
 */
export function motionLength(f: FlatRoute): number {
  if (f.motionSplitIndex <= 0) return 0;
  return f.cumulative[f.motionSplitIndex] ?? 0;
}

export function hasMotion(f: FlatRoute): boolean {
  return motionLength(f) > 0;
}

/* ------------------------------------------------------------------ */
/*  Sampling                                                          */
/* ------------------------------------------------------------------ */

/**
 * Position along the flattened route at arc-length `s` (clamped to [0,length]).
 */
export function sampleAt(f: FlatRoute, s: number): Point2 {
  const clamped = Math.max(0, Math.min(f.length, s));
  // Binary search the cumulative table.
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

/**
 * Build an SVG `d` string for a poly-segment of the flat route, from arc
 * length `s0` to `s1` (inclusive). Coords flipped (y-up → SVG y-down).
 */
export function subpathD(f: FlatRoute, s0: number, s1: number): string {
  if (s1 <= s0) return "";
  const start = sampleAt(f, s0);
  const parts: string[] = [`M ${start.x} ${1 - start.y}`];
  for (let i = 1; i < f.points.length; i++) {
    const cLo = f.cumulative[i - 1];
    const cHi = f.cumulative[i];
    if (cHi <= s0) continue;
    if (cLo >= s1) break;
    if (cLo >= s0 && cHi <= s1) {
      const p = f.points[i];
      parts.push(`L ${p.x} ${1 - p.y}`);
    } else if (cLo < s0 && cHi > s0 && cHi <= s1) {
      const p = f.points[i];
      parts.push(`L ${p.x} ${1 - p.y}`);
    } else if (cLo >= s0 && cLo < s1 && cHi > s1) {
      const end = sampleAt(f, s1);
      parts.push(`L ${end.x} ${1 - end.y}`);
      break;
    } else if (cLo < s0 && cHi > s1) {
      const end = sampleAt(f, s1);
      parts.push(`L ${end.x} ${1 - end.y}`);
      break;
    }
  }
  return parts.join(" ");
}
