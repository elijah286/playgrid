/**
 * propose_save_defense_play — proposal-tool goldens.
 *
 * The tool MUST be registered, MUST emit a `save-defense-proposal` fence
 * with all required fields, and MUST validate that the fence contains
 * both offense and defense (rejecting defense-only fences as a guard
 * against the chip linking to nothing).
 */

import { describe, expect, it, vi } from "vitest";
import { BASE_TOOLS } from "./tools";
import type { ToolContext } from "./tools";

vi.mock("./play-tools", async () => {
  const actual = await vi.importActual<typeof import("./play-tools")>("./play-tools");
  return {
    ...actual,
    // Stub the I/O wrapper so the test doesn't require Supabase.
    resolvePlayId: vi.fn(async (rawInput: string) => {
      if (rawInput === "noah-uuid" || rawInput === "play 14" || rawInput === "Noah") {
        return { ok: true, id: "noah-uuid", name: "Noah" } as const;
      }
      return { ok: false, error: `No play matched "${rawInput}"` } as const;
    }),
  };
});

function loadTool(name: string) {
  const tool = BASE_TOOLS.find((t) => t.def.name === name);
  if (!tool) throw new Error(`tool ${name} not in BASE_TOOLS`);
  return tool;
}

const CTX: ToolContext = {
  playbookId: "pb-1",
  playbookName: "Test",
  sportVariant: "tackle_11",
  gameLevel: null,
  sanctioningBody: null,
  ageDivision: null,
  playbookSettings: null,
  isAdmin: false,
  canEditPlaybook: true,
  mode: "normal",
  timezone: null,
  playId: null,
  playName: null,
  playFormation: null,
  playDiagramText: null,
  playDiagramRecap: null,
};

const OVERLAY_FENCE = JSON.stringify({
  title: "Flood Right vs Cover 3",
  variant: "tackle_11",
  players: [
    { id: "QB", x: 0, y: -3, team: "O" },
    { id: "X", x: -18, y: 0, team: "O" },
    { id: "CB", x: -16, y: 6, team: "D" },
  ],
  routes: [],
});

describe("propose_save_defense_play", () => {
  it("is registered in BASE_TOOLS", () => {
    expect(loadTool("propose_save_defense_play")).toBeDefined();
  });

  it("emits a save-defense-proposal fence with all required fields", async () => {
    const tool = loadTool("propose_save_defense_play");
    const r = await tool.handler(
      {
        defense_fence: OVERLAY_FENCE,
        offensive_play_ref: "noah-uuid",
        suggested_name: "Cover 3 vs Noah",
        change_summary: "Overlayed Cover 3 with deep-third carry on the verticals.",
      },
      CTX,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const fenceMatch = /```save-defense-proposal\n([\s\S]+?)\n```/.exec(r.result);
    expect(fenceMatch).not.toBeNull();
    const parsed = JSON.parse(fenceMatch![1]);
    expect(parsed.proposalId).toMatch(/[a-f0-9-]+/);
    expect(parsed.defenseFenceJson).toBe(OVERLAY_FENCE);
    expect(parsed.offensivePlayId).toBe("noah-uuid");
    expect(parsed.offensivePlayName).toBe("Noah");
    expect(parsed.suggestedName).toBe("Cover 3 vs Noah");
    expect(parsed.changeSummary).toMatch(/Cover 3/);
  });

  it("rejects when the fence is defense-only (no offense)", async () => {
    const defenseOnlyFence = JSON.stringify({
      title: "Cover 3",
      variant: "tackle_11",
      players: [{ id: "CB", x: -16, y: 6, team: "D" }],
      routes: [],
    });
    const tool = loadTool("propose_save_defense_play");
    const r = await tool.handler(
      {
        defense_fence: defenseOnlyFence,
        offensive_play_ref: "noah-uuid",
        suggested_name: "Cover 3 vs Noah",
        change_summary: "test",
      },
      CTX,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/overlay/i);
  });

  it("rejects when the offensive play ref doesn't resolve", async () => {
    const tool = loadTool("propose_save_defense_play");
    const r = await tool.handler(
      {
        defense_fence: OVERLAY_FENCE,
        offensive_play_ref: "no-such-play",
        suggested_name: "Cover 3 vs ?",
        change_summary: "test",
      },
      CTX,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/Could not resolve/);
  });

  it("rejects when missing required args", async () => {
    const tool = loadTool("propose_save_defense_play");
    const r = await tool.handler(
      { defense_fence: "", offensive_play_ref: "", suggested_name: "", change_summary: "" },
      CTX,
    );
    expect(r.ok).toBe(false);
  });

  it("rejects when the playbook isn't editable", async () => {
    const tool = loadTool("propose_save_defense_play");
    const r = await tool.handler(
      {
        defense_fence: OVERLAY_FENCE,
        offensive_play_ref: "noah-uuid",
        suggested_name: "Cover 3 vs Noah",
        change_summary: "test",
      },
      { ...CTX, canEditPlaybook: false },
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/edit access/i);
  });
});
