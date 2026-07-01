import { describe, expect, it } from "vitest";
import type { CoachAiTurn } from "@/app/actions/coach-ai";
import { contextDividerTurn } from "./context-boundary";
import { reconcileServerTurns } from "./reconcile-turns";

const u = (text: string): CoachAiTurn => ({ role: "user", text });
const a = (text: string, extra?: Partial<Extract<CoachAiTurn, { role: "assistant" }>>): CoachAiTurn => ({
  role: "assistant",
  text,
  toolCalls: [],
  ...extra,
});

const PROPOSAL = [{ proposalId: "p1", defenseFenceJson: "{}", offensivePlayId: "x", offensivePlayName: "X", suggestedName: "Cover 1 vs X", changeSummary: "man" }];

describe("reconcileServerTurns", () => {
  it("carries save-defense proposals + saved state from client onto the server turn", () => {
    const server = [u("cover 1 vs this"), a("Here's Cover 1.")];
    const client = [
      u("cover 1 vs this"),
      a("Here's Cover 1.", {
        saveDefenseProposals: PROPOSAL as never,
        saveDefenseProposalState: { p1: { status: "saved", mode: "attached", playId: "x" } } as never,
      }),
    ];
    const out = reconcileServerTurns(server, client);
    expect(out).toHaveLength(2);
    const asst = out[1] as Extract<CoachAiTurn, { role: "assistant" }>;
    expect(asst.saveDefenseProposals).toEqual(PROPOSAL);
    expect(asst.saveDefenseProposalState).toEqual({ p1: { status: "saved", mode: "attached", playId: "x" } });
  });

  it("preserves a context-divider in position (server has no dividers)", () => {
    const server = [u("old q"), a("old a"), u("new q"), a("new a")];
    const client = [
      u("old q"),
      a("old a"),
      contextDividerTurn("Earlier conversation"),
      u("new q"),
      a("new a"),
    ];
    const out = reconcileServerTurns(server, client);
    expect(out.map((t) => (t.role === "assistant" && t.kind === "context-divider" ? "DIV" : t.text))).toEqual([
      "old q",
      "old a",
      "DIV",
      "new q",
      "new a",
    ]);
  });

  it("preserves choice proposals", () => {
    const choice = [{ proposalId: "c1", question: "Which?", options: [{ id: "o1", label: "A" }, { id: "o2", label: "B" }] }];
    const server = [u("build a play"), a("Pick one.")];
    const client = [u("build a play"), a("Pick one.", { choiceProposals: choice as never })];
    const out = reconcileServerTurns(server, client) as Extract<CoachAiTurn, { role: "assistant" }>[];
    expect((out[1] as Extract<CoachAiTurn, { role: "assistant" }>).choiceProposals).toEqual(choice);
  });

  it("keeps trailing client turns the server hasn't persisted yet", () => {
    const server = [u("q1"), a("a1")];
    const client = [u("q1"), a("a1"), u("q2 not yet saved")];
    const out = reconcileServerTurns(server, client);
    expect(out).toHaveLength(3);
    expect(out[2].text).toBe("q2 not yet saved");
  });

  it("appends server turns the client never cached", () => {
    const server = [u("q1"), a("a1"), u("q2"), a("a2 from another device")];
    const client = [u("q1"), a("a1")];
    const out = reconcileServerTurns(server, client);
    expect(out.map((t) => t.text)).toEqual(["q1", "a1", "q2", "a2 from another device"]);
  });

  it("uses server CONTENT (not client) when both exist", () => {
    // Server has the authoritative persisted text; client cached a slightly
    // different streamed copy. Server wins on content; client wins on chips.
    const server = [a("SERVER TEXT")];
    const client = [a("client text", { saveDefenseProposals: PROPOSAL as never })];
    const out = reconcileServerTurns(server, client) as Extract<CoachAiTurn, { role: "assistant" }>[];
    expect(out[0].text).toBe("SERVER TEXT");
    expect((out[0] as Extract<CoachAiTurn, { role: "assistant" }>).saveDefenseProposals).toEqual(PROPOSAL);
  });
});
