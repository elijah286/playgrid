import { getStoredClaudeApiKey } from "@/lib/site/claude-key";
import { getStoredOpenAIApiKey } from "@/lib/site/openai-key";
import { getLlmProvider, type LlmProvider } from "@/lib/site/llm-provider";

const CLAUDE_MODEL = "claude-haiku-4-5-20251001";
const OPENAI_MODEL = "gpt-4o-mini";
const ANTHROPIC_VERSION = "2023-06-01";

export type ToolDef = {
  name: string;
  description: string;
  /** JSON Schema for the tool's input. */
  input_schema: Record<string, unknown>;
};

export type TextBlock = { type: "text"; text: string };
export type ToolUseBlock = {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
};
export type ToolResultBlock = {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error?: boolean;
};
export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock;

export type ChatMessage =
  | { role: "user"; content: string | ContentBlock[] }
  | { role: "assistant"; content: string | ContentBlock[] };

export type ChatResult = {
  /** Provider-normalized assistant turn — content blocks as returned. */
  message: { role: "assistant"; content: ContentBlock[] };
  /** "end_turn" when the model is done, "tool_use" when it wants to call tools. */
  stopReason: "end_turn" | "tool_use" | "max_tokens" | "other";
  provider: LlmProvider;
  modelId: string;
};

export type ChatOptions = {
  system: string;
  messages: ChatMessage[];
  tools?: ToolDef[];
  maxTokens?: number;
  /** Called for each streamed text token (Claude only; ignored by OpenAI path). */
  onTextDelta?: (text: string) => void;
};

export async function chat(opts: ChatOptions): Promise<ChatResult> {
  const provider = await getLlmProvider();
  return provider === "claude" ? chatClaude(opts) : chatOpenAI(opts);
}

// ─── Claude ──────────────────────────────────────────────────────────────────

