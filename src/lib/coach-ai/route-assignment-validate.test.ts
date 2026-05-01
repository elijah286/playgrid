/**
 * Golden tests for validateRouteAssignments.
 *
 * Each case is a minimal CoachDiagram with one or two routes that exercises
 * a specific decision in the validator. New failure modes from coaches
 * should be added here as a NEGATIVE case (currently buggy → expected
 * after fix), then the validator hardened until the test passes. Once a
 * test passes, it cannot regress (CI gate).
 *
 * Why goldens vs property tests: route validation is a small set of
 * discrete rules — easier to enumerate the failure modes by example than
 * to invent generators that cover them.
 */

import { describe, expect, it } from "vitest";
import { validateRouteAssignments } from "./route-assignment-validate";
import type { CoachDiagram } from "@/features/coach-ai/coachDiagramConverter";

/** Helper: minimal diagram with a single carrier + route. */
function single(
  carrier: { id: string; x: number; y: number },
  route: { path: [number, number][]; route_kind?: string; curve?: boolean },
): CoachDiagram {
  return {
    players: [
      { id: "Q", x: 0, y: -3, team: "O" },
      { ...carrier, team: "O" },
    ],
    routes: [{ from: carrier.id, ...route }],
  };
}

describe("validateRouteAssignments — depth constraints", () => {
  it("rejects 12-yard slant (the screenshot bug)", () => {
    const result = validateRouteAssignments(
      single({ id: "X", x: -13, y: 0 }, { path: [[-13, 3], [-7, 12]], route_kind: "slant" }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return; // type narrow
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].carrier).toBe("X");
    expect(result.errors[0].declaredKind).toBe("Slant");
    expect(result.errors[0].message).toMatch(/cannot be 12/);
    expect(result.errors[0].message).toMatch(/\[3, 7\]/);
    // Suggests alternatives at that depth + side.
    expect(result.errors[0].message.toLowerCase()).toMatch(/dig|post|skinny post|curl/);
  });

  it("accepts a canonical 5.8-yard slant", () => {
    const result = validateRouteAssignments(
      single({ id: "X", x: -13, y: 0 }, { path: [[-13, 3], [-7, 5.8]], route_kind: "slant" }),
    );
    expect(result.ok).toBe(true);
  });

  it("accepts a 7-yard slant (top of range)", () => {
    const result = validateRouteAssignments(
      single({ id: "X", x: -13, y: 0 }, { path: [[-13, 3], [-7, 7]], route_kind: "slant" }),
    );
    expect(result.ok).toBe(true);
  });

  it("accepts a 7.4-yard slant (within 0.5yd tolerance)", () => {
    const result = validateRouteAssignments(
      single({ id: "X", x: -13, y: 0 }, { path: [[-13, 3], [-7, 7.4]], route_kind: "slant" }),
    );
    expect(result.ok).toBe(true);
  });

  it("rejects an 8-yard slant (clearly outside tolerance)", () => {
    const result = validateRouteAssignments(
      single({ id: "X", x: -13, y: 0 }, { path: [[-13, 3], [-7, 8]], route_kind: "slant" }),
    );
    expect(result.ok).toBe(false);
  });

  it("accepts a 12-yard dig (depth that suits 'dig' family)", () => {
    const result = validateRouteAssignments(
      single({ id: "X", x: -13, y: 0 }, { path: [[-13, 12], [-3, 12]], route_kind: "dig" }),
    );
    expect(result.ok).toBe(true);
  });

  it("accepts a negative-depth bubble screen (slot receiver to the sideline)", () => {
    // Carrier in the slot at x=-7 so a bubble has 8 yds of room to the
    // left sideline. Bubble template breaks OUTSIDE (toward the sideline)
    // → final x more negative than carrier x.
    const result = validateRouteAssignments(
      single({ id: "S", x: -7, y: 0 }, { path: [[-9, -1], [-13, -0.5]], route_kind: "bubble" }),
    );
    expect(result.ok).toBe(true);
  });
});

