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

  it("ACCEPTS a 10-yard slant when nonCanonical: true (explicit coach override)", () => {
    // Coach asked for "10-yard slant" — Cal honors with nonCanonical:true.
    // Validator skips depth check; renders the route.
    const result = validateRouteAssignments(
      single(
        { id: "X", x: -13, y: 0 },
        { path: [[-13, 3], [-7, 10]], route_kind: "slant", nonCanonical: true },
      ),
    );
    expect(result.ok).toBe(true);
  });

  it("ACCEPTS an 8-yard drag when nonCanonical: true", () => {
    const result = validateRouteAssignments(
      single(
        { id: "H", x: -8, y: 0 },
        { path: [[12, 8]], route_kind: "Drag", nonCanonical: true },
      ),
    );
    expect(result.ok).toBe(true);
  });

  it("STILL REJECTS a 12-yard slant when nonCanonical is unset (Cal hallucination)", () => {
    // The override flag is OPT-IN. Without it, the catalog rejects —
    // so the safety net for Cal-authored mistakes stays intact.
    const result = validateRouteAssignments(
      single({ id: "X", x: -13, y: 0 }, { path: [[-13, 3], [-7, 12]], route_kind: "slant" }),
    );
    expect(result.ok).toBe(false);
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

// 2026-05-03 regression: a coach told Cal "this is 5v5 NFL flag" and Cal
// generated multiple plays with the QB running an 18-yard go route. The
// existing validator only checked routes with route_kind set, and never
// looked at *who* the carrier was — so a QB-as-carrier route slipped
// through. Both screenshots showed the QB at y=-3 with a path waypoint at
// (0, 12.8) — a 15.8-yard "go" the catalog should never have allowed.
//
// Per AGENTS.md Rule 5 (make impossible, then validate), the right place
// for this gate is the validator: every write path (create_play,
// update_play, revise_play, compose_play overrides) and the chat-time
// validator route through validateRouteAssignments, so one rule covers
// every surface.
describe("validateRouteAssignments — flag QB rule", () => {
  it("rejects a QB go route in flag_5v5 (the screenshot bug)", () => {
    const result = validateRouteAssignments({
      variant: "flag_5v5",
      players: [
        { id: "Q", x: 0, y: -3, team: "O" },
        { id: "C", x: 0, y: 0, team: "O" },
      ],
      routes: [{ from: "Q", path: [[0, 12.8]], route_kind: "go" }],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0].carrier).toBe("Q");
    expect(result.errors[0].message).toMatch(/QB|quarterback/i);
  });

  it("rejects a QB downfield route in flag_5v5 even without route_kind set", () => {
    // Cal sometimes omits route_kind. The rule must fire on the carrier
    // identity + path, not on the declared kind.
    const result = validateRouteAssignments({
      variant: "flag_5v5",
      players: [{ id: "Q", x: 0, y: -3, team: "O" }, { id: "C", x: 0, y: 0, team: "O" }],
      routes: [{ from: "Q", path: [[0, 12.8]] }],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0].carrier).toBe("Q");
  });

  it("rejects a QB go route in flag_7v7", () => {
    const result = validateRouteAssignments({
      variant: "flag_7v7",
      players: [{ id: "Q", x: 0, y: -5, team: "O" }, { id: "C", x: 0, y: 0, team: "O" }],
      routes: [{ from: "Q", path: [[0, 15]], route_kind: "go" }],
    });
    expect(result.ok).toBe(false);
  });

  it("recognizes 'QB' label too, not just 'Q'", () => {
    const result = validateRouteAssignments({
      variant: "flag_5v5",
      players: [{ id: "QB", x: 0, y: -3, team: "O" }, { id: "C", x: 0, y: 0, team: "O" }],
      routes: [{ from: "QB", path: [[0, 12]] }],
    });
    expect(result.ok).toBe(false);
  });

  it("ALLOWS a QB route in tackle_11 (QB sneak / draw is legal in tackle)", () => {
    const result = validateRouteAssignments({
      variant: "tackle_11",
      players: [{ id: "Q", x: 0, y: -5, team: "O" }, { id: "C", x: 0, y: 0, team: "O" }],
      routes: [{ from: "Q", path: [[0, 1]] }],
    });
    expect(result.ok).toBe(true);
  });

  it("ALLOWS a non-QB downfield route in flag_5v5 (the QB rule is QB-specific)", () => {
    const result = validateRouteAssignments({
      variant: "flag_5v5",
      players: [
        { id: "Q", x: 0, y: -3, team: "O" },
        { id: "Z", x: 10, y: 0, team: "O" },
      ],
      routes: [{ from: "Z", path: [[10, 5], [10, 15]], route_kind: "go" }],
    });
    expect(result.ok).toBe(true);
  });

  it("falls through to OK when variant is unset (legacy diagrams without variant pass)", () => {
    // Some legacy tool calls don't tag variant on the diagram. We don't
    // want to reject those across the board — variant context is a
    // precondition for the flag rule.
    const result = validateRouteAssignments({
      players: [{ id: "Q", x: 0, y: -3, team: "O" }, { id: "C", x: 0, y: 0, team: "O" }],
      routes: [{ from: "Q", path: [[0, 12]] }],
    });
    expect(result.ok).toBe(true);
  });

  it("respects context.variant override (chat-time path passes variant separately)", () => {
    // The chat-time validator passes variant via context, not via diagram.variant.
    const result = validateRouteAssignments(
      {
        players: [{ id: "Q", x: 0, y: -3, team: "O" }, { id: "C", x: 0, y: 0, team: "O" }],
        routes: [{ from: "Q", path: [[0, 12]] }],
      },
      { variant: "flag_5v5" },
    );
    expect(result.ok).toBe(false);
  });
});

// 2026-05-03 second regression on the same screenshot: the coach told Cal
// "10 year old, can't throw more than 10 yards reliably" and Cal's prose
// said "all plays stay under your 10-yard max-throw window" — but the
// generated diagrams had 18-yard go routes for C, Z, and F. When the
// coach surfaces a max throw depth for the session, the validator should
// gate against it on every write so the prose can't drift from the
// geometry. Cal opts in by passing maxRouteDepthYds; coaches still get
// the QB rule above for free regardless.
describe("validateRouteAssignments — coach-stated max throw depth", () => {
  it("rejects a route deeper than the coach-stated max throw depth", () => {
    const result = validateRouteAssignments(
      {
        variant: "flag_5v5",
        players: [
          { id: "Q", x: 0, y: -3, team: "O" },
          { id: "Z", x: 10, y: 0, team: "O" },
        ],
        routes: [{ from: "Z", path: [[10, 5], [10, 18]], route_kind: "go" }],
      },
      { maxRouteDepthYds: 10 },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0].carrier).toBe("Z");
    expect(result.errors[0].message).toMatch(/max.*throw|10\s*yd|10-yard/i);
  });

  it("accepts a route at or below the coach-stated max", () => {
    const result = validateRouteAssignments(
      {
        variant: "flag_5v5",
        players: [
          { id: "Q", x: 0, y: -3, team: "O" },
          { id: "Z", x: 10, y: 0, team: "O" },
        ],
        // 10-yard go is at the cap (within tolerance).
        routes: [{ from: "Z", path: [[10, 5], [10, 10]], route_kind: "go" }],
      },
      { maxRouteDepthYds: 10 },
    );
    expect(result.ok).toBe(true);
  });

  it("respects nonCanonical: true as the explicit-coach-override escape hatch", () => {
    // When the coach later says "actually throw the corner 14yds on this
    // one", Cal sets nonCanonical: true on that one route. Same escape
    // hatch the depth-range catalog check uses.
    const result = validateRouteAssignments(
      {
        variant: "flag_5v5",
        players: [
          { id: "Q", x: 0, y: -3, team: "O" },
          { id: "Z", x: 10, y: 0, team: "O" },
        ],
        routes: [{ from: "Z", path: [[10, 14]], nonCanonical: true }],
      },
      { maxRouteDepthYds: 10 },
    );
    expect(result.ok).toBe(true);
  });

  it("doesn't apply the max-depth gate when maxRouteDepthYds is unset", () => {
    const result = validateRouteAssignments({
      variant: "flag_5v5",
      players: [
        { id: "Q", x: 0, y: -3, team: "O" },
        { id: "Z", x: 10, y: 0, team: "O" },
      ],
      // 18yd post is fine in the catalog; no max-depth context = no extra gate.
      routes: [{ from: "Z", path: [[10, 18]], route_kind: "post" }],
    });
    expect(result.ok).toBe(true);
  });

  it("max-depth gate ignores BEHIND-LOS movement (bubble screens go negative)", () => {
    const result = validateRouteAssignments(
      {
        variant: "flag_5v5",
        players: [
          { id: "Q", x: 0, y: -3, team: "O" },
          { id: "Z", x: 10, y: 0, team: "O" },
        ],
        // Negative depth (bubble) — well outside the cap if you take abs(),
        // but max throw depth is about FORWARD distance.
        routes: [{ from: "Z", path: [[15, -2]] }],
      },
      { maxRouteDepthYds: 5 },
    );
    expect(result.ok).toBe(true);
  });
});

describe("validateRouteAssignments — Layer 4: forward-pass legality (illegal backwards routes)", () => {
  /**
   * Regression: 2026-05-04 — Coach Cal generated "Spread Doubles —
   * Hitch/Flat Combo" for flag_5v5 via `create_play` with HAND-AUTHORED
   * custom waypoints. When mirroring the Hitch from the right side (Z)
   * to the left side (X), Cal correctly negated x but ALSO negated y,
   * placing X's "catch point" at y=-4.5 — 4.5 yards BEHIND the LOS.
   *
   * The save-time validators didn't catch it because:
   * - Layer 3 (catalog route_kind) only fires when route_kind is set,
   *   and Cal's hand-authored routes have no route_kind.
   * - Layer 2 (max throw depth) is about how DEEP forward, not how
   *   deep backward.
   *
   * Layer 4 closes this gap: any offensive route whose deepest forward
   * waypoint is more than 4 yards behind the LOS gets rejected. The
   * threshold (-4) matches the catalog's most aggressive bubble screen,
   * so legitimate bubbles still pass.
   */
  it("REJECTS the actual saved bug: X's hand-authored route at y=-4.5, -3.5", () => {
    // X starts at the verified saved position (yard space): x=-10, y=-1
    // (slightly behind LOS in 5v5 doubles formation).
    // The saved waypoints are Cal's sign error: both behind start.
    const result = validateRouteAssignments({
      variant: "flag_5v5",
      players: [
        { id: "Q", x: 0, y: -5, team: "O" },
        { id: "X", x: -10, y: -1, team: "O" },
      ],
      routes: [
        {
          from: "X",
          path: [
            [-9.5, -4.5],
            [-13.5, -3.5],
          ],
          curve: true,
        },
      ],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].carrier).toBe("X");
    expect(result.errors[0].message).toMatch(/behind the LOS/i);
  });

  it("ACCEPTS a legitimate bubble screen (catch ~1yd behind LOS)", () => {
    // Bubble template: receiver retreats 2-3yds for the apex, arcs
    // forward to catch ~1yd behind the LOS. Last waypoint y=-1 is
    // well inside the -4 threshold.
    const result = validateRouteAssignments({
      variant: "flag_5v5",
      players: [
        { id: "Q", x: 0, y: -5, team: "O" },
        { id: "Z", x: 10, y: 0, team: "O" },
      ],
      routes: [
        {
          from: "Z",
          path: [
            [10.5, -2.5],
            [12, -1],
          ],
          curve: true,
        },
      ],
    });
    expect(result.ok).toBe(true);
  });

  it("ACCEPTS a forward route (Hitch settling at 4yds upfield)", () => {
    // Z's correct Hitch from the same play (the one that rendered
    // properly). max y = 5 — well past the LOS.
    const result = validateRouteAssignments({
      variant: "flag_5v5",
      players: [
        { id: "Q", x: 0, y: -5, team: "O" },
        { id: "Z", x: 10, y: 0, team: "O" },
      ],
      routes: [
        {
          from: "Z",
          path: [
            [10, 5],
            [9.5, 4],
          ],
          curve: true,
        },
      ],
    });
    expect(result.ok).toBe(true);
  });

  it("ALLOWS a backwards route when nonCanonical: true is set (coach-acknowledged screen)", () => {
    // Same geometry as the X bug, but the coach explicitly opted in.
    const result = validateRouteAssignments({
      variant: "flag_5v5",
      players: [
        { id: "Q", x: 0, y: -5, team: "O" },
        { id: "X", x: -10, y: -1, team: "O" },
      ],
      routes: [
        {
          from: "X",
          path: [
            [-9.5, -4.5],
            [-13.5, -3.5],
          ],
          curve: true,
          nonCanonical: true,
        },
      ],
    });
    expect(result.ok).toBe(true);
  });

  it("REJECTS a deeply backwards route even with route_kind set (e.g. Cal labels it 'hitch' but draws it backward)", () => {
    // The bug surfaces even when Cal sets route_kind correctly —
    // Layer 3 rejects on depth/side mismatch BUT only for route_kind=
    // routes. Layer 4 catches the geometry regardless.
    const result = validateRouteAssignments({
      variant: "flag_5v5",
      players: [
        { id: "Q", x: 0, y: -5, team: "O" },
        { id: "X", x: -10, y: -1, team: "O" },
      ],
      routes: [
        {
          from: "X",
          path: [
            [-9.5, -4.5],
            [-13.5, -3.5],
          ],
          curve: true,
          route_kind: "hitch",
        },
      ],
    });
    expect(result.ok).toBe(false);
  });
});
