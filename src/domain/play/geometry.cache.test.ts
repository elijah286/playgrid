import { describe, expect, it } from "vitest";
import type { Route } from "./types";
import { routeToRenderedSegments } from "./geometry";
import { flattenRoute } from "./animation";
import { applyCommand } from "./reducer";
import { createEmptyPlayDocument } from "./factory";

// Regression coverage for the reference-keyed geometry caches added to fix the
// editor/playbook INP tail. Two guarantees matter:
//   1. Caching is CORRECT — a distinct route object never gets another route's
//      cached geometry, and degenerate routes still return null.
//   2. The reducer keeps route references stable for routes that didn't change,
//      which is the invariant that makes the cache effective during a drag.

function makeRoute(id: string, carrierPlayerId: string, yTip: number): Route {
  return {
    id,
    carrierPlayerId,
    semantic: null,
    nodes: [
      { id: `${id}-n0`, position: { x: 0.5, y: 0.6 } },
      { id: `${id}-n1`, position: { x: 0.5, y: yTip } },
    ],
    segments: [
      {
        id: `${id}-s0`,
        fromNodeId: `${id}-n0`,
        toNodeId: `${id}-n1`,
        shape: "straight",
        strokePattern: "solid",
        controlOffset: null,
      },
    ],
    style: { stroke: "#000", strokeWidth: 1.8 },
  };
}

describe("routeToRenderedSegments cache", () => {
  it("returns the identical reference for repeated calls on the same route object", () => {
    const route = makeRoute("r1", "p1", 0.3);
    const first = routeToRenderedSegments(route);
    const second = routeToRenderedSegments(route);
    expect(second).toBe(first); // cache hit — same array reference
  });

  it("computes distinct output for a different route object (no cross-object collision)", () => {
    const a = makeRoute("r1", "p1", 0.3);
    const b = makeRoute("r2", "p2", 0.1); // different tip → different path `d`
    const da = routeToRenderedSegments(a)[0]?.d;
    const db = routeToRenderedSegments(b)[0]?.d;
    expect(da).toBeTruthy();
    expect(db).toBeTruthy();
    expect(db).not.toBe(da);
  });
});

describe("flattenRoute cache", () => {
  it("returns the identical reference for repeated calls on the same route", () => {
    const route = makeRoute("r1", "p1", 0.3);
    const first = flattenRoute(route);
    const second = flattenRoute(route);
    expect(first).not.toBeNull();
    expect(second).toBe(first);
  });

  it("caches a null result for a degenerate route without recomputing/throwing", () => {
    const degenerate: Route = {
      ...makeRoute("r-deg", "p1", 0.3),
      nodes: [{ id: "only", position: { x: 0.5, y: 0.5 } }],
      segments: [],
    };
    expect(flattenRoute(degenerate)).toBeNull();
    expect(flattenRoute(degenerate)).toBeNull();
  });
});

describe("reducer preserves route references (cache effectiveness invariant)", () => {
  it("player.move leaves non-carrier routes referentially unchanged and rebuilds only the carrier's route", () => {
    const base = createEmptyPlayDocument();
    const [p0, p1] = base.layers.players;
    const withRoutes = applyCommand(
      applyCommand(base, { type: "route.add", route: makeRoute("ra", p0.id, 0.3) }),
      { type: "route.add", route: makeRoute("rb", p1.id, 0.3) },
    );
    const routeA = withRoutes.layers.routes.find((r) => r.id === "ra")!;
    const routeB = withRoutes.layers.routes.find((r) => r.id === "rb")!;

    const moved = applyCommand(withRoutes, {
      type: "player.move",
      playerId: p0.id,
      position: { x: 0.2, y: 0.4 },
    });
    const routeAAfter = moved.layers.routes.find((r) => r.id === "ra")!;
    const routeBAfter = moved.layers.routes.find((r) => r.id === "rb")!;

    // p0 carries route "ra" → new reference; "rb" is untouched → same reference.
    expect(routeAAfter).not.toBe(routeA);
    expect(routeBAfter).toBe(routeB);
  });
});
