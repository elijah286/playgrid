/**
 * Tests for the authoritative-tool-fence rewrite — the load-bearing
 * invariant that says "Cal does prose; tools do geometry." The rewrite
 * is the structural answer to Cal's persistent training-bias toward
 * "Mesh = both shallow drags": when compose_play returns a correct
 * fence (H@2 / S@8), Cal's emitted fence is replaced with the tool's
 * verbatim output before reaching the coach.
 *
 * Surfaced 2026-05-02 (twice in one screenshot stream): tool produced
 * staggered drags, Cal post-processed to both-at-2yd, validator caught
 * it but the retry turn streamed without rewrite.
 */

import { describe, expect, it } from "vitest";
import { applyAuthoritativeFenceRewrite } from "./agent";

describe("applyAuthoritativeFenceRewrite — replace Cal's fence with the tool's", () => {
  const TOOL_FENCE = '{"title":"Mesh","routes":[{"from":"H","path":[[-8.3,1],[12.9,1]]},{"from":"S","path":[[8.4,7],[-12.8,7]]}]}';

  it("replaces a fence with the same player ids but corrupted depths", () => {
    // Cal's "training bias" output: same routes but both drags at 2yd
    // (matching the prose's "shallow crossers" framing rather than the
    // catalog's required differentiation).
    const calBroken = `**Mesh.**\n\n\`\`\`play\n{"title":"Mesh","routes":[{"from":"H","path":[[-8.3,1],[12.9,1]]},{"from":"S","path":[[8.4,1],[-12.8,1]]}]}\n\`\`\`\n\nHigh-low read.`;
    const out = applyAuthoritativeFenceRewrite(calBroken, TOOL_FENCE);
    expect(out).toContain('"path":[[8.4,7],[-12.8,7]]');  // tool's S
    expect(out).not.toContain('"path":[[8.4,1],[-12.8,1]]'); // Cal's broken S
    expect(out).toContain("**Mesh.**");                  // prose preserved
    expect(out).toContain("High-low read.");             // tail preserved
  });

  it("returns text unchanged when there's no ```play fence", () => {
    const proseOnly = "**Mesh.** High-low read on the underneath defender.";
    expect(applyAuthoritativeFenceRewrite(proseOnly, TOOL_FENCE)).toBe(proseOnly);
  });

  it("returns text unchanged when toolFenceBody is null", () => {
    const calText = "**Mesh.**\n\n```play\n{\"foo\":1}\n```";
    expect(applyAuthoritativeFenceRewrite(calText, null)).toBe(calText);
  });

  it("returns text unchanged when toolFenceBody is empty string", () => {
    const calText = "**Mesh.**\n\n```play\n{\"foo\":1}\n```";
    expect(applyAuthoritativeFenceRewrite(calText, "")).toBe(calText);
  });

  it("returns text unchanged when input text is empty", () => {
    expect(applyAuthoritativeFenceRewrite("", TOOL_FENCE)).toBe("");
  });

  it("preserves the surrounding ```play markers exactly", () => {
    const input = "Before\n```play\nbroken\n```\nAfter";
    const out = applyAuthoritativeFenceRewrite(input, "good");
    expect(out).toBe("Before\n```play\ngood\n```\nAfter");
  });

  it("only replaces the FIRST ```play fence (existing behavior)", () => {
    // Cal occasionally emits two fences (a real one + an example). The
    // tool output corresponds to the primary fence; the second is left
    // alone. This pins the existing single-replace behavior so we
    // notice if it ever needs to change.
    const input = "```play\nfirst\n```\n```play\nsecond\n```";
    const out = applyAuthoritativeFenceRewrite(input, "AUTHORITATIVE");
    expect(out).toBe("```play\nAUTHORITATIVE\n```\n```play\nsecond\n```");
  });

  it("does NOT replace a ```play-ref fence (different language tag)", () => {
    const input = "```play-ref\n{\"id\":\"abc\"}\n```";
    const out = applyAuthoritativeFenceRewrite(input, "AUTHORITATIVE");
    expect(out).toBe(input);
  });
});
