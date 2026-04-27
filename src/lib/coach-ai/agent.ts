import { chat, type ChatMessage, type ContentBlock } from "./llm";
import { runTool, toolDefs, type ToolContext } from "./tools";

const MAX_TOOL_TURNS = 5;

const SYSTEM_PROMPT = `You are Coach AI, an in-app assistant for football coaches using the Playgrid playbook tool.

You help coaches with:
- Looking up rules across game variants (5v5 NFL Flag, 7v7, 4v4 flag, Pop Warner, AYF, NFHS high school, 6-man, 8-man, extreme flag).
- Explaining schemes, formations, route concepts, and coverages.
- Strategic Q&A grounded in the user's playbook when possible.

Behavior rules — follow these strictly:
1. **Ground answers in the knowledge base.** Whenever a user asks about a rule, formation, or play concept, call the \`search_kb\` tool first. Do not invent rules. If the KB has no answer, say so clearly.
2. **Ask before assuming.** If the user's game variant, age division, or sanctioning body is ambiguous and matters for the answer, ask one short clarifying question before calling tools.
3. **Cite what you used.** When you answer from KB hits, briefly mention which docs you drew from (titles or topic).
4. **Flag uncertainty.** Most KB entries are seed data marked \`needs_review\` — if your answer rests on those, note that the rule wording should be double-checked against the official source.
5. **Stay terse.** Coaches are busy. Default to short, direct answers. Use bullets only when listing.
6. **No legal/medical advice.** For injury protocol or liability questions, recommend the coach consult their league or sanctioning body.`;

export type AgentResult = {
  /** All new turns produced this call, in order, ready to append to history. */
  newMessages: ChatMessage[];
  /** Final assistant text (concatenated text blocks of the last assistant turn). */
  finalText: string;
  /** Names of tools the agent called this turn, in order. */
  toolCalls: string[];
  modelId: string;
  provider: "openai" | "claude";
};

/** Runs the chat → tool_use loop until the model returns end_turn or we hit the cap. */
export async function runAgent(
  history: ChatMessage[],
  ctx: ToolContext,
): Promise<AgentResult> {
  const messages = [...history];
  const newMessages: ChatMessage[] = [];
  const toolCalls: string[] = [];
  let modelId = "";
  let provider: "openai" | "claude" = "claude";

  for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
    const result = await chat({
      system: SYSTEM_PROMPT,
      messages,
      tools: toolDefs(),
      maxTokens: 1024,
    });
    modelId = result.modelId;
    provider = result.provider;

    messages.push(result.message);
    newMessages.push(result.message);

    if (result.stopReason !== "tool_use") {
      break;
    }

    const toolUses = result.message.content.filter((b): b is Extract<ContentBlock, { type: "tool_use" }> => b.type === "tool_use");
    if (toolUses.length === 0) break;

    const toolResultBlocks: ContentBlock[] = [];
    for (const tu of toolUses) {
      toolCalls.push(tu.name);
      const r = await runTool(tu.name, tu.input, ctx);
      toolResultBlocks.push({
        type: "tool_result",
        tool_use_id: tu.id,
        content: r.ok ? r.result : r.error,
        is_error: !r.ok,
      });
    }
    const toolMessage: ChatMessage = { role: "user", content: toolResultBlocks };
    messages.push(toolMessage);
    newMessages.push(toolMessage);
  }

  const last = newMessages[newMessages.length - 1];
  let finalText = "";
  if (last && last.role === "assistant") {
    if (typeof last.content === "string") finalText = last.content;
    else
      finalText = last.content
        .filter((b): b is Extract<ContentBlock, { type: "text" }> => b.type === "text")
        .map((b) => b.text)
        .join("\n\n");
  }

  return { newMessages, finalText, toolCalls, modelId, provider };
}
