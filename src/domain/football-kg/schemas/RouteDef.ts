/**
 * RouteDef — a canonical route family (Slant, Drag, Post, Corner, etc.).
 *
 * Route waypoints are stored as RELATIVE offsets from the receiver's
 * starting position (which depends on the formation). The renderer applies
 * the start position when emitting a fence. This decouples route geometry
 * from formation layout — a Drag is a Drag whether @X starts at (-10, 0)
 * (Spread) or (-5, -3) (Diamond).
 *
 * Per-variant overrides exist because field widths differ — a 5v5 25yd-wide
 * field can't accommodate the same wide-side break depth as an 11v11 53yd
 * field for routes like the Out or Corner. Each variant override carries
 * its own waypoint set; the default applies to variants not overridden.
 */

import { z } from "zod";
import { FootballPrimitiveBase, FootballPrimitiveBaseZ } from "./base";
import { SportVariantZ, type SportVariant } from "./types";

/** A single waypoint as [x_offset_yds, y_offset_yds] from the receiver's
 *  starting position. y is depth (positive = downfield); x is lateral. */
export type RouteWaypoint = [number, number];

export const RouteWaypointZ = z.tuple([z.number(), z.number()]);

export type RouteDef = FootballPrimitiveBase & {
  family: "route";
  /** Canonical waypoint set (relative to receiver start). Last waypoint
   *  is the route's finish — depth at finish is what most catalog rules
   *  reference. */
  waypoints: RouteWaypoint[];
  /** Per-variant overrides for variants that need different geometry
   *  (different field widths). Keyed by SportVariant; only listed
   *  variants override — others fall back to `waypoints`. */
  variantWaypoints?: Partial<Record<SportVariant, RouteWaypoint[]>>;
  /** Valid finish-depth range in yards (final waypoint's y from LOS,
   *  AFTER applying to the receiver's start). The validator enforces
   *  that the canonical waypoints produce a finish-depth INSIDE this
   *  range when applied to a representative start position (typically
   *  receiver on the LOS). */
  depthRange: { min: number; max: number };
  /** Whether the route renders with a curve (true) or sharp break (false).
   *  Curls/Corners curve; Slants/Outs are sharp. */
  curve: boolean;
  /** Optional break points — where the route changes direction. Used by
   *  coaching cues ("breaks inside at 5") and by the visual diagram. */
  breaks?: Array<{ at: RouteWaypoint; direction: string }>;
  /** Coaching points specific to this route ("plant the outside foot",
   *  "look the ball in over your outside shoulder"). Auto-included in
   *  Cal's prose when this route is discussed. */
  coachingPoints?: string[];
};

export const RouteDefZ = FootballPrimitiveBaseZ.extend({
  family: z.literal("route"),
  waypoints: z.array(RouteWaypointZ).min(1, "route must have at least one waypoint"),
  variantWaypoints: z.record(SportVariantZ, z.array(RouteWaypointZ)).optional(),
  depthRange: z.object({
    min: z.number(),
    max: z.number(),
  }).refine((r) => r.max >= r.min, "depthRange.max must be >= depthRange.min"),
  curve: z.boolean(),
  breaks: z.array(z.object({
    at: RouteWaypointZ,
    direction: z.string().min(1),
  })).optional(),
  coachingPoints: z.array(z.string().min(1)).optional(),
});
