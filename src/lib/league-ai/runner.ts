import "server-only";

import { chat, type ChatMessage, type ContentBlock } from "@/lib/coach-ai/llm";
import { leoSystemPrompt } from "./prompt";
import { leagueReadToolDefs, LEAGUE_READ_TOOL_NAMES, runLeagueTool } from "./tools";
import type { LeagueToolContext } from "./types";

// Read-only assistant: a few tool turns is plenty (look up state, then answer).
const MAX_TOOL_TURNS = 8;
const MAX_OUTPUT_TOKENS = 1200;

export type LeoTurn = { role: "user" | "assistant"; text: string };
export type LeoResult = { text: string; toolCalls: string[] };

function textOf(content: string | ContentBlock[]): string {
  if (typeof content === "string") return content.trim();
  return content
    .filter((b): b is Extract<ContentBlock, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

/**
 * Leo's agent loop. Mirrors Coach Cal's runAgent shape but trimmed for a
 * read-only assistant: no streaming, no persistence, no consequential writes.
 * Offers only read tool defs and refuses any tool_use outside the read set.
 */
export async function runLeagueAgent(
  history: LeoTurn[],
  userMessage: string,
  ctx: LeagueToolContext,
): Promise<LeoResult> {
  const tools = leagueReadToolDefs();
  const system = leoSystemPrompt(ctx);

  const messages: ChatMessage[] = [
    ...history.map((t) => ({ role: t.role, content: t.text })),
    { role: "user" as const, content: userMessage },
  ];

  const toolCalls: string[] = [];

  for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
    const res = await chat({ system, messages, tools, maxTokens: MAX_OUTPUT_TOKENS });
    messages.push(res.message);

    if (res.stopReason !== "tool_use") {
      return { text: textOf(res.message.content) || "…", toolCalls };
    }

    const toolUses = res.message.content.filter(
      (b): b is Extract<ContentBlock, { type: "tool_use" }> => b.type === "tool_use",
    );
    if (toolUses.length === 0) {
      return { text: textOf(res.message.content) || "…", toolCalls };
    }

    const results: ContentBlock[] = [];
    for (const tu of toolUses) {
      toolCalls.push(tu.name);
      // Defense in depth: Leo v1 must never run a write tool, even if the model
      // names one outside the offered read set.
      if (!LEAGUE_READ_TOOL_NAMES.has(tu.name)) {
        results.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: "That action isn't available — Leo is read-only right now.",
          is_error: true,
        });
        continue;
      }
      const r = await runLeagueTool(tu.name, tu.input, ctx);
      results.push({
        type: "tool_result",
        tool_use_id: tu.id,
        content: r.ok ? r.result : `Error: ${r.error}`,
        is_error: !r.ok,
      });
    }
    messages.push({ role: "user", content: results });
  }

  return {
    text: "I couldn't finish that one — try narrowing the question.",
    toolCalls,
  };
}
