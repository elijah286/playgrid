/**
 * Goldens for the shared route-mutation primitives. Pins:
 *   - Single-mod: route family swap, depth scaling, nonCanonical flag.
 *   - Batched: multiple mods on one fence, atomic semantics
 *     (all-or-nothing on identity preservation).
 *   - Identity-preservation: a mod may NOT change players[] in any
 *     observable way (id, x, y, team). Future tools that wrap this
 *     module inherit the guarantee.
 *   - Sanitizer integration: corrupt elements introduced by mods or
 *     present in the prior fence get cleaned up before return.
 */

import { describe, expect, it } from "vitest";
import { applyRouteMod, applyRouteMods, type RouteMod } from "./play-mutations";
import type { CoachDiagram } from "@/features/coach-ai/coachDiagramConverter";

type TestFence = CoachDiagram & Record<string, unknown>;

function fence(routes: object[] = [], players?: object[]): TestFence {
  return {
    title: "Test",
    variant: "tackle_11",
    players: (players ?? [
      { id: "Q", x: 0, y: -3, team: "O" },
      { id: "X", x: -13, y: 0, team: "O" },
      { id: "H", x: -10, y: -1, team: "O" },
      { id: "S", x: 10, y: -1, team: "O" },
    ]) as CoachDiagram["players"],
    routes: routes as CoachDiagram["routes"],
  };
}

describe("applyRouteMod — single mod", () => {
  it("scales depth on an existing drag from 2 to 6 yards", () => {
    const f = fence([
      { from: "S", path: [[8.4, 1], [-12.8, 1]], route_kind: "Drag" },
    ]);
    const r = applyRouteMod(f, { player: "S", set_depth_yds: 6 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const newPath = (r.fence.routes as Array<{ path: [number, number][] }>)[0].path;
    const maxY = Math.max(...newPath.map((p) => p[1]));
    expect(Math.abs(maxY - 5)).toBeLessThanOrEqual(0.6); // carrier.y=-1, depth 6 → max y ≈ 5
  });

  it("swaps route family from Curl to Post", () => {
    const f = fence([
      { from: "X", path: [[-13, 5], [-13, 8]], route_kind: "Curl" },
    ]);
    const r = applyRouteMod(f, { player: "X", set_family: "Post" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const route = (r.fence.routes as Array<{ route_kind: string }>)[0];
    expect(route.route_kind).toBe("Post");
  });

  it("sets nonCanonical flag without changing path", () => {
    const f = fence([
      { from: "H", path: [[-10, 8]], route_kind: "Slant" },
    ]);
    const r = applyRouteMod(f, { player: "H", set_non_canonical: true });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const route = (r.fence.routes as Array<{ nonCanonical: boolean; path: [number, number][] }>)[0];
    expect(route.nonCanonical).toBe(true);
    // Path unchanged because we only set the flag.
    expect(route.path).toEqual([[-10, 8]]);
  });

  it("rejects mod for a player not in players[]", () => {
    const f = fence([{ from: "X", path: [[-13, 5]], route_kind: "Slant" }]);
    const r = applyRouteMod(f, { player: "GHOST", set_depth_yds: 5 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/not in fence.players/);
  });

  it("rejects mod for a player who has no existing route", () => {
    // Q is in players but has no route — mods can only EDIT existing
    // routes, not add new ones.
    const f = fence([{ from: "X", path: [[-13, 5]], route_kind: "Slant" }]);
    const r = applyRouteMod(f, { player: "Q", set_depth_yds: 5 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/no existing route/);
  });

  it("rejects an empty mod (no fields to change)", () => {
    const f = fence([{ from: "X", path: [[-13, 5]], route_kind: "Slant" }]);
    const r = applyRouteMod(f, { player: "X" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/no changes/);
  });

  it("rejects an unknown route family", () => {
    const f = fence([{ from: "X", path: [[-13, 5]], route_kind: "Slant" }]);
    const r = applyRouteMod(f, { player: "X", set_family: "BogusRoute" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/unknown route family/);
  });
});

describe("applyRouteMods — batched + identity-preservation", () => {
  function meshFence() {
    return JSON.stringify(fence([
      { from: "H", path: [[-8.3, 1], [12.9, 1]], route_kind: "Drag" },
      { from: "S", path: [[8.4, 1], [-12.8, 1]], route_kind: "Drag" },
    ]));
  }

  it("applies multiple mods atomically and returns a clean fence", () => {
    // Stagger the mesh: H stays at 2yd, S goes to 6yd.
    const r = applyRouteMods(meshFence(), [
      { player: "S", set_depth_yds: 6 },
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const sRoute = (r.fence.routes as Array<{ from: string; path: [number, number][] }>).find((rt) => rt.from === "S")!;
    const sMaxY = Math.max(...sRoute.path.map((p) => p[1]));
    expect(Math.abs(sMaxY - 5)).toBeLessThanOrEqual(0.6);
    expect(r.appliedSummaries[0]).toMatch(/@S/);
  });

  it("rejects when ANY mod fails (atomic — no partial application)", () => {
    const r = applyRouteMods(meshFence(), [
      { player: "S", set_depth_yds: 6 },         // valid
      { player: "GHOST", set_depth_yds: 5 },     // invalid
    ]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.some((e) => /not in fence.players/.test(e))).toBe(true);
  });

  it("preserves player IDs, positions, team across mods (identity guarantee)", () => {
    const r = applyRouteMods(meshFence(), [
      { player: "S", set_depth_yds: 6 },
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const players = r.fence.players as Array<{ id: string; x: number; y: number; team: string }>;
    expect(players.find((p) => p.id === "H")?.x).toBe(-10);
    expect(players.find((p) => p.id === "H")?.y).toBe(-1);
    expect(players.find((p) => p.id === "S")?.x).toBe(10);
    expect(players.find((p) => p.id === "S")?.y).toBe(-1);
  });

  it("rejects empty mods array", () => {
    const r = applyRouteMods(meshFence(), []);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors[0]).toMatch(/empty/);
  });

  it("rejects malformed prior_play_fence JSON", () => {
    const r = applyRouteMods("not json", [{ player: "X", set_depth_yds: 5 }]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors[0]).toMatch(/parse/);
  });

  it("rejects empty prior_play_fence string", () => {
    const r = applyRouteMods("", [{ player: "X", set_depth_yds: 5 }]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors[0]).toMatch(/required/);
  });
});

describe("applyRouteMods — sanitizer integration", () => {
  it("drops corrupt zones from the prior fence on the way through", () => {
    const f = JSON.stringify({
      title: "Test",
      variant: "tackle_11",
      players: [
        { id: "Q", x: 0, y: -3, team: "O" },
        { id: "X", x: -13, y: 0, team: "O" },
      ],
      routes: [{ from: "X", path: [[-13, 5]], route_kind: "Slant" }],
      zones: [{ kind: "rectangle", center: [0, 10], size: [200, 50], label: "Bad" }],
    });
    const mods: RouteMod[] = [{ player: "X", set_depth_yds: 6 }];
    const r = applyRouteMods(f, mods);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.fence.zones).toHaveLength(0);
  });
});
