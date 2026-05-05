/**
 * Route inference tests — what happens when a coach hand-draws a route
 * (no `route_kind` set) and the parser has to figure out which catalog
 * family it belongs to from geometry alone.
 *
 * The first wave of tests (Phase A) reproduces production bugs and pins
 * down the failure modes of the legacy predicate-based matcher. They
 * fail until `inferRouteFamily` (geometry-similarity vs. the full
 * catalog) replaces the hand-rolled predicate list in specParser.
 *
 * The second wave (Phase B) is the catalog round-trip: every
 * ROUTE_TEMPLATE renders to canonical waypoints, those waypoints are
 * fed back through inference, and the inferred family must match the
 * template's name. This is the structural guarantee that Rule 7 calls
 * for — adding a catalog template AUTOMATICALLY adds inference coverage
 * for it. No new entry can ship without round-tripping cleanly.
 */

import { describe, expect, it } from "vitest";
import { ROUTE_TEMPLATES, instantiateTemplate, type RouteTemplate } from "./routeTemplates";
import { sportProfileForVariant } from "./factory";
import { inferRouteFamily } from "./routeInference";

const FIELD_LENGTH_YDS = 25;
const LOS_Y_NORM = 0.4;

/** Convert a normalized field coord (used by instantiateTemplate, where
 *  x ∈ [0, 1] with 0.5 = mid-field) to YARDS FROM CENTER (the production
 *  CoachDiagram convention, where x = 0 is mid-field). */
function normToYdsFromCenter(
  norm: { x: number; y: number },
  fieldWidthYds: number,
): { x: number; y: number } {
  return {
    x: (norm.x - 0.5) * fieldWidthYds,
    y: norm.y * FIELD_LENGTH_YDS,
  };
}

describe("Phase A — production-bug regressions (Vertigo and friends)", () => {
  // The actual bug from the user's "Vertigo" play. X is on the left side
  // and runs an out-and-up: short stem, hard outside break, then vertical
  // up the sideline. Cal called this a "deep post at 13 yards" — the
  // legacy predicate list fired the Post matcher first because the
  // start-to-end deltas (dy > dx, depth in [10,15]) overlap with Post.
  it("hand-drawn out-and-up from the X (left side, depth ~13yd) infers as Out & Up, NOT Post", () => {
    // Carrier on the LEFT side of the formation. CoachDiagram x is
    // YARDS FROM CENTER (mid-field = 0), so x = −9 puts X 9yd left
    // of the snap. "Outside" for this player is decreasing x.
    const carrier = { x: -9, y: LOS_Y_NORM * FIELD_LENGTH_YDS };
    // Out & Up: vertical 5yd stem, hard 90° out break 5yd toward the
    // LEFT sideline (x decreases), vertical up another 8yd along the
    // sideline. End depth = 13yd.
    const path: [number, number][] = [
      [-9, carrier.y],
      [-9, carrier.y + 5],    // vertical stem
      [-14, carrier.y + 5],   // sharp out toward LEFT sideline
      [-14, carrier.y + 13],  // vertical up the sideline
    ];

    const result = inferRouteFamily(path, carrier, "flag_7v7");

    expect(result, "an out-and-up shape must match a catalog family").not.toBeNull();
    expect(result!.family).toBe("Out & Up");
  });

  // Wheel was the next one in the user's "we already have all these
  // templates but the matcher only knows 9 of them" set. Same trap as
  // Out & Up — the legacy matcher would call this Flat or Out.
  it("hand-drawn wheel from a back (flat release then turn-up the sideline) infers as Wheel", () => {
    // Back lined up on the RIGHT side, 3yd behind the LOS. Yards from
    // center: +6 (right of mid-field). "Outside" is increasing x.
    const carrier = { x: 6, y: LOS_Y_NORM * FIELD_LENGTH_YDS - 3 };
    // Flat release outside, rounded turnup, then vertical along sideline.
    const path: [number, number][] = [
      [6, carrier.y],
      [9, carrier.y + 1],    // flat release
      [12, carrier.y + 4],   // turning up
      [12, carrier.y + 14],  // vertical up the sideline
    ];

    const result = inferRouteFamily(path, carrier, "flag_7v7");

    expect(result).not.toBeNull();
    expect(result!.family).toBe("Wheel");
  });

  // Comeback was being misclassified as Hitch by the old matcher because
  // both have a vertical stem then a settle/turn-back; the depth + side
  // bands overlap until you look at the FULL geometry (comeback breaks
  // OUTWARD, hitch breaks INWARD).
  it("hand-drawn comeback (vertical 12, break back-and-out) infers as Comeback, NOT Hitch", () => {
    // Left-side X at x = −9 (yards from center).
    const carrier = { x: -9, y: LOS_Y_NORM * FIELD_LENGTH_YDS };
    // Vertical 12yd, then a rounded break back to ~10yd depth and 3yd
    // OUTSIDE (toward LEFT sideline → decreasing x).
    const path: [number, number][] = [
      [-9, carrier.y],
      [-9, carrier.y + 12],
      [-12, carrier.y + 10],
    ];

    const result = inferRouteFamily(path, carrier, "flag_7v7");

    expect(result).not.toBeNull();
    expect(result!.family).toBe("Comeback");
  });
});

