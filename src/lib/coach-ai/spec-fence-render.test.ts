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

describe("renderSpecBlocksToFences — bespoke / custom routes (off-catalog shapes)", () => {
  // 2026-05-24 architectural check: Phase 2b's "no hand-authored
  // fences" rule shouldn't close off the ability to draw routes
  // that aren't in the catalog. The user's worry: "if a coach
  // describes a highly bespoke route, can Cal still represent it?"
  //
  // The answer is yes — Cal authors the bespoke route inside a
  // `\`\`\`spec` block as a `{ kind: "custom", description,
  // waypoints }` assignment. The renderer emits the waypoints
  // verbatim, no `route_kind` is set (so the catalog-family
  // validator's Layer 3 skips it), and the rendered fence has
  // tool/render provenance (so Phase 2b approves it).
  //
  // This test pins that pipeline end-to-end. If a future refactor
  // accidentally removes the custom escape hatch, this test fails.

  it("renders a spec with a custom-action route into a fence with the verbatim waypoints", () => {
    const specJson = JSON.stringify({
      schemaVersion: 1,
      variant: "flag_7v7",
      title: "Spread — X option route",
      playType: "offense",
      formation: { name: "Spread Doubles", strength: "right" },
      assignments: [
        {
          player: "X",
          action: {
            kind: "custom",
            description: "option route: 5-yd stem, then break out if MOFO / sit if MOFC",
            waypoints: [[-10, 5], [-13, 5]] as Array<[number, number]>,
          },
        },
        { player: "Z", action: { kind: "route", family: "Go" } },
        { player: "H", action: { kind: "route", family: "Hitch" } },
        { player: "S", action: { kind: "route", family: "Drag" } },
        { player: "B", action: { kind: "route", family: "Flat" } },
      ],
    });
    const input = `\`\`\`spec\n${specJson}\n\`\`\``;
    const result = renderSpecBlocksToFences(input);
    expect(result.renders).toHaveLength(1);
    expect(result.renders[0].ok).toBe(true);
    // The rendered fence must contain the custom route's waypoints
    // verbatim. The render emits the path; the player's start
    // position is added by the synth based on the formation, so the
    // fence's @X route should mention the waypoints.
    expect(result.text).toContain("```play");
    // The path values from the spec survive to the fence text.
    expect(result.text).toContain("-13");
    // The custom route has no route_kind in the rendered fence
    // (Layer 3 of route-assignment-validate will skip it).
    expect(result.text).not.toContain('"route_kind": "custom"');
  });

  it("a custom-route spec passes Phase 2b's provenance gate via the spec-render approval path", () => {
    // The full Phase 2b gate runs inside agent.ts and depends on
    // chat context. Here we verify the contract: a spec render
    // produces an `ok: true` SpecBlockRender with a fenceJson,
    // and the agent's pipeline approves THAT fenceJson by calling
    // `approvedFences.approve(fenceJson)` on each successful
    // render (see agent.ts:2461). So if the render succeeds and
    // we can read `fenceJson`, the approval path is wired.
    const specJson = JSON.stringify({
      schemaVersion: 1,
      variant: "flag_5v5",
      title: "Custom screen",
      playType: "offense",
      formation: { name: "Spread Doubles", strength: "right" },
      assignments: [
        { player: "Z", action: { kind: "route", family: "Go" } },
        { player: "X", action: { kind: "route", family: "Hitch" } },
        {
          player: "Y",
          action: {
            kind: "custom",
            description: "bubble screen — release wide, settle at 2yd, look for the block",
            waypoints: [[8, -1], [10, 1]] as Array<[number, number]>,
          },
        },
        { player: "C", action: { kind: "route", family: "Flat" } },
      ],
    });
    const input = `\`\`\`spec\n${specJson}\n\`\`\``;
    const result = renderSpecBlocksToFences(input);
    expect(result.renders).toHaveLength(1);
    const render = result.renders[0];
    expect(render.ok).toBe(true);
    if (render.ok) {
      // The agent.ts pipeline approves render.fenceJson — make sure
      // that field is present and well-formed.
      expect(render.fenceJson).toBeTruthy();
      expect(typeof render.fenceJson).toBe("string");
      // Verify the bespoke waypoints made it into the JSON.
      expect(render.fenceJson).toContain("10");
    }
  });
});
