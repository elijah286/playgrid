/**
 * Route inference — turn a hand-drawn path's geometry into a catalog
 * family name.
 *
 * Pre-2026-05-04, this lived inside specParser.ts as a hand-rolled
 * predicate list keyed off start-to-end deltas (dx, dy, depth). The
 * predicate list silently knew about 9 of the 26 ROUTE_TEMPLATES and
 * matched in declaration order — adding a new family meant writing a
 * new predicate AND finding the right place in the list. Out & Up was
 * never added; coaches' hand-drawn out-and-ups got reported back as
 * "deep post at 13 yards" because the Post predicate's `dy > dx,
 * depth in [10,15]` fired first.
 *
 * The replacement is structural: canonicalize the candidate to template
 * coordinates, then score it against EVERY entry in ROUTE_TEMPLATES via
 * resampled L2 shape distance, filtered by each template's depth+side
 * constraints. The closest qualifying template wins. Per Rule 5 of the
 * Coach Cal architecture, this makes the failure mode "matcher doesn't
 * know about a catalog family" structurally impossible — adding a 27th
 * template makes it instantly matchable, and the round-trip test in
 * routeInference.test.ts proves it before the commit lands.
 *
 * Why this works across variants without per-variant tuning: shape
 * similarity is invariant to scale within reasonable bounds, and the
 * candidate's lateral motion is normalized using the actual variant's
 * field width (so a 4yd lateral break in flag_5v5 and a 6yd lateral
 * break in flag_7v7 both read as "outside" relative to the formation).
 * The depth/side constraints are checked in YARDS, where 1 yd of slack
 * comfortably covers coach-drawing imprecision.
 */

import { ROUTE_TEMPLATES, type RouteTemplate } from "./routeTemplates";
import { sportProfileForVariant } from "./factory";
import type { SportVariant } from "./types";

/** Field length window (the chat preview / editor frame) — same across
 *  every variant per sportProfileForVariant. */
const FIELD_LENGTH_YDS = 25;

/** Number of equally-spaced (by arc length) samples used to compare two
 *  paths. 24 is enough to capture multi-segment routes (Out & Up has 3
 *  segments → 8 samples per segment, more than enough to discriminate
 *  break-then-vertical from a single 45° break). */
const N_SAMPLES = 24;

/**
 * Maximum normalized shape distance for a match. Tuned so that:
 *   - A canonical template scored against itself gets ~0 (within float
 *     epsilon).
 *   - A small perturbation (a yard or two off the canonical break) still
 *     matches its family.
 *   - A clearly-different shape (forward-then-backward zigzag, custom
 *     geometry the coach designed) falls through to null and gets
 *     preserved as a "custom" action.
 *
 * The unit is "average L2 distance per sampled point in canonical
 * normalized coords" — y is in fractions of FIELD_LENGTH_YDS (25),
 * x is in fractions of the variant's field width.
 */
const MATCH_THRESHOLD = 0.10;

/** Slack added to each side of a template's depth range when filtering.
 *  Coaches drawing freehand are routinely 1-2 yds off the canonical
 *  depth; tighter than this rejects legitimate matches and rerouter the
 *  candidate to "custom". */
const DEPTH_SLACK_YDS = 2.0;

/** Slack on the side check (final waypoint x). Same idea — small
 *  perturbations from the canonical "+x means outside" finish must
 *  still pass. In normalized field-width fractions: 0.05 ≈ 1.5yd in
 *  flag_7v7 (30yd wide), ~2.6yd in tackle_11. */
const SIDE_SLACK_NORM = 0.05;

export type InferenceResult = {
  /** Catalog template name (matches RouteTemplate.name). */
  family: string;
  /** Deepest signed yard offset reached relative to the carrier — the
   *  same measurement the validator uses. Positive = downfield, negative
   *  = behind LOS (bubble screens). */
  depthYds: number;
  /** Shape distance to the matched template — useful for diagnostics
   *  and for callers that want to expose match confidence. */
  distance: number;
};

