/**
 * RouteDef — a canonical route family (Slant, Drag, Post, Corner, etc.).
 *
 * Schema mirrors the legacy `RouteTemplate` shape in src/domain/play/
 * routeTemplates.ts so Phase 1b migration is byte-equal. The legacy
 * file will become an auto-generated artifact in Phase 1c.
 *
 * KEY DESIGN NOTES:
 *
 * Normalized waypoints: `points` use NORMALIZED field coordinates
 * (x in [-0.5, 0.5] relative to field width, y in [0, 1] relative to
 * the 25-yard field-length window). This is what the existing renderer
 * consumes. Coaches DON'T author in normalized form — that's why every
 * route template's comment shows the yard equivalents inline. Yard-based
 * validation lives in `constraints.depthRangeYds`.
 *
 * Directional flag: when `directional: true`, x-offsets get sign-flipped
 * based on the receiver's field position (a receiver on the left side of
 * the formation sees positive-x = toward outside, which is LEFT in
 * absolute coords; on the right side, positive-x = RIGHT). This means
 * routes can be authored ONCE for "outside" and mirror automatically.
 *
 * Break invariants: `breakDir` must match the geometry of `points`. The
 * legacy module asserts this at import; the KG validator enforces the
 * same on load.
 */

import { z } from "zod";
import { FootballPrimitiveBase, FootballPrimitiveBaseZ } from "./base";

/** Coarse shape of the route's break. Surfaces in coaching prose and
 *  drives the renderer's segment-style choice. */
export type BreakStyle = "none" | "sharp" | "rounded" | "multi";

export const BreakStyleZ = z.enum(["none", "sharp", "rounded", "multi"]);

/** Direction the route's break/finish goes RELATIVE TO THE QB.
 *  Constrains route geometry — "toward_qb" routes finish at template-x ≤ 0
 *  (inside), "toward_sideline" at template-x ≥ 0 (outside), "vertical" at
 *  |template-x| ≤ 0.10 (no lateral commit). "varies" reserved for
 *  config-dependent routes (none today). */
export type BreakDirection =
  | "toward_qb"
  | "toward_sideline"
  | "vertical"
  | "varies";

export const BreakDirectionZ = z.enum([
  "toward_qb",
  "toward_sideline",
  "vertical",
  "varies",
]);

/** Per-segment shape ("straight" or "curve"). Length should be points.length - 1.
 *  Defaults to all-"straight" if omitted; set explicitly for any route with
 *  a curved segment so the renderer draws the right shape. */
export type SegmentShape = "straight" | "curve";

export const SegmentShapeZ = z.enum(["straight", "curve"]);

/** Hard constraints for a route — checked by the diagram validator
 *  to reject impossible combinations ("12-yard slant" violates Slant's
 *  [3, 7] depth range; "slant outside" violates Slant's "toward_qb" side). */
export type RouteConstraints = {
  /** Inclusive yard range for the route's deepest waypoint, measured from
   *  the receiver's start. This is the CANONICAL band — where the
   *  skeleton/Cal should aim (the renderer defaults to its midpoint). */
  depthRangeYds: { min: number; max: number };
  /** Required final-waypoint side relative to the receiver's start. */
  side: BreakDirection;
  /** Per-route slack (yds) the validator allows beyond [min, max] before
   *  rejecting a route_kind/geometry mismatch. Defaults to
   *  DEPTH_TOLERANCE_YDS (0.5) when unset. Set HIGHER for routes with
   *  natural depth latitude (deep verticals, settle/zone routes) so a
   *  play a yard outside the canonical band still saves; leave at the
   *  default for sharp timing routes (Slant, Quick Out) where an extra
   *  yard would blur the route's identity into a different family. */
  toleranceYds?: number;
};

export const RouteConstraintsZ = z.object({
  depthRangeYds: z.object({
    min: z.number(),
    max: z.number(),
  }).refine((r) => r.max >= r.min, "depthRangeYds.max must be >= min"),
  side: BreakDirectionZ,
  toleranceYds: z.number().positive().optional(),
});

/** A waypoint in NORMALIZED field coordinates (relative to receiver's start).
 *  x in [-0.5, 0.5] (lateral), y in [0, 1] (downfield). The renderer scales
 *  these by the variant's field dimensions at draw time. */
export type RouteWaypoint = { x: number; y: number };

export const RouteWaypointZ = z.object({
  x: z.number(),
  y: z.number(),
});

export type RouteDef = FootballPrimitiveBase & {
  family: "route";
  /** Normalized waypoint offsets from the receiver's start. First waypoint
   *  is typically (0, 0). */
  points: RouteWaypoint[];
  /** Per-segment shapes. Length = points.length - 1. */
  shapes?: SegmentShape[];
  /** When true, x-offsets are sign-flipped based on the receiver's field
   *  position so the route can be authored once for "outside" and mirror
   *  automatically. */
  directional?: boolean;
  /** Coarse break-shape label. */
  breakStyle: BreakStyle;
  /** Required direction of the route's finish relative to the QB.
   *  Enforced against the geometry by the load-time validator. */
  breakDir: BreakDirection;
  /** Yard-based constraints checked by the diagram validator. */
  constraints: RouteConstraints;
  /** rag_documents subtopic (e.g. "route_slant"). Drives the
   *  KB-generator output filename + lookup key. */
  kbSubtopic: string;
};

export const RouteDefZ = FootballPrimitiveBaseZ.extend({
  family: z.literal("route"),
  points: z.array(RouteWaypointZ).min(2, "route must have at least 2 waypoints (start + finish)"),
  shapes: z.array(SegmentShapeZ).optional(),
  directional: z.boolean().optional(),
  breakStyle: BreakStyleZ,
  breakDir: BreakDirectionZ,
  constraints: RouteConstraintsZ,
  kbSubtopic: z.string().regex(
    /^route_[a-z][a-z0-9_]*$/,
    "kbSubtopic must start with 'route_' and be snake_case",
  ),
}).refine(
  (r) => !r.shapes || r.shapes.length === r.points.length - 1,
  "shapes length must equal points.length - 1 when provided",
);

/**
 * Verify the route's geometry matches its declared breakDir. Used by
 * load-time validators to catch mismatches like "curl that breaks toward
 * the sideline" — the original module asserts this at import; the KG
 * validator runs the same check.
 */
export function checkRouteBreakDirInvariant(route: RouteDef): string | null {
  const finalPoint = route.points[route.points.length - 1];
  if (!finalPoint) return null;
  const finalX = finalPoint.x;
  switch (route.breakDir) {
    case "toward_qb":
      if (finalX > 0) return `breakDir="toward_qb" but final point x=${finalX} is positive (outside)`;
      return null;
    case "toward_sideline":
      if (finalX < 0) return `breakDir="toward_sideline" but final point x=${finalX} is negative (inside)`;
      return null;
    case "vertical":
      if (Math.abs(finalX) > 0.10) return `breakDir="vertical" but final point |x|=${Math.abs(finalX)} > 0.10`;
      return null;
    case "varies":
      return null;
  }
}
