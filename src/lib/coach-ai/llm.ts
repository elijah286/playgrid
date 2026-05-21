import { getStoredClaudeApiKey } from "@/lib/site/claude-key";
import { getStoredOpenAIApiKey } from "@/lib/site/openai-key";
import { getLlmProvider, type LlmProvider } from "@/lib/site/llm-provider";

// Default text model — Haiku 4.5 is the right tradeoff for the vast majority
// of Coach Cal turns (rules Q&A, play composition from named concepts, KB
// lookups, scheduling). Fast, cheap, plenty smart enough for text-only work.
const CLAUDE_MODEL = "claude-haiku-4-5-20251001";

// Vision-tier model — Opus 4.7 is the strongest available Claude model at
// fine-grained hand-drawn route identification. Used ONLY for turns where
// the coach attached a photo (play sheet, wristcoach, whiteboard).
// Progression history:
//   - Haiku 4.5: misread routes and hallucinated labels even with tight
//     prompts (initial state, surfaced 2026-05-21).
//   - Sonnet 4.6: better, but still wrong ~30% of the time on small/faint
//     pencil drawings (curl mistaken for hitch, in-route for slant,
//     silently relabeling player ids). Coach reported "still a highly
//     inaccurate rendering" (2026-05-21, round 2). Tried adding a 2-turn-
//     per-play coach-confirm workflow — coach pushed back: "I don't want
//     to have to review every player's route — I want the LLM to
//     accurately represent the plays."
//   - Opus 4.7: chosen 2026-05-21 (round 3). Best chance at first-pass
//     accuracy without coach review. Higher cost is justified by image
//     turns being a small fraction of total Cal traffic; the image-cap
//     (getCoachCalImageCapState) bounds runaway exposure per user.
const CLAUDE_VISION_MODEL = "claude-opus-4-7";

const OPENAI_MODEL = "gpt-4o-mini";
const ANTHROPIC_VERSION = "2023-06-01";

/**
 * Pick the Claude model for a turn based on whether any user message in the
 * conversation includes an image block. When the answer is yes, all agent-
 * loop iterations of that turn use the vision model — switching mid-turn
 * would burn the prompt cache. Once the image falls out of history on the
 * next user turn, this returns the text model again.
 *
 * Exported for tests; in production only chatClaude calls it.
 */
export function pickClaudeModel(messages: ChatMessage[]): string {
  for (const m of messages) {
    if (m.role !== "user") continue;
    if (typeof m.content === "string") continue;
    for (const block of m.content) {
      if (block.type === "image") return CLAUDE_VISION_MODEL;
    }
  }
  return CLAUDE_MODEL;
}

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
// Image input — user role only. Base64 source matches Anthropic's API shape
// verbatim and is forwarded without transformation. Images are never persisted
// in chat history (see stream/route.ts): they live in-flight on the request
// that carried them and fall off the end of the conversation after that turn.
export type ImageBlock = {
  type: "image";
  source: { type: "base64"; media_type: string; data: string };
};
export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock | ImageBlock;

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
  /**
   * Extended thinking budget in tokens (Claude only; ignored by OpenAI).
   * When set, enables Anthropic's `thinking` parameter — the model gets
   * up to `thinkingBudget` tokens of private reasoning before producing
   * visible output. For tasks where one-shot generation drops accuracy
   * (hand-drawn route tracing, multi-step reasoning, careful structured
   * output) this is the single biggest lever after prompt design.
   *
   * Round 13 (2026-05-21): added to unblock per-play vision accuracy.
   * Without thinking, Opus had to commit pixels → JSON in one forward
   * pass and template-locked to common-play priors when uncertain. With
   * a 4-8k token budget, the model can examine each arrow, reason about
   * direction/length, then emit the fence.
   *
   * Cost: thinking tokens bill as OUTPUT tokens. At Opus 4.7 pricing,
   * 8k thinking = ~$0.12 per call. Image turns are rare + gated; the
   * absolute spend bump is modest for the accuracy gain.
   *
   * Streaming + thinking together: not yet supported in this codebase.
   * If onTextDelta is also set, thinking is silently ignored (the
   * non-streaming path supports it; per-crop vision uses non-streaming).
   */
  thinkingBudget?: number;
  /** Called for each streamed text token (Claude only; ignored by OpenAI path). */
  onTextDelta?: (text: string) => void;
};

export async function chat(opts: ChatOptions): Promise<ChatResult> {
  const provider = await getLlmProvider();
  return provider === "claude" ? chatClaude(opts) : chatOpenAI(opts);
}

