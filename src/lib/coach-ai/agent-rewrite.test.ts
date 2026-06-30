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
import {
  applyAuthoritativeFenceRewrite,
  ensureToolFenceRendered,
  rescueOrStripFence,
} from "./agent";

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

describe("ensureToolFenceRendered — guarantee the tool's diagram shows", () => {
  const TOOL_FENCE =
    '{"title":"Tesla Counter","focus":"O","players":[{"id":"X","team":"O"},{"id":"CB","team":"D"}],"routes":[]}';

  it("appends the tool fence when Cal answered in prose with NO diagram", () => {
    // The 2026-06-30 bug: "show how cover 1 lines up + how they move" →
    // compose_defense ran, Cal narrated, but emitted no ```play block.
    const proseOnly = "**Man coverage — each defender mirrors their man.** @CB collects @X around 7–8 yards.";
    const out = ensureToolFenceRendered(proseOnly, TOOL_FENCE);
    expect(out).toContain(proseOnly); // prose preserved
    expect(out).toContain("```play\n" + TOOL_FENCE + "\n```"); // diagram appended
    // Exactly one fence — no duplication.
    expect(out.match(/```play/g)?.length).toBe(1);
  });

  it("leaves text untouched when it already has a ```play block (rewrite owns that)", () => {
    const withFence = "Here it is.\n\n```play\n{\"title\":\"Existing\"}\n```";
    expect(ensureToolFenceRendered(withFence, TOOL_FENCE)).toBe(withFence);
  });

  it("returns text unchanged when toolFenceBody is null/empty", () => {
    const prose = "Just prose.";
    expect(ensureToolFenceRendered(prose, null)).toBe(prose);
    expect(ensureToolFenceRendered(prose, "")).toBe(prose);
  });

  it("returns empty input unchanged", () => {
    expect(ensureToolFenceRendered("", TOOL_FENCE)).toBe("");
  });

  it("composes idempotently with the rewrite (no double fence)", () => {
    // The emit path runs rewrite THEN ensure. Prose-only input: rewrite is a
    // no-op, ensure appends. Re-running ensure must not append again.
    const proseOnly = "Narration only.";
    const once = ensureToolFenceRendered(
      applyAuthoritativeFenceRewrite(proseOnly, TOOL_FENCE),
      TOOL_FENCE,
    );
    const twice = ensureToolFenceRendered(
      applyAuthoritativeFenceRewrite(once, TOOL_FENCE),
      TOOL_FENCE,
    );
    expect(twice).toBe(once);
    expect(twice.match(/```play/g)?.length).toBe(1);
  });
});

describe("rescueOrStripFence — substitute tool fence first, strip only as fallback", () => {
  // Phase 4 fix (2026-05-25): eval suite surfaced that Cal frequently
  // calls compose_play correctly, then IGNORES its output and rebuilds
  // the play manually (place_offense + get_route_template per route).
  // Cal hand-authors the resulting fence; Phase 2b's gate catches it
  // twice and STRIPS the fence — coach sees a stripped reply with
  // prose only.
  //
  // The fix: when validation or provenance fails AFTER retry AND we
  // have a tool-emitted fence available this turn, SUBSTITUTE Cal's
  // hand-authored fence with the tool's authoritative version instead
  // of stripping. The tool fence is in approvedFences by construction
  // (the provenance tracker captured it on emission), so the
  // substituted reply ships cleanly.
  //
  // Strip remains the fallback for the case where no tool fence is
  // available (Cal hand-authored without ever calling a tool).

  const TOOL_FENCE = '{"title":"Snag Right","routes":[{"from":"Y","route_kind":"Spot"}]}';
  const CAL_HAND_AUTHORED =
    'Here is the play:\n```play\n{"title":"My Snag","routes":[]}\n```\nDetails below.';

  it("no rescue needed when neither gate failed (no-op)", () => {
    const result = rescueOrStripFence({
      text: CAL_HAND_AUTHORED,
      lastFenceFromTool: TOOL_FENCE,
      lastFenceToolName: "compose_play",
      validationFailedAfterRetry: false,
      provenanceFailedAfterRetry: false,
      validationErrors: [],
    });
    expect(result.rescued).toBe(false);
    expect(result.stripped).toBe(false);
    expect(result.text).toBe(CAL_HAND_AUTHORED);
  });

  it("rescues with tool fence when provenance failed after retry", () => {
    const result = rescueOrStripFence({
      text: CAL_HAND_AUTHORED,
      lastFenceFromTool: TOOL_FENCE,
      lastFenceToolName: "compose_play",
      validationFailedAfterRetry: false,
      provenanceFailedAfterRetry: true,
      validationErrors: [],
    });
    expect(result.rescued).toBe(true);
    expect(result.stripped).toBe(false);
    // The fence in textToEmit should now be the TOOL's, not Cal's.
    expect(result.text).toContain("Snag Right");
    expect(result.text).not.toContain('"title":"My Snag"');
    // Surrounding prose is preserved.
    expect(result.text).toContain("Here is the play:");
    expect(result.text).toContain("Details below.");
    // Logs the rescue for observability.
    expect(result.logLine).toContain("[coach-ai:rescue]");
    expect(result.logLine).toContain("compose_play");
    expect(result.logLine).toContain("provenance");
  });

  it("rescues with tool fence when validation failed after retry", () => {
    const result = rescueOrStripFence({
      text: CAL_HAND_AUTHORED,
      lastFenceFromTool: TOOL_FENCE,
      lastFenceToolName: "compose_play",
      validationFailedAfterRetry: true,
      provenanceFailedAfterRetry: false,
      validationErrors: ["missing actions for @C, @Y"],
    });
    expect(result.rescued).toBe(true);
    expect(result.stripped).toBe(false);
    expect(result.text).toContain("Snag Right");
    expect(result.logLine).toContain("validation");
  });

  it("strips when retry failed and NO tool fence is available", () => {
    const result = rescueOrStripFence({
      text: CAL_HAND_AUTHORED,
      lastFenceFromTool: null,
      lastFenceToolName: null,
      validationFailedAfterRetry: false,
      provenanceFailedAfterRetry: true,
      validationErrors: [],
    });
    expect(result.rescued).toBe(false);
    expect(result.stripped).toBe(true);
    // Fence removed. Prose remains (stripBrokenFences keeps the
    // surrounding text + adds a graceful apology marker).
    expect(result.text).not.toContain('"title":"My Snag"');
    expect(result.text).toContain("Here is the play:");
  });

  it("strips when retry failed and Cal's reply has NO fence to substitute", () => {
    const calNoFence = "Sorry, I couldn't compose that. Try a different angle.";
    const result = rescueOrStripFence({
      text: calNoFence,
      lastFenceFromTool: TOOL_FENCE,
      lastFenceToolName: "compose_play",
      validationFailedAfterRetry: true,
      provenanceFailedAfterRetry: false,
      validationErrors: ["missing routes"],
    });
    // The rescue attempt finds no fence in the text → no substitution.
    // Falls through to strip (which is itself a no-op here since
    // there's no fence to strip). Text passes through unchanged
    // except for the strip's apology overlay (only added when a
    // fence WAS present — so the calNoFence text comes back as-is).
    expect(result.rescued).toBe(false);
    expect(result.stripped).toBe(true);
    expect(result.text).toContain("couldn't compose");
  });

  it("does not log when no rescue or strip happens", () => {
    const result = rescueOrStripFence({
      text: "no fence here",
      lastFenceFromTool: null,
      lastFenceToolName: null,
      validationFailedAfterRetry: false,
      provenanceFailedAfterRetry: false,
      validationErrors: [],
    });
    expect(result.logLine).toBeNull();
  });
});
