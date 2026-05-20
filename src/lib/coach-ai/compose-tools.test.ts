/**
 * Goldens for the constructive-composition tools — compose_play,
 * revise_play, compose_defense. These are the 2026-05-02 refactor
 * landing pads (AGENTS.md Rules 8, 9, 11):
 *
 *   - compose_play: ONLY way to produce a catalog-concept play.
 *     Mesh test pins H@2yd / S@6yd staggered depths because that's
 *     the production failure that motivated the refactor.
 *
 *   - revise_play: identity-preserving batched edits. Tests pin
 *     that players[] is byte-equal across mods, that batched mods
 *     apply atomically, and that the sanitizer cleans corrupt
 *     elements at the boundary.
 *
 *   - compose_defense: unified create/overlay tool. Tests pin
 *     standalone shape, overlay shape, and offense-preservation.
 *
 * The image-3 case (oversize zone painting the field) is covered
 * indirectly: compose_defense would reject any catalog entry that
 * produced one because the sanitizer drops it. That's tested in
 * sanitize.test.ts; this file pins the tool boundary.
 */

import { describe, expect, it } from "vitest";
import { BASE_TOOLS } from "./tools";
import { coachDiagramSchema } from "@/features/coach-ai/coachDiagramConverter";

function loadTool(name: string) {
  const tool = BASE_TOOLS.find((t) => t.def.name === name);
  if (!tool) throw new Error(`tool ${name} not in BASE_TOOLS — registration regression`);
  return tool;
}

const TACKLE_CTX = {
  playbookId: null,
  playbookName: null,
  sportVariant: "tackle_11" as const,
  gameLevel: null,
  sanctioningBody: null,
  ageDivision: null,
  playbookSettings: null,
  isAdmin: false,
  canEditPlaybook: false,
  mode: "normal" as const,
  timezone: null,
  playId: null,
  playName: null,
  playFormation: null,
  playDiagramText: null,
  playDiagramRecap: null,
};

function extractFence(resultText: string): Record<string, unknown> {
  const m = /```play\n([\s\S]*?)\n```/.exec(resultText);
  if (!m) throw new Error("no play fence in tool result");
  return JSON.parse(m[1]);
}