// Retry on 429 (rate limit) and 529 (overloaded) with exponential backoff.
// Anthropic's per-minute token bucket is bursty; a short wait usually clears it.
async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  const delaysMs = [1000, 2000, 4000];
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, init);
    if (res.status !== 429 && res.status !== 529) return res;
    if (attempt >= delaysMs.length) return res;
    const retryAfter = Number(res.headers.get("retry-after"));
    const wait = Number.isFinite(retryAfter) && retryAfter > 0
      ? Math.min(retryAfter * 1000, 10_000)
      : delaysMs[attempt];
    await new Promise((r) => setTimeout(r, wait));
  }
}

// ─── Claude ──────────────────────────────────────────────────────────────────

async function chatClaude(opts: ChatOptions): Promise<ChatResult> {
  const apiKey = await getStoredClaudeApiKey();
  if (!apiKey) {
    throw new Error("Coach AI is set to Claude but no Anthropic API key is saved.");
  }
  // Prompt caching: mark the system prompt and the tool list as cacheable so
  // multi-turn conversations don't re-bill the same prefix every turn. The
  // cache breakpoint goes on the LAST tool — that caches everything before it
  // (system + tools). 5-minute TTL is plenty for an interactive chat.
  const tools = opts.tools && opts.tools.length > 0
    ? opts.tools.map((t, i) => ({
        name: t.name,
        description: t.description,
        input_schema: t.input_schema,
        ...(i === opts.tools!.length - 1 ? { cache_control: { type: "ephemeral" as const } } : {}),
      }))
    : undefined;
  const selectedModel = pickClaudeModel(opts.messages);
  // Extended thinking: enabled on non-streaming calls with thinkingBudget
  // set. Anthropic requires `max_tokens` >= `thinking.budget_tokens + 1`,
  // so we bump max_tokens up if the caller's budget would underflow.
  // Streaming + thinking together isn't wired here (per-crop vision uses
  // non-streaming, which is where we want thinking the most).
  const useThinking =
    typeof opts.thinkingBudget === "number" && opts.thinkingBudget > 0 && !opts.onTextDelta;
  const requestedMaxTokens = opts.maxTokens ?? 1024;
  const effectiveMaxTokens = useThinking
    ? Math.max(requestedMaxTokens, (opts.thinkingBudget ?? 0) + 1024)
    : requestedMaxTokens;
  const body = {
    model: selectedModel,
    max_tokens: effectiveMaxTokens,
    system: [{ type: "text" as const, text: opts.system, cache_control: { type: "ephemeral" as const } }],
    messages: opts.messages.map(toClaudeMessage),
    stream: opts.onTextDelta ? true : undefined,
    ...(tools ? { tools } : {}),
    ...(useThinking
      ? { thinking: { type: "enabled" as const, budget_tokens: opts.thinkingBudget } }
      : {}),
  };
  const res = await fetchWithRetry("https://api.anthropic.com/v1/messages", {
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
    // The API may return `thinking` (and `redacted_thinking`) blocks
    // when extended thinking is enabled. We strip those before
    // returning — downstream code (agent loop, validators, etc.)
    // expects only text and tool_use. The thinking is private
    // reasoning; the visible output is what matters.
    const json = JSON.parse(text) as {
      content: Array<ContentBlock | { type: "thinking" | "redacted_thinking" }>;
      stop_reason: string;
      model: string;
    };
    const cleaned = ensureNonEmptyAssistantContent(
      json.content.filter((b): b is ContentBlock => {
        if (b.type === "thinking" || b.type === "redacted_thinking") return false;
        if (b.type === "text" && b.text.length === 0) return false;
        return true;
      }),
    );
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
  let modelId = selectedModel;

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
    message: { role: "assistant", content: ensureNonEmptyAssistantContent(blocks) },
    stopReason: normalizeStopReason(stopReason),
    provider: "claude",
    modelId,
  };
}

/**
 * Anthropic 400s on assistant turns whose content array is empty OR whose only
 * text block is empty. After we strip empty text blocks above, an assistant
 * turn that returned nothing usable would otherwise be saved as `content: []`
 * and crash the next request when the history is replayed. Insert a single
 * placeholder text block so the conversation stays valid.
 */
function ensureNonEmptyAssistantContent(blocks: ContentBlock[]): ContentBlock[] {
  if (blocks.length === 0) return [{ type: "text", text: "(no response)" }];
  return blocks;
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
    // user blocks are either text or tool_result. Image blocks are Claude-only
    // for now — the OpenAI shape uses a different content array format, and
    // wiring it isn't blocking image input on the default Claude path.
    const textParts: string[] = [];
    const toolMessages: OpenAIMessage[] = [];
    for (const b of m.content) {
      if (b.type === "text") textParts.push(b.text);
      else if (b.type === "tool_result") {
        toolMessages.push({ role: "tool", tool_call_id: b.tool_use_id, content: b.content });
      } else if (b.type === "image") {
        throw new Error("Image input is only supported with Claude. Switch the Coach AI provider to Claude in admin settings.");
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
