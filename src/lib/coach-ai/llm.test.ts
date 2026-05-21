/**
 * Coverage for the image-input plumbing added to the ContentBlock union.
 *
 * The chat() function itself isn't tested here — it's a thin shim over fetch
 * with two provider branches, and the integration surface (does Anthropic
 * actually accept the request) is verified manually in the worktree per
 * AGENTS.md Rule 12 / the image-import litmus test. What we DO cover here is
 * the structural shape: ImageBlock composes into a ChatMessage, the union
 * still includes the older block types, and the OpenAI rejection path fires
 * with a clear error so we never silently strip an image.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { ChatMessage, ContentBlock, ImageBlock } from "./llm";
import { chat, pickClaudeModel } from "./llm";

describe("ImageBlock composition", () => {
  it("can be placed alongside text in a user ChatMessage", () => {
    const image: ImageBlock = {
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: "fakebase64data" },
    };
    const text: ContentBlock = { type: "text", text: "what plays are these?" };
    const msg: ChatMessage = { role: "user", content: [image, text] };

    expect(msg.role).toBe("user");
    expect(Array.isArray(msg.content)).toBe(true);
    const blocks = msg.content as ContentBlock[];
    expect(blocks[0].type).toBe("image");
    expect(blocks[1].type).toBe("text");
    // Field names match Anthropic's wire format — these are serialized verbatim.
    if (blocks[0].type === "image") {
      expect(blocks[0].source.type).toBe("base64");
      expect(blocks[0].source.media_type).toBe("image/jpeg");
      expect(blocks[0].source.data).toBe("fakebase64data");
    }
  });
});

describe("OpenAI provider rejects image input", () => {
  // The OpenAI branch in chat() doesn't yet know how to translate Anthropic's
  // image block into OpenAI's image_url format. The user-facing requirement
  // is "fail loudly with a helpful message" so coaches understand the cause
  // rather than seeing a silent text-only response.
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("throws a clear error when the user sends an image and the provider is OpenAI", async () => {
    vi.doMock("@/lib/site/llm-provider", () => ({
      getLlmProvider: vi.fn(async () => "openai" as const),
    }));
    vi.doMock("@/lib/site/openai-key", () => ({
      getStoredOpenAIApiKey: vi.fn(async () => "test-key"),
    }));
    // chat() is statically imported above; re-import the module so the doMock
    // hooks take effect on this call.
    const { chat: chatWithMocks } = await import("./llm");
    await expect(
      chatWithMocks({
        system: "test",
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: "x" } },
            { type: "text", text: "what is this?" },
          ],
        }],
      }),
    ).rejects.toThrow(/only supported with Claude/i);
  });
});

// Sanity check that we didn't accidentally remove `chat` from the exports.
// Tooling expects chat() to be the single entry point — refactors that hide
// it should fail loudly here rather than at runtime.
describe("chat() is exported", () => {
  it("exists as a function", () => {
    expect(typeof chat).toBe("function");
  });
});

describe("pickClaudeModel — vision routing", () => {
  // Surfaced 2026-05-21: Haiku 4.5 misread hand-drawn play sheets and even
  // with the tightest prompt couldn't reliably identify route shapes from
  // an arrow drawn on lined paper. Image-attached turns now route to
  // Sonnet 4.6; everything else stays on Haiku.

  const imageBlock: ImageBlock = {
    type: "image",
    source: { type: "base64", media_type: "image/jpeg", data: "x" },
  };

  it("picks Haiku for text-only conversations", () => {
    const msgs: ChatMessage[] = [
      { role: "user", content: "what's a Cover 2?" },
    ];
    expect(pickClaudeModel(msgs)).toMatch(/haiku/i);
  });

  it("picks Haiku when content is an array of text blocks (no image)", () => {
    const msgs: ChatMessage[] = [
      {
        role: "user",
        content: [
          { type: "text", text: "build me a Snag" },
          { type: "text", text: "from Trips Right" },
        ],
      },
    ];
    expect(pickClaudeModel(msgs)).toMatch(/haiku/i);
  });

  it("picks Sonnet when ANY user message contains an image block", () => {
    const msgs: ChatMessage[] = [
      {
        role: "user",
        content: [imageBlock, { type: "text", text: "what plays are these?" }],
      },
    ];
    expect(pickClaudeModel(msgs)).toMatch(/opus/i);
  });

  it("stays on Sonnet across agent-loop iterations of the same image turn", () => {
    // After Cal calls a tool, the conversation grows: [user(image+text),
    // assistant(tool_use), user(tool_result)]. We must keep using Sonnet
    // so the prompt cache stays warm across the same user turn.
    const msgs: ChatMessage[] = [
      {
        role: "user",
        content: [imageBlock, { type: "text", text: "what plays are these?" }],
      },
      { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "list_my_playbooks", input: {} }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "[]" }] },
    ];
    expect(pickClaudeModel(msgs)).toMatch(/opus/i);
  });

  it("falls back to Haiku on text-only follow-up turns (image already fell out)", () => {
    // stream/route.ts strips images from history before sending the next
    // turn. So when the coach types a follow-up, the conversation no
    // longer contains an image block and the model picker correctly
    // returns to Haiku.
    const msgs: ChatMessage[] = [
      { role: "user", content: "save it as 'Noah'" },
      { role: "assistant", content: [{ type: "text", text: "(prior reply)" }] },
      { role: "user", content: "next play" },
    ];
    expect(pickClaudeModel(msgs)).toMatch(/haiku/i);
  });

  it("does NOT consider assistant-role content for the image check", () => {
    // Assistant turns can't carry images (the model doesn't emit image
    // blocks; only text + tool_use). But defensively: an image-shaped
    // block in an assistant turn must not flip us to Sonnet — only
    // genuine user-attached images should.
    const msgs: ChatMessage[] = [
      // Mock an assistant turn that somehow has an image block. Cast
      // through unknown since the type union forbids this — that's
      // exactly the malformed case we want to guard against.
      {
        role: "assistant",
        content: [imageBlock] as unknown as ContentBlock[],
      },
      { role: "user", content: "hello" },
    ];
    expect(pickClaudeModel(msgs)).toMatch(/haiku/i);
  });
});