describe("compose_play — registered + returns valid fence", () => {
  it("is registered in BASE_TOOLS", () => {
    expect(loadTool("compose_play")).toBeDefined();
  });

  it("Mesh: returns a fence with H@2yd and S@6yd staggered (the regression)", async () => {
    const tool = loadTool("compose_play");
    const r = await tool.handler({ concept: "Mesh" }, TACKLE_CTX);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const fence = extractFence(r.result);
    const routes = fence.routes as Array<{ from: string; path: [number, number][] }>;
    const hRoute = routes.find((rt) => rt.from === "H");
    const sRoute = routes.find((rt) => rt.from === "S");
    expect(hRoute).toBeDefined();
    expect(sRoute).toBeDefined();
    if (!hRoute || !sRoute) return;
    const hMaxY = Math.max(...hRoute.path.map((p) => p[1]));
    const sMaxY = Math.max(...sRoute.path.map((p) => p[1]));
    // Skeleton outputs depth 2 + depth 6 → carrier at y=-1, max y
    // ≈ 1 (under) and ≈ 5 (over). At least 3yd separation.
    expect(Math.abs(sMaxY - hMaxY)).toBeGreaterThanOrEqual(3);
  });

  it("Flood Right: side-flooding concept produces 3 routes ending on the right", async () => {
    const tool = loadTool("compose_play");
    const r = await tool.handler({ concept: "Flood", strength: "right" }, TACKLE_CTX);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const fence = extractFence(r.result);
    expect(fence.title).toMatch(/flood/i);
  });

  it("rejects an unknown concept", async () => {
    const tool = loadTool("compose_play");
    const r = await tool.handler({ concept: "BogusConcept" }, TACKLE_CTX);
    expect(r.ok).toBe(false);
  });

  it("applies overrides on top of the canonical skeleton", async () => {
    const tool = loadTool("compose_play");
    const r = await tool.handler(
      { concept: "Mesh", overrides: [{ player: "S", set_depth_yds: 8, set_non_canonical: true }] },
      TACKLE_CTX,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const fence = extractFence(r.result);
    const routes = fence.routes as Array<{ from: string; path: [number, number][]; nonCanonical?: boolean }>;
    const sRoute = routes.find((rt) => rt.from === "S");
    expect(sRoute).toBeDefined();
    if (!sRoute) return;
    const sMaxY = Math.max(...sRoute.path.map((p) => p[1]));
    // Override pushed S to 8yd (carrier at y=-1, max y ≈ 7).
    expect(sMaxY).toBeGreaterThanOrEqual(6);
    expect(sRoute.nonCanonical).toBe(true);
  });

  it("rejects an override whose depth lands outside the catalog range without set_non_canonical", async () => {
    // Surfaced 2026-05-20: a coach got "Couldn't auto-save 3 plays" because
    // compose_play happily returned fences whose route_kind/path mismatched
    // (e.g. an override set the depth outside the family's canonical
    // range without flagging nonCanonical). Before this gate, the bad
    // fence reached chat and only failed at auto-save — with a truncated
    // error and no path forward for Cal. Now the same validator that
    // runs at save-time fires INSIDE compose_play, so Cal sees the
    // critique in its tool result and can react (different overrides,
    // different concept, or honest fallback). Drag's canonical depth
    // range is [1, 9]; pushing to 30 yds without nonCanonical:true must
    // reject here so it doesn't reach the coach.
    const tool = loadTool("compose_play");
    const r = await tool.handler(
      { concept: "Mesh", overrides: [{ player: "H", set_depth_yds: 30 }] },
      TACKLE_CTX,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/route-assignment validation/i);
    // The full bullet should be present — not truncated at the preamble.
    expect(r.error).toMatch(/H \(declared "Drag"\)/);
    expect(r.error).toMatch(/30 yds/);
  });
});

describe("revise_play — identity-preserving batched edits", () => {
  async function buildMeshFence(): Promise<string> {
    const compose = loadTool("compose_play");
    const r = await compose.handler({ concept: "Mesh" }, TACKLE_CTX);
    if (!r.ok) throw new Error(r.error);
    const m = /```play\n([\s\S]*?)\n```/.exec(r.result);
    if (!m) throw new Error("no fence in compose_play result");
    return m[1];
  }

  it("is registered in BASE_TOOLS", () => {
    expect(loadTool("revise_play")).toBeDefined();
  });

  it("preserves all player IDs and positions across a batched mod", async () => {
    const prior = await buildMeshFence();
    const before = JSON.parse(prior).players as Array<{ id: string; x: number; y: number; team: string }>;
    const tool = loadTool("revise_play");
    const r = await tool.handler(
      { prior_play_fence: prior, mods: [{ player: "S", set_depth_yds: 8, set_non_canonical: true }] },
      TACKLE_CTX,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const after = (extractFence(r.result).players as Array<{ id: string; x: number; y: number; team: string }>);
    expect(after).toHaveLength(before.length);
    for (const a of before) {
      const b = after.find((p) => p.id === a.id)!;
      expect(b).toBeDefined();
      expect(b.x).toBe(a.x);
      expect(b.y).toBe(a.y);
      expect(b.team).toBe(a.team);
    }
  });

  it("applies multiple mods at once (atomic)", async () => {
    const prior = await buildMeshFence();
    const tool = loadTool("revise_play");
    const r = await tool.handler(
      {
        prior_play_fence: prior,
        mods: [
          { player: "H", set_depth_yds: 4 },
          { player: "S", set_depth_yds: 8, set_non_canonical: true },
        ],
      },
      TACKLE_CTX,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const fence = extractFence(r.result);
    const routes = fence.routes as Array<{ from: string; path: [number, number][] }>;
    const h = routes.find((rt) => rt.from === "H")!;
    const s = routes.find((rt) => rt.from === "S")!;
    const hMaxY = Math.max(...h.path.map((p) => p[1]));
    const sMaxY = Math.max(...s.path.map((p) => p[1]));
    // H pushed to 4yd (carrier y=-1, max y ≈ 3); S to 8yd (max y ≈ 7).
    expect(hMaxY).toBeGreaterThanOrEqual(2);
    expect(sMaxY).toBeGreaterThanOrEqual(6);
  });

  it("rejects when ANY mod is invalid (atomic — no partial application)", async () => {
    const prior = await buildMeshFence();
    const tool = loadTool("revise_play");
    const r = await tool.handler(
      {
        prior_play_fence: prior,
        mods: [
          { player: "S", set_depth_yds: 6 },         // valid
          { player: "GHOST", set_depth_yds: 5 },     // invalid carrier
        ],
      },
      TACKLE_CTX,
    );
    expect(r.ok).toBe(false);
  });

  it("rejects malformed prior_play_fence", async () => {
    const tool = loadTool("revise_play");
    const r = await tool.handler(
      { prior_play_fence: "not json", mods: [{ player: "X", set_depth_yds: 5 }] },
      TACKLE_CTX,
    );
    expect(r.ok).toBe(false);
  });
});

describe("compose_defense — unified create/overlay", () => {
  it("is registered in BASE_TOOLS", () => {
    expect(loadTool("compose_defense")).toBeDefined();
  });

  it("standalone (no on_play): returns a defense-only fence", async () => {
    const tool = loadTool("compose_defense");
    const r = await tool.handler({ front: "4-3 Over", coverage: "Cover 3" }, TACKLE_CTX);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const fence = extractFence(r.result);
    const players = fence.players as Array<{ team: string }>;
    expect(players.every((p) => p.team === "D")).toBe(true);
  });

  it("with on_play: overlays defense, preserves offense byte-for-byte", async () => {
    // Build an offense via compose_play, then overlay defense.
    const compose = loadTool("compose_play");
    const playR = await compose.handler({ concept: "Mesh" }, TACKLE_CTX);
    expect(playR.ok).toBe(true);
    if (!playR.ok) return;
    const playFenceJson = (/```play\n([\s\S]*?)\n```/.exec(playR.result)!)[1];
    const offenseBefore = (JSON.parse(playFenceJson).players as Array<{ id: string; x: number; y: number; team: string }>)
      .filter((p) => p.team !== "D");

    const tool = loadTool("compose_defense");
    const r = await tool.handler(
      { front: "4-3 Over", coverage: "Cover 3", on_play: playFenceJson },
      TACKLE_CTX,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const fence = extractFence(r.result);
    const offenseAfter = (fence.players as Array<{ id: string; x: number; y: number; team: string }>)
      .filter((p) => p.team !== "D");
    expect(offenseAfter).toHaveLength(offenseBefore.length);
    for (const a of offenseBefore) {
      const b = offenseAfter.find((p) => p.id === a.id)!;
      expect(b).toBeDefined();
      expect(b.x).toBe(a.x);
      expect(b.y).toBe(a.y);
    }
    // Defenders were added.
    const defenders = (fence.players as Array<{ team: string }>).filter((p) => p.team === "D");
    expect(defenders.length).toBeGreaterThan(0);
  });

  it("zones never exceed field bounds (sanitizer integration)", async () => {
    const tool = loadTool("compose_defense");
    const r = await tool.handler({ front: "4-3 Over", coverage: "Cover 3" }, TACKLE_CTX);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const fence = extractFence(r.result);
    const zones = (fence.zones as Array<{ size: [number, number] }> | undefined) ?? [];
    for (const z of zones) {
      expect(z.size[0]).toBeLessThanOrEqual(53); // tackle_11 width
      expect(z.size[1]).toBeLessThanOrEqual(30);
    }
  });

  it("rejects when front/coverage are missing", async () => {
    const tool = loadTool("compose_defense");
    const r = await tool.handler({ front: "" }, TACKLE_CTX);
    expect(r.ok).toBe(false);
  });

  it("REJECTS overlay when sanitizer would drop an offense route (Rule 11)", async () => {
    // Rule 11 says compose_defense must byte-preserve offense when overlaying.
    // The sanitizer can silently drop offense routes (e.g. empty path) or
    // clamp offense players (e.g. NaN coords) when running over the merged
    // fence. Those mutations are the failure mode behind the reported bug
    // ("offensive play swapped when adding defense").
    //
    // The guard: if the sanitizer would have changed any offense element,
    // compose_defense fails with a clear error rather than emitting a
    // silently-mutated fence.
    const corruptOffenseFence = JSON.stringify({
      title: "Synthetic — offense with one corrupt route",
      variant: "tackle_11",
      players: [
        { id: "QB", x: 0, y: -1, team: "O" },
        { id: "X", x: -20, y: 0, team: "O" },
        { id: "Y", x: 20, y: 0, team: "O" },
        { id: "H", x: -8, y: 0, team: "O" },
        { id: "Z", x: 12, y: 0, team: "O" },
      ],
      routes: [
        // Valid offense route.
        { from: "X", path: [[-20, 8]], tip: "arrow" },
        // Corrupt offense route — sanitizer will drop empty paths.
        // Without the byte-preserve guard, compose_defense silently
        // emits a fence with this route missing.
        { from: "Y", path: [], tip: "arrow" },
      ],
    });
    const tool = loadTool("compose_defense");
    const r = await tool.handler(
      { front: "4-3 Over", coverage: "Cover 3", on_play: corruptOffenseFence },
      TACKLE_CTX,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/byte-preserve|offense|Rule 11/i);
  });

  it("emits read_and_react defender routes when overlaying a known concept (Fix 3)", async () => {
    // Compose Flood Right, then overlay Cover 3. The reactor catalog
    // (defensiveReactors.ts) has T11_COVER3_VS_FLOOD with SL → @H follow_to_flat,
    // SS → @Y jump_route, CB → @Z carry_vertical. compose_defense should emit
    // defender routes with route_kind="react_*" so the diagram teaches the read.
    const compose = loadTool("compose_play");
    const playR = await compose.handler({ concept: "Flood", strength: "right" }, TACKLE_CTX);
    expect(playR.ok).toBe(true);
    if (!playR.ok) return;
    const priorFenceJson = (/```play\n([\s\S]*?)\n```/.exec(playR.result)!)[1];

    const tool = loadTool("compose_defense");
    const r = await tool.handler(
      { front: "4-3 Over", coverage: "Cover 3", on_play: priorFenceJson, strength: "right" },
      TACKLE_CTX,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const fence = extractFence(r.result);
    const routes = (fence.routes as Array<{ from: string; route_kind?: string; startDelaySec?: number }>) ?? [];
    const reactorRoutes = routes.filter((rt) => typeof rt.route_kind === "string" && rt.route_kind.startsWith("react_"));
    expect(reactorRoutes.length, "expected at least one defender reactor route").toBeGreaterThan(0);
    // Every reactor route should carry startDelaySec so the renderer
    // animates the reaction (not move-at-snap).
    for (const rt of reactorRoutes) {
      expect(rt.startDelaySec).toBeGreaterThan(0);
    }
    // The tool result should mention the reactor pattern by name so Cal
    // includes the cues in prose.
    expect(r.result).toMatch(/Reactor pattern.*Cover 3 vs Flood/);
  });

  it("skips reactor routes for an unknown concept (defense stays static)", async () => {
    // Use a hand-built fence with a title the reactor catalog doesn't know.
    // Players are spaced so the sanitizer doesn't nudge anyone (avoids
    // false-positive byte-preserve violations unrelated to this test).
    const unknownFence = JSON.stringify({
      title: "Custom Drop-Back Concept",
      variant: "tackle_11",
      players: [
        { id: "QB", x: 0, y: -3, team: "O" },
        { id: "X", x: -18, y: 0, team: "O" },
        { id: "Y", x: 7, y: 0, team: "O" },
        { id: "Z", x: 18, y: 0, team: "O" },
        { id: "H", x: -10, y: 0, team: "O" },
        { id: "C", x: 0, y: 0, team: "O" },
        { id: "B", x: -2, y: -3, team: "O" },
        { id: "OL1", x: -3, y: 0, team: "O" },
        { id: "OL2", x: 3, y: 0, team: "O" },
        { id: "OL3", x: -5, y: 0, team: "O" },
        { id: "OL4", x: 5, y: 0, team: "O" },
      ],
      routes: [
        { from: "X", path: [[-18, 8]], tip: "arrow" },
      ],
    });
    const tool = loadTool("compose_defense");
    const r = await tool.handler(
      { front: "4-3 Over", coverage: "Cover 3", on_play: unknownFence },
      TACKLE_CTX,
    );
    expect(r.ok, r.ok ? undefined : r.error).toBe(true);
    if (!r.ok) return;
    const fence = extractFence(r.result);
    const routes = (fence.routes as Array<{ route_kind?: string }>) ?? [];
    const reactorRoutes = routes.filter((rt) => typeof rt.route_kind === "string" && rt.route_kind.startsWith("react_"));
    expect(reactorRoutes.length, "no reactor routes for unknown concept").toBe(0);
    expect(r.result).not.toMatch(/Reactor pattern/);
  });

  it("preserves every offense ROUTE byte-for-byte in a clean overlay", async () => {
    // Companion to the existing "preserves offense players" test —
    // routes deserve the same guarantee. compose_play's Mesh output is
    // clean, so a healthy overlay must not drop or clamp any of its routes.
    const compose = loadTool("compose_play");
    const playR = await compose.handler({ concept: "Mesh" }, TACKLE_CTX);
    expect(playR.ok).toBe(true);
    if (!playR.ok) return;
    const priorFenceJson = (/```play\n([\s\S]*?)\n```/.exec(playR.result)!)[1];
    const prior = JSON.parse(priorFenceJson);
    const offensePlayerIds = new Set(
      (prior.players as Array<{ id: string; team: string }>)
        .filter((p) => p.team !== "D")
        .map((p) => p.id),
    );
    const offenseRoutesBefore = (prior.routes as Array<{ from: string; path: number[][] }>)
      .filter((r) => offensePlayerIds.has(r.from));
    expect(offenseRoutesBefore.length).toBeGreaterThan(0);

    const tool = loadTool("compose_defense");
    const r = await tool.handler(
      { front: "4-3 Over", coverage: "Cover 3", on_play: priorFenceJson },
      TACKLE_CTX,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const fence = extractFence(r.result);
    const offenseRoutesAfter = (fence.routes as Array<{ from: string; path: number[][] }>)
      .filter((rt) => offensePlayerIds.has(rt.from));

    expect(offenseRoutesAfter).toHaveLength(offenseRoutesBefore.length);
    for (const before of offenseRoutesBefore) {
      const after = offenseRoutesAfter.find((rt) => rt.from === before.from);
      expect(after).toBeDefined();
      expect(after!.path).toEqual(before.path);
    }
  });
});

describe("Tool fence outputs round-trip through coachDiagramSchema", () => {
  // 2026-05-02: a coach hit the chat UI rendering blank with prose
  // visible — the diagram fence had a `direction` field on a route,
  // which the strict-parse client converter rejected, leaving the
  // diagram blank. This test pins that every constructive-tool
  // output parses cleanly through the same schema the client uses.

  it("compose_play (Mesh) output parses through coachDiagramSchema", async () => {
    const tool = loadTool("compose_play");
    const r = await tool.handler({ concept: "Mesh" }, TACKLE_CTX);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const fence = extractFence(r.result);
    const parsed = coachDiagramSchema.safeParse(fence);
    expect(parsed.success, parsed.success ? undefined : JSON.stringify(parsed.error.issues, null, 2)).toBe(true);
  });

  it("compose_play (Flood Right with overrides) output parses through coachDiagramSchema", async () => {
    // Flood's skeleton emits `direction` on B's flat. compose_play
    // serializes the rendered fence — the schema must accept any
    // field the renderer or applyRouteMod can produce.
    const tool = loadTool("compose_play");
    const r = await tool.handler(
      {
        concept: "Flood",
        strength: "right",
        overrides: [{ player: "S", set_depth_yds: 10 }],
      },
      TACKLE_CTX,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const fence = extractFence(r.result);
    const parsed = coachDiagramSchema.safeParse(fence);
    expect(parsed.success, parsed.success ? undefined : JSON.stringify(parsed.error.issues, null, 2)).toBe(true);
  });

  it("revise_play with set_direction produces a fence that round-trips", async () => {
    // The exact failure mode that broke the UI: revise_play sets
    // `direction: "left"` on a route, which writes the field into
    // the rendered fence. Schema must accept it.
    const compose = loadTool("compose_play");
    const playR = await compose.handler({ concept: "Flood", strength: "right" }, TACKLE_CTX);
    if (!playR.ok) throw new Error("compose_play failed");
    const priorFence = (/```play\n([\s\S]*?)\n```/.exec(playR.result)!)[1];

    const revise = loadTool("revise_play");
    const r = await revise.handler(
      { prior_play_fence: priorFence, mods: [{ player: "B", set_direction: "left" }] },
      TACKLE_CTX,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const fence = extractFence(r.result);
    const parsed = coachDiagramSchema.safeParse(fence);
    expect(parsed.success, parsed.success ? undefined : JSON.stringify(parsed.error.issues, null, 2)).toBe(true);
    // And: the direction field was actually persisted.
    const bRoute = (fence.routes as Array<{ from: string; direction?: string }>).find((rt) => rt.from === "B");
    expect(bRoute?.direction).toBe("left");
  });

  it("compose_defense (overlay on play) output parses through coachDiagramSchema", async () => {
    const compose = loadTool("compose_play");
    const playR = await compose.handler({ concept: "Flood", strength: "right" }, TACKLE_CTX);
    if (!playR.ok) throw new Error("compose_play failed");
    const priorFence = (/```play\n([\s\S]*?)\n```/.exec(playR.result)!)[1];

    const defenseTool = loadTool("compose_defense");
    const r = await defenseTool.handler(
      { front: "4-3 Over", coverage: "Cover 3", on_play: priorFence },
      TACKLE_CTX,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const fence = extractFence(r.result);
    const parsed = coachDiagramSchema.safeParse(fence);
    expect(parsed.success, parsed.success ? undefined : JSON.stringify(parsed.error.issues, null, 2)).toBe(true);
  });
});

describe("BASE_TOOLS registration — refactor regression", () => {
  it("includes all the new constructive tools", () => {
    const names = BASE_TOOLS.map((t) => t.def.name);
    expect(names).toContain("compose_play");
    expect(names).toContain("revise_play");
    expect(names).toContain("compose_defense");
  });

  it("KEEPS the still-supported legacy tools registered (backward-compat for existing chats)", () => {
    const names = BASE_TOOLS.map((t) => t.def.name);
    expect(names).toContain("get_concept_skeleton");
    expect(names).toContain("modify_play_route");
    expect(names).toContain("place_defense");
  });

  it("REMOVED add_defense_to_play (compose_defense is the single overlay path now)", () => {
    const names = BASE_TOOLS.map((t) => t.def.name);
    expect(names).not.toContain("add_defense_to_play");
  });
});
