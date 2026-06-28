/**
 * Tool-level guard for the user's reported scenario (2026-06-28): "add a
 * defensive formation onto an offensive play". When the agent loop injects the
 * anchored offensive play as `on_play` (see resolveDefenseOverlayBaseline +
 * autoCorrectPriorFence), compose_defense must:
 *   1. preserve every offense player byte-for-byte (Rule 11),
 *   2. preserve the offense routes,
 *   3. add the defenders (team "D"),
 * regardless of whether the coach phrased it as "add a Cover 3" (overlay) vs
 * the working-around path of building the defense first.
 *
 * This is the layer where "offense vanished after adding a defense" would
 * surface as a tool failure; the resolution-layer test
 * (compose-defense-overlay-baseline.test.ts) proves the anchored play is what
 * gets injected as on_play in the first place.
 */

import { describe, expect, it } from "vitest";
import { BASE_TOOLS, type ToolContext } from "./tools";

function loadTool(name: string) {
  const tool = BASE_TOOLS.find((t) => t.def.name === name);
  if (!tool) throw new Error(`tool ${name} not in BASE_TOOLS — registration regression`);
  return tool;
}

const CTX: ToolContext = {
  playbookId: null,
  playbookName: null,
  sportVariant: "flag_7v7",
  gameLevel: null,
  sanctioningBody: null,
  ageDivision: null,
  playbookSettings: null,
  isAdmin: false,
  canEditPlaybook: false,
  mode: "normal",
  timezone: null,
  playId: null,
  playName: null,
  playFormation: null,
  playDiagramText: null,
  playDiagramRecap: null,
  threadId: null,
  userId: null,
};

/** Canonical flag_7v7 Mesh Right offense — the "anchored play" the coach has
 *  open. Roster {X, Z, S, H, B, C, QB}; two crossers (X drag, H drag) plus a
 *  corner from Z. This is exactly the JSON the harness injects as on_play. */
function meshRightOffenseFence(): string {
  return JSON.stringify({
    title: "Mesh Right",
    variant: "flag_7v7",
    players: [
      { id: "QB", x: 0, y: -3, team: "O" },
      { id: "C", x: 0, y: 0, team: "O" },
      { id: "X", x: -12, y: 0, team: "O" },
      { id: "H", x: -6, y: 0, team: "O" },
      { id: "S", x: 6, y: 0, team: "O" },
      { id: "Z", x: 12, y: 0, team: "O" },
      { id: "B", x: 2, y: -2, team: "O" },
    ],
    routes: [
      { from: "X", path: [[8, 4]], route_kind: "drag" },
      { from: "H", path: [[-8, 4]], route_kind: "drag" },
      { from: "Z", path: [[10, 10], [14, 18]], route_kind: "corner" },
    ],
  });
}

type FencePlayer = { id: string; x: number; y: number; team?: string };
type FenceRoute = { from: string; path: number[][]; route_kind?: string };
type Fence = { players: FencePlayer[]; routes?: FenceRoute[] };

function extractFence(result: string): Fence {
  const m = /```play\s*\n([\s\S]*?)\n```/.exec(result);
  if (!m) throw new Error(`no play fence in result:\n${result}`);
  return JSON.parse(m[1].trim()) as Fence;
}

function offenseOf(f: Fence): FencePlayer[] {
  return f.players.filter((p) => p.team !== "D").sort((a, b) => a.id.localeCompare(b.id));
}

describe("compose_defense overlay onto an offensive play (the reported scenario)", () => {
  it("preserves the offense byte-for-byte and adds defenders", async () => {
    const tool = loadTool("compose_defense");
    const onPlay = meshRightOffenseFence();
    const before = offenseOf(JSON.parse(onPlay) as Fence);

    const r = await tool.handler({ front: "7v7 Zone", coverage: "Cover 3", on_play: onPlay }, CTX);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const out = extractFence(r.result);
    const after = offenseOf(out);

    // Offense survived unchanged — same ids, same coordinates, same count.
    expect(after).toEqual(before);
    // Defenders were actually added.
    expect(out.players.some((p) => p.team === "D")).toBe(true);
  });

  it("preserves the offense routes (the crossers don't get dropped)", async () => {
    const tool = loadTool("compose_defense");
    const onPlay = meshRightOffenseFence();
    const offenseRouteFroms = (JSON.parse(onPlay) as Fence).routes!.map((rt) => rt.from).sort();

    const r = await tool.handler({ front: "7v7 Zone", coverage: "Cover 2", on_play: onPlay }, CTX);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const out = extractFence(r.result);
    const survivingOffenseRouteFroms = (out.routes ?? [])
      .filter((rt) => ["X", "H", "Z"].includes(rt.from))
      .map((rt) => rt.from)
      .sort();
    expect(survivingOffenseRouteFroms).toEqual(offenseRouteFroms);
  });

  it("man coverage overlay still preserves the offense", async () => {
    // Man coverage omits zones; the offense-preservation guarantee must hold
    // on that path too (different branch in the handler).
    const tool = loadTool("compose_defense");
    const onPlay = meshRightOffenseFence();
    const before = offenseOf(JSON.parse(onPlay) as Fence);

    const r = await tool.handler({ front: "7v7 Man", coverage: "Cover 1", on_play: onPlay }, CTX);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const out = extractFence(r.result);
    expect(offenseOf(out)).toEqual(before);
    expect(out.players.some((p) => p.team === "D")).toBe(true);
  });
});
