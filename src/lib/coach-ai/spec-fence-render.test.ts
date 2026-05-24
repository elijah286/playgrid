/**
 * Phase 2a tests — spec-block → play-fence rendering.
 *
 * These pin the contract Cal will rely on once spec-only authoring is
 * the default mode: emit `\`\`\`spec`, get a deterministic `\`\`\`play`
 * fence at display time, never write coordinates by hand.
 */

import { describe, expect, it } from "vitest";
import { renderSpecBlocksToFences, hasSpecBlocks } from "./spec-fence-render";
import { generateConceptSkeleton } from "@/domain/play/conceptSkeleton";

describe("hasSpecBlocks", () => {
  it("returns false for text without spec blocks", () => {
    expect(hasSpecBlocks("Just some prose, no blocks.")).toBe(false);
    expect(hasSpecBlocks("```play\n{}\n```")).toBe(false);
    expect(hasSpecBlocks("")).toBe(false);
  });

  it("returns true when at least one spec block is present", () => {
    expect(hasSpecBlocks("\n```spec\n{}\n```\n")).toBe(true);
  });

  it("returns true for multiple spec blocks", () => {
    expect(hasSpecBlocks("```spec\n{}\n```\nmore text\n```spec\n{}\n```")).toBe(true);
  });
});

describe("renderSpecBlocksToFences — passthrough cases", () => {
  it("returns text unchanged when there are no spec blocks", () => {
    const input = "Here's a play I drew.\n\n```play\n{\"a\":1}\n```\n\nLet me know.";
    const { text, renders } = renderSpecBlocksToFences(input);
    expect(text).toBe(input);
    expect(renders).toEqual([]);
  });

  it("returns empty string for empty input", () => {
    const { text, renders } = renderSpecBlocksToFences("");
    expect(text).toBe("");
    expect(renders).toEqual([]);
  });
});

describe("renderSpecBlocksToFences — happy path with a canonical concept", () => {
  // Use compose_play's underlying skeleton generator to produce a real
  // PlaySpec for Mesh, then drop it into a spec block and verify the
  // renderer round-trips to the same fence shape compose_play would
  // emit today.
  const meshResult = generateConceptSkeleton("Mesh", { variant: "flag_7v7", strength: "right" });
  if (!meshResult.ok) {
    throw new Error(`generateConceptSkeleton failed for Mesh: ${meshResult.error}`);
  }
  const specJson = JSON.stringify(meshResult.spec, null, 2);

  it("renders a Mesh spec block to a play fence with players and routes", () => {
    const input = `Here's Mesh:\n\n\`\`\`spec\n${specJson}\n\`\`\`\n\nThat's the concept.`;
    const { text, renders } = renderSpecBlocksToFences(input);
    expect(renders).toHaveLength(1);
    expect(renders[0].ok).toBe(true);
    if (!renders[0].ok) return;
    // The spec block is gone; a play block is in its place.
    expect(text).not.toContain("```spec");
    expect(text).toContain("```play");
    // The play fence contains the expected fields.
    const playMatch = /```play\n([\s\S]*?)\n```/.exec(text);
    expect(playMatch).toBeDefined();
    if (!playMatch) return;
    const fence = JSON.parse(playMatch[1]);
    expect(fence.title).toBeDefined();
    expect(fence.variant).toBe("flag_7v7");
    expect(fence.focus).toBe("O");
    expect(Array.isArray(fence.players)).toBe(true);
    expect(fence.players.length).toBeGreaterThan(0);
    expect(Array.isArray(fence.routes)).toBe(true);
    expect(fence.routes.length).toBeGreaterThan(0);
  });

  it("preserves surrounding prose unchanged", () => {
    const input = `Setup prose.\n\n\`\`\`spec\n${specJson}\n\`\`\`\n\nClosing prose.`;
    const { text } = renderSpecBlocksToFences(input);
    expect(text).toContain("Setup prose.");
    expect(text).toContain("Closing prose.");
  });

  it("handles multiple spec blocks in one reply", () => {
    const smashResult = generateConceptSkeleton("Smash", { variant: "flag_7v7", strength: "right" });
    if (!smashResult.ok) throw new Error("Smash skeleton failed");
    const smashJson = JSON.stringify(smashResult.spec, null, 2);
    const input = `First play:\n\`\`\`spec\n${specJson}\n\`\`\`\n\nSecond play:\n\`\`\`spec\n${smashJson}\n\`\`\``;
    const { text, renders } = renderSpecBlocksToFences(input);
    expect(renders).toHaveLength(2);
    expect(renders.every((r) => r.ok)).toBe(true);
    // Two play blocks in the output, no spec blocks left.
    const playBlocks = text.match(/```play/g) ?? [];
    expect(playBlocks.length).toBe(2);
    expect(text).not.toContain("```spec");
  });
});

describe("renderSpecBlocksToFences — error handling", () => {
  it("surfaces a clear error for invalid JSON inside a spec block", () => {
    const input = "Spec:\n\n```spec\n{not valid json}\n```";
    const { text, renders } = renderSpecBlocksToFences(input);
    expect(renders).toHaveLength(1);
    expect(renders[0].ok).toBe(false);
    if (renders[0].ok) return;
    expect(renders[0].error).toMatch(/not valid JSON/);
    // The spec block is preserved + an inline error note is added.
    expect(text).toContain("```spec");
    expect(text).toContain("Could not render this spec");
    expect(text).toContain("JSON parse error");
  });

  it("surfaces a clear error when the renderer throws on a malformed spec", () => {
    // A spec missing required fields (e.g., no formation).
    const broken = JSON.stringify({
      schemaVersion: 2,
      variant: "flag_7v7",
      title: "Broken",
      playType: "offense",
      // formation missing
      assignments: [],
    });
    const input = `Bad spec:\n\n\`\`\`spec\n${broken}\n\`\`\``;
    const { text, renders } = renderSpecBlocksToFences(input);
    expect(renders).toHaveLength(1);
    // Either ok:false (renderer threw) OR ok:true with warnings.
    // The renderer is permissive in places; pin the observable: spec
    // block survived in some form, no silent loss.
    if (renders[0].ok) {
      // Renderer succeeded — at minimum it should be present in output.
      expect(text).toContain("```play");
    } else {
      expect(text).toContain("Could not render this spec");
    }
  });
});

describe("renderSpecBlocksToFences — idempotency", () => {
  it("running the renderer twice produces the same output as once", () => {
    const meshResult = generateConceptSkeleton("Mesh", { variant: "flag_7v7", strength: "right" });
    if (!meshResult.ok) throw new Error("Mesh skeleton failed");
    const specJson = JSON.stringify(meshResult.spec, null, 2);
    const input = `\`\`\`spec\n${specJson}\n\`\`\``;
    const once = renderSpecBlocksToFences(input);
    const twice = renderSpecBlocksToFences(once.text);
    // After the first pass, there are no spec blocks left — the
    // second pass is a no-op.
    expect(twice.renders).toEqual([]);
    expect(twice.text).toBe(once.text);
  });
});