describe("validateRouteAssignments — side constraints", () => {
  it("rejects a post breaking outside (left-side X)", () => {
    const result = validateRouteAssignments(
      single({ id: "X", x: -13, y: 0 }, { path: [[-13, 11], [-19, 15]], route_kind: "post" }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0].message).toMatch(/INSIDE|toward the QB/);
    expect(result.errors[0].message.toLowerCase()).toContain("corner");
  });

  it("accepts a post breaking inside (left-side X)", () => {
    const result = validateRouteAssignments(
      single({ id: "X", x: -13, y: 0 }, { path: [[-13, 11], [-7, 15]], route_kind: "post" }),
    );
    expect(result.ok).toBe(true);
  });

  it("rejects an out breaking inside (right-side Z)", () => {
    const result = validateRouteAssignments(
      single({ id: "Z", x: 13, y: 0 }, { path: [[13, 10], [3, 10]], route_kind: "out" }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0].message).toMatch(/OUTSIDE|toward the sideline/);
  });

  it("accepts a right-side out breaking outside (mirroring works)", () => {
    const result = validateRouteAssignments(
      single({ id: "Z", x: 13, y: 0 }, { path: [[13, 10], [19, 10]], route_kind: "out" }),
    );
    expect(result.ok).toBe(true);
  });

  it("rejects a 'go' route with too much lateral commit", () => {
    const result = validateRouteAssignments(
      single({ id: "X", x: -13, y: 0 }, { path: [[-13, 5], [-8, 15]], route_kind: "go" }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0].message).toMatch(/vertically/);
  });

  it("accepts a 'go' that drifts <1.5yd laterally", () => {
    const result = validateRouteAssignments(
      single({ id: "X", x: -13, y: 0 }, { path: [[-13, 5], [-12, 15]], route_kind: "go" }),
    );
    expect(result.ok).toBe(true);
  });
});

describe("validateRouteAssignments — kind resolution", () => {
  it("rejects an unknown route_kind with the catalog list", () => {
    const result = validateRouteAssignments(
      single({ id: "X", x: -13, y: 0 }, { path: [[-13, 5]], route_kind: "uppercut" }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0].message).toMatch(/doesn't match any catalog/);
    expect(result.errors[0].message).toMatch(/slant|post|dig/);
  });

  it("resolves aliases (Fly → Go)", () => {
    const result = validateRouteAssignments(
      single({ id: "X", x: -13, y: 0 }, { path: [[-13, 5], [-13, 15]], route_kind: "fly" }),
    );
    expect(result.ok).toBe(true);
  });

  it("is case-insensitive on route_kind", () => {
    const result = validateRouteAssignments(
      single({ id: "X", x: -13, y: 0 }, { path: [[-13, 3], [-7, 5.8]], route_kind: "SLANT" }),
    );
    expect(result.ok).toBe(true);
  });
});

describe("validateRouteAssignments — pass-through behavior", () => {
  it("passes routes without route_kind unchecked (existing snapshot path handles them)", () => {
    const result = validateRouteAssignments(
      // No route_kind — even a wildly impossible path is a pass-through.
      single({ id: "X", x: -13, y: 0 }, { path: [[-13, 99]] }),
    );
    expect(result.ok).toBe(true);
  });

  it("passes empty diagrams", () => {
    const result = validateRouteAssignments({ players: [], routes: [] });
    expect(result.ok).toBe(true);
  });

  it("ignores routes with unknown carrier id (covered by other validator)", () => {
    const result = validateRouteAssignments({
      players: [{ id: "Q", x: 0, y: -3, team: "O" }],
      routes: [{ from: "PHANTOM", path: [[0, 99]], route_kind: "slant" }],
    });
    expect(result.ok).toBe(true);
  });
});

describe("validateRouteAssignments — multiple routes", () => {
  it("flags only the bad route in a diagram with mixed routes", () => {
    const result = validateRouteAssignments({
      players: [
        { id: "Q", x: 0, y: -3, team: "O" },
        { id: "X", x: -13, y: 0, team: "O" },
        { id: "Z", x: 13, y: 0, team: "O" },
      ],
      routes: [
        // Good slant.
        { from: "X", path: [[-13, 3], [-7, 5.8]], route_kind: "slant" },
        // Bad post (12 yards is fine for post; this one breaks outside).
        { from: "Z", path: [[13, 11], [19, 15]], route_kind: "post" },
      ],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].carrier).toBe("Z");
  });
});