/**
 * Infer the closest catalog route family from a hand-drawn path.
 *
 * Returns null when no template is a reasonable approximation, in
 * which case the caller should preserve the path as a custom action.
 *
 * @param pathYds      Waypoints in absolute field yards. The first
 *                     point is treated as the carrier-relative origin
 *                     for shape comparison; in practice it's at or
 *                     near the carrier's position.
 * @param carrierYds   Carrier's absolute field position in yards. Used
 *                     to compute the route's depth (which may differ
 *                     from path-relative depth when the path doesn't
 *                     start exactly at the carrier).
 * @param variant      Sport variant, used to (a) normalize lateral
 *                     coordinates by the variant's field width and
 *                     (b) determine which side of the formation the
 *                     carrier is on for handedness mirroring.
 */
export function inferRouteFamily(
  pathYds: ReadonlyArray<readonly [number, number]>,
  carrierYds: { x: number; y: number },
  variant: SportVariant,
): InferenceResult | null {
  if (pathYds.length < 2) return null;

  const fieldWidthYds = sportProfileForVariant(variant).fieldWidthYds;
  const depthYds = computeDeepestDepth(pathYds, carrierYds);
  const canonical = canonicalize(pathYds, carrierYds, fieldWidthYds);

  let best: { template: RouteTemplate; distance: number } | null = null;
  for (const template of ROUTE_TEMPLATES) {
    if (!constraintsCompatible(template, canonical, depthYds)) continue;
    const distance = shapeDistance(canonical, template.points);
    if (!best || distance < best.distance) {
      best = { template, distance };
    }
  }

  if (!best) return null;
  if (best.distance > MATCH_THRESHOLD) return null;

  return {
    family: best.template.name,
    depthYds: Math.round(depthYds * 10) / 10,
    distance: best.distance,
  };
}

/**
 * Translate the path so the carrier sits at the origin, mirror x so
 * "+x means outside the formation" (matching the catalog convention),
 * and normalize by the variant's field dimensions so shapes can be
 * compared against catalog templates directly.
 *
 * Catalog convention (see routeTemplates.ts):
 *   +x = OUTSIDE (toward sideline relative to formation strength)
 *   −x = INSIDE  (toward middle / where the QB is)
 *
 * Production CoachDiagram coordinate convention is YARDS FROM CENTER:
 * x = 0 is mid-field, +x is toward the right sideline, −x is toward
 * the left sideline (see CoachDiagramPlayer in
 * features/coach-ai/coachDiagramConverter.ts: "x: yards from center").
 * A left-side carrier (carrier.x < 0) has "outside" pointing toward
 * decreasing x, so we flip x. A right-side carrier already has +x =
 * outside, so we keep the sign.
 *
 * If the path's first waypoint is meaningfully offset from the
 * carrier (e.g. the coach started the path at the end of the stem
 * instead of at the player), we prepend the carrier — otherwise the
 * resampled shape comparison would only see the route's tail and miss
 * the stem entirely, producing wrong family matches (5yd Hitch
 * comparing as just "a 1yd settle").
 */
function canonicalize(
  pathYds: ReadonlyArray<readonly [number, number]>,
  carrierYds: { x: number; y: number },
  fieldWidthYds: number,
): Array<{ x: number; y: number }> {
  const PATH_START_TOLERANCE_YDS = 0.5;
  const first = pathYds[0];
  const startsAtCarrier = first
    && Math.hypot(first[0] - carrierYds.x, first[1] - carrierYds.y) < PATH_START_TOLERANCE_YDS;
  const augmented: Array<readonly [number, number]> = startsAtCarrier
    ? Array.from(pathYds)
    : [[carrierYds.x, carrierYds.y] as const, ...pathYds];

  // Production CoachDiagram x is YARDS FROM CENTER. Left-side carrier
  // (x < 0) has "outside" in the −x direction; flip to align with the
  // catalog's "+x = outside" convention.
  const outsideSign = carrierYds.x < 0 ? -1 : 1;
  return augmented.map(([x, y]) => ({
    x: ((x - carrierYds.x) / fieldWidthYds) * outsideSign,
    y: (y - carrierYds.y) / FIELD_LENGTH_YDS,
  }));
}

/**
 * Deepest signed yard offset relative to the carrier. Mirrors the
 * implementation in specParser.ts so the depth fed into the constraint
 * filter is the same value coach Cal will see in the resulting spec.
 */
