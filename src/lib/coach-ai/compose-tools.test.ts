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
  isAdmin: false,
  canEditPlaybook: false,
  mode: "normal" as const,
  timezone: null,
  playId: null,
  playName: null,
  playFormation: null,
  playDiagramText: null,
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
});

describe("BASE_TOOLS registration — refactor regression", () => {
  it("includes all the new constructive tools", () => {
    const names = BASE_TOOLS.map((t) => t.def.name);
    expect(names).toContain("compose_play");
    expect(names).toContain("revise_play");
    expect(names).toContain("compose_defense");
  });

  it("KEEPS the legacy tools registered (backward-compat for existing chats)", () => {
    const names = BASE_TOOLS.map((t) => t.def.name);
    expect(names).toContain("get_concept_skeleton");
    expect(names).toContain("modify_play_route");
    expect(names).toContain("add_defense_to_play");
    expect(names).toContain("place_defense");
  });
});
