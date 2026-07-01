import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock the LLM seam and the tool-execution layer so we can assert the runner's
// control flow without a real model or DB.
const { chatMock, runLeagueToolMock } = vi.hoisted(() => ({
  chatMock: vi.fn(),
  runLeagueToolMock: vi.fn(),
}));

vi.mock("@/lib/coach-ai/llm", () => ({ chat: chatMock }));

vi.mock("./tools", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import("./tools");
  return { ...actual, runLeagueTool: runLeagueToolMock };
});

import { runLeagueAgent } from "./runner";

const CTX = { leagueId: "L1", userId: "U1", isLeagueAdmin: true, capabilities: [] };

function toolUseTurn(name: string, input: Record<string, unknown>) {
  return {
    message: { role: "assistant", content: [{ type: "tool_use", id: "t1", name, input }] },
    stopReason: "tool_use",
  };
}
function textTurn(text: string) {
  return {
    message: { role: "assistant", content: [{ type: "text", text }] },
    stopReason: "end_turn",
  };
}

describe("runLeagueAgent — write proposals never execute", () => {
  beforeEach(() => {
    chatMock.mockReset();
    runLeagueToolMock.mockReset();
  });

  it("captures a consequential call as a proposal and does NOT run it (writes on)", async () => {
    chatMock
      .mockResolvedValueOnce(toolUseTurn("rename_league", { name: "New Name" }))
      .mockResolvedValueOnce(textTurn("I've prepared the rename — approve below."));

    const result = await runLeagueAgent([], "rename the league to New Name", CTX, {
      allowWrites: true,
    });

    expect(result.proposal?.toolName).toBe("rename_league");
    expect(result.proposal?.input).toEqual({ name: "New Name" });
    expect(result.proposal?.preview).toContain("New Name");
    // The write must never have been executed by the runner.
    expect(runLeagueToolMock).not.toHaveBeenCalled();
  });

  it("still executes read tools inline (writes on)", async () => {
    runLeagueToolMock.mockResolvedValueOnce({ ok: true, result: "3 teams, 0 without a coach." });
    chatMock
      .mockResolvedValueOnce(toolUseTurn("league_overview", {}))
      .mockResolvedValueOnce(textTurn("You have 3 teams."));

    const result = await runLeagueAgent([], "league state?", CTX, { allowWrites: true });

    expect(runLeagueToolMock).toHaveBeenCalledOnce();
    expect(runLeagueToolMock).toHaveBeenCalledWith("league_overview", {}, CTX);
    expect(result.proposal).toBeUndefined();
    expect(result.text).toContain("3 teams");
  });

  it("refuses a consequential call in read-only mode — no proposal, no execution", async () => {
    chatMock
      .mockResolvedValueOnce(toolUseTurn("rename_league", { name: "X" }))
      .mockResolvedValueOnce(textTurn("I can't change that — use the Settings page."));

    const result = await runLeagueAgent([], "rename it", CTX, { allowWrites: false });

    expect(result.proposal).toBeUndefined();
    expect(runLeagueToolMock).not.toHaveBeenCalled();
  });
});
