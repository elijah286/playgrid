/**
 * Phase 2a — Server-side spec-block → play-fence rendering.
 *
 * Cal can emit `\`\`\`spec` blocks (containing PlaySpec JSON) in its reply.
 * Before the reply ships to the coach, this module renders each spec
 * block into a `\`\`\`play` block by piping the PlaySpec through the
 * canonical `playSpecToCoachDiagram` renderer.
 *
 * Why this matters: Cal CANNOT write coordinates by hand. The spec is
 * pure intent (formation name + per-player route assignments by family
 * and depth). The renderer is deterministic — every coordinate that
 * reaches the coach originated from the KG catalog, not from Cal.
 *
 * This is the structural fix for the "Cal hand-authored a fence and
 * got coordinates wrong" bug class that produced the patch cycle of
 * 2026-05-21 through 2026-05-24. With Phase 2b's complementary gate
 * (reject hand-authored `\`\`\`play` fences), Cal's only path to put
 * a play diagram on screen is to emit a spec and let the harness
 * render it.
 *
 * Spec block format Cal emits:
 *   \`\`\`spec
 *   { "schemaVersion": 2, "variant": "flag_5v5", "title": "Mesh",
 *     "playType": "offense",
 *     "formation": { "name": "Doubles", "strength": "right" },
 *     "assignments": [ ... ] }
 *   \`\`\`
 *
 * Resulting play block in coach's view:
 *   \`\`\`play
 *   { "title": "Mesh", "variant": "flag_5v5", "focus": "O",
 *     "players": [...], "routes": [...] }
 *   \`\`\`
 *
 * Errors surface as inline `> error:` annotations next to the block,
 * not as silently-dropped fences. A coach should never see a broken
 * spec block; instead they see a clear "I couldn't render this — try
 * different params" message and Cal gets a chance to retry.
 */

import { playSpecToCoachDiagram } from "@/domain/play/specRenderer";
import type { PlaySpec } from "@/domain/play/spec";

/** A single rendered block's outcome. */
export type SpecBlockRender =
  | { ok: true; fenceJson: string; warnings: string[] }
  | { ok: false; error: string };

const SPEC_FENCE_RE = /```spec\s*\n([\s\S]*?)\n```/g;

/**
 * Render every `\`\`\`spec` block in `text` to a `\`\`\`play` block.
 * Returns the rewritten text + a list of per-block outcomes (for
 * test assertions and error surfacing).
 *
 * Idempotent: calling twice on the same text is a no-op on the
 * second pass (the spec blocks have already been replaced with
 * play blocks, which the regex doesn't match).
 */
export function renderSpecBlocksToFences(text: string): {
  text: string;
  renders: SpecBlockRender[];
} {
  if (!text) return { text, renders: [] };
  const renders: SpecBlockRender[] = [];
  const rewritten = text.replace(SPEC_FENCE_RE, (_match, body: string) => {
    const trimmed = body.trim();
    let spec: PlaySpec;
    try {
      spec = JSON.parse(trimmed) as PlaySpec;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      renders.push({
        ok: false,
        error: `Spec block was not valid JSON: ${msg}`,
      });
      return [
        "```spec",
        trimmed,
        "```",
        "",
        `> _Could not render this spec — JSON parse error: ${msg}_`,
      ].join("\n");
    }
    try {
      const { diagram, warnings } = playSpecToCoachDiagram(spec);
      // Build the legacy `\`\`\`play` fence shape: { title, variant,
      // focus, players, routes, zones? } — same shape compose_play
      // returns today. Title + variant come from the spec; focus
      // defaults to "O" (offense) since the spec is offensive by
      // construction (defense overlays are not spec-rendered yet —
      // they continue to flow through compose_defense's tool fence).
      const fence = {
        title: spec.title ?? "Untitled",
        variant: spec.variant,
        focus: spec.playType === "defense" ? "D" as const : "O" as const,
        ...diagram,
      };
      const fenceJson = JSON.stringify(fence, null, 2);
      const warningStrs = warnings.map((w) => `[${w.code}] ${w.message}`);
      renders.push({ ok: true, fenceJson, warnings: warningStrs });
      return `\`\`\`play\n${fenceJson}\n\`\`\``;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      renders.push({
        ok: false,
        error: `Renderer threw: ${msg}`,
      });
      return [
        "```spec",
        trimmed,
        "```",
        "",
        `> _Could not render this spec: ${msg}_`,
      ].join("\n");
    }
  });
  return { text: rewritten, renders };
}

/**
 * Detect whether a body of text contains any `\`\`\`spec` blocks
 * (useful for the chat pipeline to decide whether to run the
 * renderer pass at all). Cheap pre-check.
 */
export function hasSpecBlocks(text: string): boolean {
  if (!text) return false;
  return /```spec\s*\n/.test(text);
}
