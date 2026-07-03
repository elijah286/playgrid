/**
 * The two LLM calls of the import pipeline, both through the shared
 * Cal client (`llm.ts`) so they inherit its retry, prompt caching,
 * stored-API-key handling, and token-usage recording.
 *
 *   1. detectPanels — find the play panels on a sheet photo (cheap
 *      model). A single-play photo comes back as one whole-image panel.
 *   2. extractPanel — read one cropped panel into the coordinate-free
 *      PlayExtraction schema (expensive model, thinking on). One
 *      validation-feedback retry: the model's invalid tool input is
 *      answered with an is_error tool_result carrying the zod issues.
 *
 * Model choices are env-overridable so prod can trial tiers without a
 * deploy: PHOTO_IMPORT_EXTRACT_MODEL / PHOTO_IMPORT_LAYOUT_MODEL.
 */

import { z } from "zod";
import { chat, type ChatMessage, type ContentBlock, type ToolUseBlock } from "@/lib/coach-ai/llm";
import { validateBBox, type NormalizedBBox } from "@/lib/coach-ai/image-crop";
import { buildExtractionTool, playExtractionSchema, TOOL_NAME, type PlayExtraction } from "./schema";
import { buildSystemPrompt, buildUserText } from "./prompt";

const EXTRACT_MODEL = process.env.PHOTO_IMPORT_EXTRACT_MODEL || "claude-opus-4-8";
const LAYOUT_MODEL = process.env.PHOTO_IMPORT_LAYOUT_MODEL || "claude-sonnet-5";

const LAYOUT_TOOL_NAME = "submit_sheet_layout";

export type DetectedPanel = { label: string; bbox: NormalizedBBox };

const layoutSchema = z
  .object({
    panels: z
      .array(
        z
          .object({
            label: z.string().min(1),
            bbox: z
              .object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() })
              .strict(),
          })
          .strict(),
      )
      .min(1)
      .max(24),
  })
  .strict();

const LAYOUT_SYSTEM = `You locate football play panels on a photographed play sheet.

The photo is either a single hand-drawn/printed play, or a sheet with multiple play panels arranged in a grid (printed exports typically have visible panel borders and a "Play N" label above each panel).

Rules:
- Return one entry per distinct play panel via the ${LAYOUT_TOOL_NAME} tool, in reading order (left-to-right, top-to-bottom).
- bbox values are fractions of the image in [0, 1]: x/y is the panel's top-left corner, w/h its size. Boxes must not extend past the image (x+w <= 1, y+h <= 1).
- Include the full panel: players, every route arrow, and the panel's label. Err slightly generous rather than tight.
- label: the panel's printed label when readable ("Play 7"), otherwise "Play N" by reading order.
- If the photo shows exactly one play (no grid), return a single panel covering the whole drawing.
- Skip headers, footers, logos, and empty cells.

Respond ONLY by calling ${LAYOUT_TOOL_NAME} once.`;

function buildLayoutTool() {
  return {
    name: LAYOUT_TOOL_NAME,
    description: "Submit the detected play panels. Call exactly once.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["panels"],
      properties: {
        panels: {
          type: "array",
          minItems: 1,
          maxItems: 24,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["label", "bbox"],
            properties: {
              label: { type: "string" },
              bbox: {
                type: "object",
                additionalProperties: false,
                required: ["x", "y", "w", "h"],
                properties: {
                  x: { type: "number" },
                  y: { type: "number" },
                  w: { type: "number" },
                  h: { type: "number" },
                },
              },
            },
          },
        },
      },
    },
  };
}

function imageBlock(base64: string, mediaType: string): ContentBlock {
  return { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } };
}

function findToolUse(content: ContentBlock[], name: string): ToolUseBlock | undefined {
  return content.find((b): b is ToolUseBlock => b.type === "tool_use" && b.name === name);
}

export async function detectPanels(opts: {
  base64: string;
  mediaType: string;
  userId: string;
}): Promise<{ ok: true; panels: DetectedPanel[] } | { ok: false; error: string }> {
  try {
    const result = await chat({
      system: LAYOUT_SYSTEM,
      modelOverride: LAYOUT_MODEL,
      maxTokens: 2000,
      thinkingBudget: 2000,
      tools: [buildLayoutTool()],
      usageContext: { userId: opts.userId, context: "photo_import_layout" },
      messages: [
        {
          role: "user",
          content: [
            imageBlock(opts.base64, opts.mediaType),
            { type: "text", text: "Locate every play panel on this photo." },
          ],
        },
      ],
    });

    const toolUse = findToolUse(result.message.content, LAYOUT_TOOL_NAME);
    if (!toolUse) return { ok: false, error: "The sheet reader didn't return a layout — try again." };
    const parsed = layoutSchema.safeParse(toolUse.input);
    if (!parsed.success) return { ok: false, error: "The sheet layout came back malformed — try again." };

    const panels = parsed.data.panels.filter((p) => validateBBox(p.bbox) === null);
    if (panels.length === 0) return { ok: false, error: "No readable play panels were found on the photo." };
    return { ok: true, panels };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Panel detection failed." };
  }
}

export async function extractPanel(opts: {
  cropBase64: string;
  mediaType: string;
  label: string;
  userId: string;
}): Promise<{ ok: true; extraction: PlayExtraction } | { ok: false; error: string }> {
  const baseUser: ChatMessage = {
    role: "user",
    content: [imageBlock(opts.cropBase64, opts.mediaType), { type: "text", text: buildUserText(opts.label) }],
  };
  let messages: ChatMessage[] = [baseUser];

  try {
    for (let attempt = 1; attempt <= 2; attempt++) {
      const result = await chat({
        system: buildSystemPrompt(),
        modelOverride: EXTRACT_MODEL,
        maxTokens: 4000,
        thinkingBudget: 8000,
        tools: [buildExtractionTool()],
        usageContext: { userId: opts.userId, context: "photo_import_extraction" },
        messages,
      });

      const toolUse = findToolUse(result.message.content, TOOL_NAME);
      if (toolUse) {
        const parsed = playExtractionSchema.safeParse(toolUse.input);
        if (parsed.success) return { ok: true, extraction: parsed.data };
        if (attempt === 2) {
          return { ok: false, error: "The play reader kept returning malformed output for this panel." };
        }
        messages = [
          baseUser,
          { role: "assistant", content: result.message.content },
          {
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: toolUse.id,
                is_error: true,
                content: `Validation failed:\n${parsed.error.message.slice(0, 1200)}\n\nCall ${TOOL_NAME} again with corrected input.`,
              },
            ],
          },
        ];
        continue;
      }

      if (attempt === 2) {
        return { ok: false, error: "The play reader couldn't produce a reading for this panel." };
      }
      messages = [
        baseUser,
        { role: "assistant", content: result.message.content },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `You must respond by calling the ${TOOL_NAME} tool exactly once. Call it now with your reading of the panel.`,
            },
          ],
        },
      ];
    }
    return { ok: false, error: "The play reader couldn't produce a reading for this panel." };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Extraction failed." };
  }
}
