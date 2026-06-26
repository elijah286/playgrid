/**
 * Goldens for the flip_play tool (AGENTS.md Rules 8/9/12 — every new tool
 * lands with regression tests in the same commit).
 *
 * flip_play mirrors an existing play left↔right in one of three modes:
 *   - full      mirror whole play (players + routes)
 *   - routes    mirror routes only, players stay
 *   - formation mirror player positions only, routes keep their direction
 *
 * The geometric core is unit-tested in domain/play/mirror.test.ts; this
 * file pins the TOOL boundary: registration, fence in/out, mode handling,
 * identity (count/ids/teams preserved), and rejection cases.
 */

import { describe, expect, it } from "vitest";
import { BASE_TOOLS } from "./tools";
import { coachDiagramSchema } from "@/features/coach-ai/coachDiagramConverter";

function loadTool(name: string) {
  const tool = BASE_TOOLS.find((t) => t.def.name === name);
  if (!tool) throw new Error(`tool ${name} not in BASE_TOOLS — registration regression`);
  return tool;
}

const FLAG_CTX = {
  playbookId: null,
  playbookName: null,
  sportVariant: "flag_7v7" as const,
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
  threadId: null,
  userId: null,
};

function extractFence(resultText: string): Record<string, unknown> {
  const m = /```play\n([\s\S]*?)\n```/.exec(resultText);
  if (!m) throw new Error("no play fence in tool result");
  return JSON.parse(m[1]);
}

const FLOOD_RIGHT = JSON.stringify({
  title: "Flood Right",
  variant: "flag_7v7",
  focus: "O",
  players: [
    { id: "Q", x: 0, y: -3, team: "O" },
    { id: "C", x: 0, y: 0, team: "O" },
    { id: "X", x: -12, y: 0, team: "O" },
    { id: "Z", x: 12, y: 0, team: "O" },
    { id: "S", x: 8, y: 0, team: "O" },
    { id: "H", x: -6, y: 0, team: "O" },
    { id: "B", x: 2, y: -5, team: "O" },
  ],
  routes: [
    { from: "Z", path: [[12, 8], [16, 14]], route_kind: "Corner", direction: "right" },
    { from: "S", path: [[8, 6], [13, 6]], route_kind: "Out", direction: "right" },
    { from: "X", path: [[-12, 16]], route_kind: "Go" },
  ],
});

describe("flip_play — registration + boundary", () => {
  it("is registered in BASE_TOOLS", () => {
    expect(loadTool("flip_play")).toBeDefined();
  });

  it("rejects a missing/invalid mode", async () => {
    const tool = loadTool("flip_play");
    const r = await tool.handler({ prior_play_fence: FLOOD_RIGHT, mode: "sideways" }, FLAG_CTX);
    expect(r.ok).toBe(false);
  });

  it("rejects an empty prior fence", async () => {
    const tool = loadTool("flip_play");
    const r = await tool.handler({ prior_play_fence: "", mode: "full" }, FLAG_CTX);
    expect(r.ok).toBe(false);
  });

  it("rejects a fence with no players", async () => {
    const tool = loadTool("flip_play");
    const r = await tool.handler({ prior_play_fence: JSON.stringify({ players: [] }), mode: "full" }, FLAG_CTX);
    expect(r.ok).toBe(false);
  });
});

describe("flip_play — full mode", () => {
  it("returns a schema-valid fence with every player x negated and routes mirrored", async () => {
    const tool = loadTool("flip_play");
    const r = await tool.handler({ prior_play_fence: FLOOD_RIGHT, mode: "full" }, FLAG_CTX);
    expect(r.ok, r.ok ? undefined : r.error).toBe(true);
    if (!r.ok) return;
    const fence = extractFence(r.result);
    // Schema-valid (would render in the editor).
    expect(() => coachDiagramSchema.parse(fence)).not.toThrow();
    const players = fence.players as Array<{ id: string; x: number }>;
    expect(players.find((p) => p.id === "X")!.x).toBe(12);
    expect(players.find((p) => p.id === "Z")!.x).toBe(-12);
    expect(players.find((p) => p.id === "S")!.x).toBe(-8);
    // Family preserved (full mirror keeps inside/outside), direction swapped.
    const routes = fence.routes as Array<{ from: string; route_kind?: string; direction?: string }>;
    const z = routes.find((rt) => rt.from === "Z")!;
    expect(z.route_kind).toBe("Corner");
    expect(z.direction).toBe("left");
  });
});

describe("flip_play — routes mode", () => {
  it("keeps player positions byte-identical", async () => {
    const tool = loadTool("flip_play");
    const r = await tool.handler({ prior_play_fence: FLOOD_RIGHT, mode: "routes" }, FLAG_CTX);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const fence = extractFence(r.result);
    const before = (JSON.parse(FLOOD_RIGHT).players as Array<{ id: string; x: number; y: number }>);
    const after = fence.players as Array<{ id: string; x: number; y: number }>;
    for (const p of before) {
      const q = after.find((a) => a.id === p.id)!;
      expect([q.x, q.y]).toEqual([p.x, p.y]);
    }
  });
});

describe("flip_play — identity preservation across all modes", () => {
  for (const mode of ["full", "routes", "formation"] as const) {
    it(`${mode}: player count, ids, and teams are unchanged`, async () => {
      const tool = loadTool("flip_play");
      const r = await tool.handler({ prior_play_fence: FLOOD_RIGHT, mode }, FLAG_CTX);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const fence = extractFence(r.result);
      const before = JSON.parse(FLOOD_RIGHT).players as Array<{ id: string; team: string }>;
      const after = fence.players as Array<{ id: string; team: string }>;
      expect(after.length).toBe(before.length);
      expect(after.map((p) => p.id).sort()).toEqual(before.map((p) => p.id).sort());
      expect(after.map((p) => `${p.id}:${p.team}`).sort()).toEqual(before.map((p) => `${p.id}:${p.team}`).sort());
    });
  }
});