function computeDeepestDepth(
  pathYds: ReadonlyArray<readonly [number, number]>,
  carrierYds: { x: number; y: number },
): number {
  let deepest = 0;
  for (const [, y] of pathYds) {
    const dy = y - carrierYds.y;
    if (Math.abs(dy) > Math.abs(deepest)) deepest = dy;
  }
  return deepest;
}

/**
 * Filter that decides whether a candidate even makes sense as `template`.
 * Cheap and conservative — its job is to prune templates that are
 * unambiguously wrong (a 13yd-deep candidate isn't a Flat) before the
 * shape distance does the fine-grained discrimination.
 *
 * Side check: the candidate is already in canonical coords (+x =
 * outside), so the rules mirror BreakDirection's invariants:
 *   toward_qb       → final.x ≤  +SLACK   (inside)
 *   toward_sideline → final.x ≥  −SLACK   (outside)
 *   vertical        → |final.x| ≤ 2× SLACK (no lateral commitment)
 */
function constraintsCompatible(
  template: RouteTemplate,
  canonical: ReadonlyArray<{ x: number; y: number }>,
  depthYds: number,
): boolean {
  const { depthRangeYds, side } = template.constraints;
  if (depthYds < depthRangeYds.min - DEPTH_SLACK_YDS) return false;
  if (depthYds > depthRangeYds.max + DEPTH_SLACK_YDS) return false;

  const final = canonical[canonical.length - 1];
  switch (side) {
    case "toward_qb":
      if (final.x > SIDE_SLACK_NORM) return false;
      break;
    case "toward_sideline":
      if (final.x < -SIDE_SLACK_NORM) return false;
      break;
    case "vertical":
      if (Math.abs(final.x) > SIDE_SLACK_NORM * 2) return false;
      break;
    case "varies":
      break;
  }
  return true;
}

/**
 * Mean L2 distance between two paths after resampling each to N_SAMPLES
 * equally-spaced (by arc length) points. The shapes can have different
 * waypoint counts — the resampling normalizes them to a common
 * parameterization before comparison.
 */
function shapeDistance(
  a: ReadonlyArray<{ x: number; y: number }>,
  b: ReadonlyArray<{ x: number; y: number }>,
): number {
  const sa = resample(a, N_SAMPLES);
  const sb = resample(b, N_SAMPLES);
  let sum = 0;
  for (let i = 0; i < N_SAMPLES; i++) {
    const dx = sa[i].x - sb[i].x;
    const dy = sa[i].y - sb[i].y;
    sum += Math.sqrt(dx * dx + dy * dy);
  }
  return sum / N_SAMPLES;
}

/**
 * Resample a polyline at N points spaced equally along its arc length.
 * If the path has zero total length (all waypoints coincident), every
 * sample collapses to the start point — fine, the shape distance will
 * just measure offsets from the start.
 */
function resample(
  points: ReadonlyArray<{ x: number; y: number }>,
  n: number,
): Array<{ x: number; y: number }> {
  if (points.length === 0) {
    return Array.from({ length: n }, () => ({ x: 0, y: 0 }));
  }
  if (points.length === 1) {
    return Array.from({ length: n }, () => ({ ...points[0] }));
  }

  // Cumulative arc length from index 0 to each waypoint.
  const cum: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    cum.push(cum[i - 1] + Math.sqrt(dx * dx + dy * dy));
  }
  const total = cum[cum.length - 1];
  if (total === 0) {
    return Array.from({ length: n }, () => ({ ...points[0] }));
  }

  const out: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < n; i++) {
    const t = (i / (n - 1)) * total;
    // Find the segment whose cumulative length brackets t. Linear scan
    // is fine — n is 24 and waypoints are typically ≤ 5.
    let seg = 0;
    while (seg < points.length - 2 && cum[seg + 1] < t) seg++;
    const segLen = cum[seg + 1] - cum[seg];
    const localT = segLen === 0 ? 0 : (t - cum[seg]) / segLen;
    const p0 = points[seg];
    const p1 = points[seg + 1];
    out.push({
      x: p0.x + (p1.x - p0.x) * localT,
      y: p0.y + (p1.y - p0.y) * localT,
    });
  }
  return out;
}