describe("Phase B — catalog round-trip (Rule 7 enforcement)", () => {
  // For EVERY template in ROUTE_TEMPLATES, render it to waypoints via the
  // production instantiateTemplate path and feed the result back through
  // inference with route_kind STRIPPED. The inferred family must match.
  //
  // This is the structural guarantee that adding a new catalog template
  // automatically gets inference coverage. The legacy predicate-based
  // matcher silently knew about 9 of 26 templates; this test would have
  // caught that the day Out & Up was added.
  //
  // Each template runs on both LEFT and RIGHT sides to catch handedness
  // bugs in the canonicalization.
  describe.each(ROUTE_TEMPLATES.map((t) => [t.name, t] as const))(
    "%s",
    (_name, template: RouteTemplate) => {
      it.each([
        ["left side", { x: 0.2, y: LOS_Y_NORM }],
        ["right side", { x: 0.8, y: LOS_Y_NORM }],
      ])("round-trips its own canonical geometry on %s", (_side, playerNorm) => {
        const fieldWidthYds = sportProfileForVariant("flag_7v7").fieldWidthYds;
        const route = instantiateTemplate(template, playerNorm, "test-player");

        // Convert nodes to YARDS FROM CENTER (production CoachDiagram
        // convention) — that's what the parser hands to inference.
        const carrier = normToYdsFromCenter(route.nodes[0].position, fieldWidthYds);
        const path: [number, number][] = route.nodes.map((n) => {
          const yds = normToYdsFromCenter(n.position, fieldWidthYds);
          return [yds.x, yds.y];
        });

        const result = inferRouteFamily(path, carrier, "flag_7v7");

        expect(
          result,
          `${template.name} (${_side}) failed to infer ANY family from its own canonical geometry`,
        ).not.toBeNull();
        expect(
          result!.family,
          `${template.name} (${_side}) inferred as "${result?.family}" instead of "${template.name}"`,
        ).toBe(template.name);
      });
    },
  );
});

describe("Phase C — fallback behavior for genuinely novel shapes", () => {
  // When a coach draws something that doesn't resemble any catalog
  // route, inference must return null so the parser preserves it as
  // a custom action with the original waypoints. The bar is "no
  // catalog family is a reasonable approximation" — a small
  // perturbation of a real route should still match.
  it("returns null for a clearly-novel shape (oscillating zigzag at depth)", () => {
    // Mid-field carrier (x = 0) — oscillates back and forth across the
    // formation at varying depths. Doesn't resemble any catalog route.
    const carrier = { x: 0, y: LOS_Y_NORM * FIELD_LENGTH_YDS };
    const path: [number, number][] = [
      [0, carrier.y],
      [5, carrier.y + 2],
      [-5, carrier.y + 4],
      [10, carrier.y + 1],
      [-10, carrier.y + 3],
    ];

    const result = inferRouteFamily(path, carrier, "flag_7v7");

    expect(result).toBeNull();
  });

  it("returns null when the path has fewer than 2 waypoints", () => {
    expect(inferRouteFamily([[0, 10]], { x: 0, y: 10 }, "flag_7v7")).toBeNull();
    expect(inferRouteFamily([], { x: 0, y: 10 }, "flag_7v7")).toBeNull();
  });
});
