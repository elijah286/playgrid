import "server-only";

import { chat, type ChatMessage, type ContentBlock } from "@/lib/coach-ai/llm";
import { leoSystemPrompt } from "./prompt";
import {
  leagueReadToolDefs,
  leagueToolDefs,
  LEAGUE_READ_TOOL_NAMES,
  LEAGUE_CONSEQUENTIAL_TOOL_NAMES,
  runLeagueTool,
} from "./tools";
import type { LeagueToolContext } from "./types";
import { describeProposal, type LeoProposal } from "./propose";

const MAX_TOOL_TURNS = 8;
const MAX_OUTPUT_TOKENS = 1200;

export type LeoTurn = { role: "user" | "assistant"; text: string };
export type LeoResult = { text: string; toolCalls: string[]; proposal?: LeoProposal };
export type RunOptions = { allowWrites?: boolean };

function textOf(content: string | ContentBlock[]): string {
  if (typeof content === "string") return content.trim();
  return content
    .filter((b): b is Extract<ContentBlock, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

function resultBlock(id: string, content: string, isError: boolean): ContentBlock {
  return { type: "tool_result", tool_use_id: id, content, is_error: isError };
}

/**
 * Leo's agent loop. Read tools execute inline. When writes are enabled
 * (allowWrites), a consequential tool call is CAPTURED as a proposal — never
 * executed here — and surfaced for explicit operator approval; the runner
 * returns at most one proposal per turn. When writes are off, only read tools
 * are offered and anything else is refused (v1 behavior).
 */
export async function runLeagueAgent(
  history: LeoTurn[],
  userMessage: string,
  ctx: LeagueToolContext,
  opts: RunOptions = {},
): Promise<LeoResult> {
  const allowWrites = !!opts.allowWrites;
  const tools = allowWrites ? leagueToolDefs(ctx) : leagueReadToolDefs();
  const system = leoSystemPrompt(ctx, allowWrites);

  const messages: ChatMessage[] = [
    ...history.map((t) => ({ role: t.role, content: t.text })),
    { role: "user" as const, content: userMessage },
  ];

  const toolCalls: string[] = [];
  let proposal: LeoProposal | undefined;

  for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
    const res = await chat({ system, messages, tools, maxTokens: MAX_OUTPUT_TOKENS });
    messages.push(res.message);

    if (res.stopReason !== "tool_use") {
      return { text: textOf(res.message.content) || "…", toolCalls, proposal };
    }

    const toolUses = res.message.content.filter(
      (b): b is Extract<ContentBlock, { type: "tool_use" }> => b.type === "tool_use",
    );
    if (toolUses.length === 0) {
      return { text: textOf(res.message.content) || "…", toolCalls, proposal };
    }

    const results: ContentBlock[] = [];
    for (const tu of toolUses) {
      toolCalls.push(tu.name);

      if (LEAGUE_READ_TOOL_NAMES.has(tu.name)) {
        const r = await runLeagueTool(tu.name, tu.input, ctx);
        results.push(resultBlock(tu.id, r.ok ? r.result : `Error: ${r.error}`, !r.ok));
        continue;
      }

      if (allowWrites && LEAGUE_CONSEQUENTIAL_TOOL_NAMES.has(tu.name)) {
        if (proposal) {
          results.push(
            resultBlock(
              tu.id,
              "Only one action can be proposed at a time — handle the first, then propose this next.",
              true,
            ),
          );
          continue;
        }
        proposal = {
          toolName: tu.name,
          input: tu.input,
          preview: describeProposal(tu.name, tu.input),
        };
        results.push(
          resultBlock(
            tu.id,
            "Proposed for the operator's approval — NOT done yet. Tell the operator exactly what you'll do and that you need their approval below. Do not claim it's sent or saved.",
            false,
          ),
        );
        continue;
      }

      // Read-only mode, or an unknown/unavailable tool.
      results.push(
        resultBlock(tu.id, "That action isn't available right now.", true),
      );
    }
    messages.push({ role: "user", content: results });
  }

  return {
    text: proposal
      ? "I've prepared that — approve the action below to run it."
      : "I couldn't finish that one — try narrowing the question.",
    toolCalls,
    proposal,
  };
}
