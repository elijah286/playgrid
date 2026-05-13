/**
 * `synthesizeBudgetExceededReply` — the structural backstop for the
 * "Cal ran out of tool budget mid-batch" failure mode.
 *
 * Surfaced 2026-05-13: a coach asked Cal to "go ahead and add these to
 * the playbook" after Cal listed 6 plays as PROSE (no fences). Cal had
 * to compose_play + create_play for each one — 12 tool calls — and hit
 * the (old) cap of 8 turns. The loop exhausted with the last message
 * being a tool_result, `finalText` was empty, and the static
 * "I lost the thread mid-answer there" fallback shipped.
 *
 * The bug class is "user-visible surrender after partial work landed."
 * The structural fix forces one more text-only chat() call so Cal can
 * honestly recap what saved + what's pending instead of pretending the
 * whole turn was lost.
 *
 * These tests stub the `chat` function so the synthesis logic can be
 * verified without an LLM client. The chat injection in the helper's
 * signature exists for exactly this purpose.
 */

import { describe, expect, it, vi } from "vitest";
import {
  BUDGET_SYNTHESIS_SUFFIX,
  synthesizeBudgetExceededReply,
} from "./agent";
import type { ChatMessage } from "./llm";

const BASE_SYSTEM = "You are Coach Cal.";
const STUB_HISTORY: ChatMessage[] = [
  { role: "user", content: "give me 6 plays for my package" },
  { role: "assistant", content: "Here's the strategic blueprint…" },
  { role: "user", content: "go ahead and add these to the playbook" },
];