async function chatClaude(opts: ChatOptions): Promise<ChatResult> {
  const apiKey = await getStoredClaudeApiKey();
  if (!apiKey) {
    throw new Error("Coach AI is set to Claude but no Anthropic API key is saved.");
  }
  const body = {
    model: CLAUDE_MODEL,
    max_tokens: opts.maxTokens ?? 1024,
    system: opts.system,
    messages: opts.messages.map(toClaudeMessage),
    stream: opts.onTextDelta ? true : undefined,
    ...(opts.tools && opts.tools.length > 0
      ? { tools: opts.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema })) }
      : {}),
  };
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic ${res.status}: ${text}`);
  }

  // Non-streaming path (no onTextDelta callback)
  if (!opts.onTextDelta) {
    const text = await res.text();
    const json = JSON.parse(text) as { content: ContentBlock[]; stop_reason: string; model: string };
    const cleaned = json.content.filter((b) => b.type !== "text" || b.text.length > 0);
    return {
      message: { role: "assistant", content: cleaned },
      stopReason: normalizeStopReason(json.stop_reason),
      provider: "claude",
      modelId: json.model,
    };
  }

  // Streaming path: parse Anthropic SSE events
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  const blocks: ContentBlock[] = [];
  type PartialBlock = { type: "text"; text: string } | { type: "tool_use"; id: string; name: string; _json: string };
  let cur: PartialBlock | null = null;
  let stopReason = "other";
  let modelId = CLAUDE_MODEL;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const payload = line.slice(6).trim();
      if (!payload || payload === "[DONE]") continue;
      let ev: Record<string, unknown>;
      try { ev = JSON.parse(payload) as Record<string, unknown>; } catch { continue; }

      const type = ev.type as string;
      if (type === "message_start") {
        const msg = ev.message as { model?: string } | undefined;
        if (msg?.model) modelId = msg.model;
      }
      if (type === "content_block_start") {
        const cb = ev.content_block as { type: string; id?: string; name?: string; text?: string } | undefined;
        if (cb?.type === "text") cur = { type: "text", text: cb.text ?? "" };
        else if (cb?.type === "tool_use") cur = { type: "tool_use", id: cb.id ?? "", name: cb.name ?? "", _json: "" };
      }
      if (type === "content_block_delta" && cur) {
        const delta = ev.delta as { type: string; text?: string; partial_json?: string } | undefined;
        if (delta?.type === "text_delta" && cur.type === "text") {
          cur.text += delta.text ?? "";
          opts.onTextDelta!(delta.text ?? "");
        }
        if (delta?.type === "input_json_delta" && cur.type === "tool_use") {
          cur._json += delta.partial_json ?? "";
        }
      }
      if (type === "content_block_stop" && cur) {
        if (cur.type === "text") {
          // Skip empty text blocks — Anthropic rejects them on the next turn
          // with "text content blocks must be non-empty".
          if (cur.text.length > 0) blocks.push({ type: "text", text: cur.text });
        } else {
          let input: Record<string, unknown> = {};
          try { input = JSON.parse(cur._json) as Record<string, unknown>; } catch { /* empty input */ }
          blocks.push({ type: "tool_use", id: cur.id, name: cur.name, input });
        }
        cur = null;
      }
      if (type === "message_delta") {
        const delta = ev.delta as { stop_reason?: string } | undefined;
        if (delta?.stop_reason) stopReason = delta.stop_reason;
      }
    }
  }

  return {
    message: { role: "assistant", content: blocks },
    stopReason: normalizeStopReason(stopReason),
    provider: "claude",
    modelId,
  };
}

function normalizeStopReason(r: string): "end_turn" | "tool_use" | "max_tokens" | "other" {
  if (r === "end_turn") return "end_turn";
  if (r === "tool_use") return "tool_use";
  if (r === "max_tokens") return "max_tokens";
  return "other";
}

function toClaudeMessage(m: ChatMessage): { role: "user" | "assistant"; content: string | ContentBlock[] } {
  return { role: m.role, content: m.content };
}

// ─── OpenAI ──────────────────────────────────────────────────────────────────

type OpenAIToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

type OpenAIMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
};

async function chatOpenAI(opts: ChatOptions): Promise<ChatResult> {
  const apiKey = await getStoredOpenAIApiKey();
  if (!apiKey) {
    throw new Error("Coach AI is set to OpenAI but no OpenAI API key is saved.");
  }
  const messages: OpenAIMessage[] = [{ role: "system", content: opts.system }];
  for (const m of opts.messages) messages.push(...toOpenAIMessages(m));

  const body = {
    model: OPENAI_MODEL,
    max_tokens: opts.maxTokens ?? 1024,
    messages,
    ...(opts.tools && opts.tools.length > 0
      ? {
          tools: opts.tools.map((t) => ({
            type: "function" as const,
            function: { name: t.name, description: t.description, parameters: t.input_schema },
          })),
        }
      : {}),
  };
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`OpenAI ${res.status}: ${text}`);
  }
  const json = JSON.parse(text) as {
    choices: { message: OpenAIMessage; finish_reason: string }[];
    model: string;
  };
  const choice = json.choices?.[0];
  if (!choice) throw new Error("OpenAI returned no choices.");
  const content: ContentBlock[] = [];
  if (choice.message.content) content.push({ type: "text", text: choice.message.content });
  for (const call of choice.message.tool_calls ?? []) {
    let input: Record<string, unknown> = {};
    try {
      input = JSON.parse(call.function.arguments) as Record<string, unknown>;
    } catch {
      input = {};
    }
    content.push({ type: "tool_use", id: call.id, name: call.function.name, input });
  }
  return {
    message: { role: "assistant", content },
    stopReason:
      choice.finish_reason === "tool_calls"
        ? "tool_use"
        : choice.finish_reason === "stop"
          ? "end_turn"
          : choice.finish_reason === "length"
            ? "max_tokens"
            : "other",
    provider: "openai",
    modelId: json.model,
  };
}

/** Flattens a unified ChatMessage into one or more OpenAI-shaped messages. */
function toOpenAIMessages(m: ChatMessage): OpenAIMessage[] {
  if (typeof m.content === "string") {
    return [{ role: m.role, content: m.content }];
  }
  if (m.role === "user") {
    // user blocks are either text or tool_result
    const textParts: string[] = [];
    const toolMessages: OpenAIMessage[] = [];
    for (const b of m.content) {
      if (b.type === "text") textParts.push(b.text);
      else if (b.type === "tool_result") {
        toolMessages.push({ role: "tool", tool_call_id: b.tool_use_id, content: b.content });
      }
    }
    const out: OpenAIMessage[] = [...toolMessages];
    if (textParts.length > 0) out.push({ role: "user", content: textParts.join("\n\n") });
    return out;
  }
  // assistant: text + tool_use blocks → one message with content + tool_calls
  const textParts: string[] = [];
  const toolCalls: OpenAIToolCall[] = [];
  for (const b of m.content) {
    if (b.type === "text") textParts.push(b.text);
    else if (b.type === "tool_use") {
      toolCalls.push({
        id: b.id,
        type: "function",
        function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) },
      });
    }
  }
  return [
    {
      role: "assistant",
      content: textParts.length > 0 ? textParts.join("\n\n") : null,
      ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
    },
  ];
}
