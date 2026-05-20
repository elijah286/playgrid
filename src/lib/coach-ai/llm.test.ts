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
import { chat } from "./llm";

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