describe("synthesizeBudgetExceededReply", () => {
  it("appends the budget-exceeded suffix to the system prompt", async () => {
    let capturedSystem = "";
    const fakeChat = vi.fn(async ({ system }: { system: string }) => {
      capturedSystem = system;
      return {
        message: { role: "assistant" as const, content: [{ type: "text" as const, text: "Saved 4 of 6." }] },
        stopReason: "end_turn" as const,
        provider: "claude" as const,
        modelId: "stub",
      };
    });
    await synthesizeBudgetExceededReply(fakeChat as never, BASE_SYSTEM, STUB_HISTORY);
    expect(capturedSystem).toContain(BASE_SYSTEM);
    expect(capturedSystem).toContain(BUDGET_SYNTHESIS_SUFFIX);
  });

  it("forces text-only output by omitting tools from the chat call", async () => {
    let capturedOpts: Record<string, unknown> = {};
    const fakeChat = vi.fn(async (opts: Record<string, unknown>) => {
      capturedOpts = opts;
      return {
        message: { role: "assistant" as const, content: [{ type: "text" as const, text: "OK." }] },
        stopReason: "end_turn" as const,
        provider: "claude" as const,
        modelId: "stub",
      };
    });
    await synthesizeBudgetExceededReply(fakeChat as never, BASE_SYSTEM, STUB_HISTORY);
    expect(capturedOpts.tools).toBeUndefined();
  });

  it("returns the synthesized text when the model produces a non-empty reply", async () => {
    const fakeChat = vi.fn(async () => ({
      message: {
        role: "assistant" as const,
        content: [{ type: "text" as const, text: "Saved 4 of 6 plays: Mesh, Smash, Y-Cross, Slant-Flat. Say 'continue' for the rest." }],
      },
      stopReason: "end_turn" as const,
      provider: "claude" as const,
      modelId: "stub",
    }));
    const out = await synthesizeBudgetExceededReply(fakeChat as never, BASE_SYSTEM, STUB_HISTORY);
    expect(out).toBe("Saved 4 of 6 plays: Mesh, Smash, Y-Cross, Slant-Flat. Say 'continue' for the rest.");
  });

  it("returns null when the model returns empty text (so caller can fall back)", async () => {
    const fakeChat = vi.fn(async () => ({
      message: { role: "assistant" as const, content: [{ type: "text" as const, text: "" }] },
      stopReason: "end_turn" as const,
      provider: "claude" as const,
      modelId: "stub",
    }));
    const out = await synthesizeBudgetExceededReply(fakeChat as never, BASE_SYSTEM, STUB_HISTORY);
    expect(out).toBeNull();
  });

  it("returns null when the model returns only whitespace", async () => {
    const fakeChat = vi.fn(async () => ({
      message: { role: "assistant" as const, content: [{ type: "text" as const, text: "  \n\n  " }] },
      stopReason: "end_turn" as const,
      provider: "claude" as const,
      modelId: "stub",
    }));
    const out = await synthesizeBudgetExceededReply(fakeChat as never, BASE_SYSTEM, STUB_HISTORY);
    expect(out).toBeNull();
  });

  it("returns null when the model returns no text blocks at all", async () => {
    const fakeChat = vi.fn(async () => ({
      message: { role: "assistant" as const, content: [] },
      stopReason: "end_turn" as const,
      provider: "claude" as const,
      modelId: "stub",
    }));
    const out = await synthesizeBudgetExceededReply(fakeChat as never, BASE_SYSTEM, STUB_HISTORY);
    expect(out).toBeNull();
  });

  it("returns null when the chat call throws (network error, model overload)", async () => {
    const fakeChat = vi.fn(async () => {
      throw new Error("Anthropic 529: overloaded");
    });
    const out = await synthesizeBudgetExceededReply(fakeChat as never, BASE_SYSTEM, STUB_HISTORY);
    expect(out).toBeNull();
  });

  it("passes the full message history to the synthesis call so the model can see what tools returned", async () => {
    let capturedMessages: ChatMessage[] = [];
    const fakeChat = vi.fn(async ({ messages }: { messages: ChatMessage[] }) => {
      capturedMessages = messages;
      return {
        message: { role: "assistant" as const, content: [{ type: "text" as const, text: "OK." }] },
        stopReason: "end_turn" as const,
        provider: "claude" as const,
        modelId: "stub",
      };
    });
    await synthesizeBudgetExceededReply(fakeChat as never, BASE_SYSTEM, STUB_HISTORY);
    expect(capturedMessages).toEqual(STUB_HISTORY);
  });

  it("concatenates multiple text blocks from the synthesis response", async () => {
    const fakeChat = vi.fn(async () => ({
      message: {
        role: "assistant" as const,
        content: [
          { type: "text" as const, text: "Saved 3 plays." },
          { type: "text" as const, text: "Say continue for the rest." },
        ],
      },
      stopReason: "end_turn" as const,
      provider: "claude" as const,
      modelId: "stub",
    }));
    const out = await synthesizeBudgetExceededReply(fakeChat as never, BASE_SYSTEM, STUB_HISTORY);
    expect(out).toContain("Saved 3 plays.");
    expect(out).toContain("Say continue for the rest.");
  });
});

describe("BUDGET_SYNTHESIS_SUFFIX — load-bearing copy", () => {
  it("tells the model NOT to call more tools", () => {
    expect(BUDGET_SYNTHESIS_SUFFIX).toMatch(/cannot call any more tools|no more tools/i);
  });

  it("tells the model NOT to use the surrender phrase 'I lost the thread'", () => {
    expect(BUDGET_SYNTHESIS_SUFFIX).toMatch(/lost the thread/i);
    expect(BUDGET_SYNTHESIS_SUFFIX).toMatch(/do not.*lost the thread|don'?t.*lost the thread/i);
  });

  it("tells the model NOT to mention the internal mechanism", () => {
    expect(BUDGET_SYNTHESIS_SUFFIX).toMatch(/internal|do not mention|budget|tool limit/i);
  });

  it("instructs the model to name what saved + what's pending + a next step", () => {
    expect(BUDGET_SYNTHESIS_SUFFIX).toMatch(/saved/i);
    expect(BUDGET_SYNTHESIS_SUFFIX).toMatch(/pending|still/i);
    expect(BUDGET_SYNTHESIS_SUFFIX).toMatch(/continue|next step/i);
  });
});
