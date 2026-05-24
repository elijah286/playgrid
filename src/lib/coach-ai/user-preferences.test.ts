/**
 * Tests for the preference rendering infrastructure.
 *
 * These verify the contract: given a set of preferences, the rendered
 * prompt block contains the right text in the right shape. They do
 * NOT verify Cal's behavioral compliance (whether Cal actually
 * APPLIES the preferences) — that's an LLM eval (see
 * `evals/scenarios/coach-preference-defender-label.scenario.ts`).
 *
 * Splitting the contracts this way lets the deterministic
 * infrastructure test run in CI on every push while the
 * behavioral test runs against a real LLM on demand.
 */

import { describe, expect, it } from "vitest";
import { renderPreferencesBlock, type CoachPreference } from "./user-preferences";

describe("renderPreferencesBlock — defender label aliases", () => {
  it("renders a single defender label rename", () => {
    const prefs: CoachPreference[] = [
      { key: "defender_label_FS", value: "Free", scope: "user", note: null },
    ];
    const block = renderPreferencesBlock(prefs);
    expect(block).toContain("Player label aliases");
    expect(block).toContain("FS → Free");
    expect(block).toContain("REQUIRED on every diagram");
  });

  it("groups multiple label renames under the same header", () => {
    const prefs: CoachPreference[] = [
      { key: "defender_label_FS", value: "Free", scope: "user", note: null },
      { key: "defender_label_SS", value: "Strong", scope: "user", note: null },
      { key: "offense_label_Y", value: "TE", scope: "user", note: null },
    ];
    const block = renderPreferencesBlock(prefs);
    expect(block).toContain("FS → Free");
    expect(block).toContain("SS → Strong");
    expect(block).toContain("Y → TE");
    // Single header line — not duplicated per rename.
    const headerCount = block.match(/Player label aliases/g)?.length ?? 0;
    expect(headerCount).toBe(1);
  });

  it("tags playbook-scoped preferences with '(this playbook only)'", () => {
    const prefs: CoachPreference[] = [
      { key: "defender_label_FS", value: "Free", scope: "playbook", note: null },
    ];
    const block = renderPreferencesBlock(prefs);
    expect(block).toContain("FS → Free (this playbook only)");
  });
});

describe("renderPreferencesBlock — behavioral preferences", () => {
  it("renders behavioral preferences under a separate header", () => {
    const prefs: CoachPreference[] = [
      { key: "preferred_coverage", value: "Cover 3", scope: "user", note: null },
      { key: "preferred_front", value: "7v7 Zone", scope: "user", note: null },
    ];
    const block = renderPreferencesBlock(prefs);
    expect(block).toContain("Other preferences");
    expect(block).toContain("preferred_coverage: Cover 3");
    expect(block).toContain("preferred_front: 7v7 Zone");
  });

  it("renders behavioral + label preferences together with both headers", () => {
    const prefs: CoachPreference[] = [
      { key: "defender_label_FS", value: "Free", scope: "user", note: null },
      { key: "preferred_coverage", value: "Cover 3", scope: "user", note: null },
    ];
    const block = renderPreferencesBlock(prefs);
    expect(block).toContain("Player label aliases");
    expect(block).toContain("Other preferences");
    expect(block).toContain("FS → Free");
    expect(block).toContain("preferred_coverage: Cover 3");
  });
});

describe("renderPreferencesBlock — edge cases", () => {
  it("returns an empty string for null input", () => {
    expect(renderPreferencesBlock(null)).toBe("");
  });

  it("returns an empty string for empty array", () => {
    expect(renderPreferencesBlock([])).toBe("");
  });

  it("preserves the preferences-section header so downstream prompt edits don't accidentally strip it", () => {
    // The header is what tells Cal these are PREFERENCES (not random
    // notes). If a future prompt refactor moves the rendering
    // around and drops the header, Cal might not realize the rules
    // apply. This test pins the header text.
    const prefs: CoachPreference[] = [
      { key: "defender_label_FS", value: "Free", scope: "user", note: null },
    ];
    const block = renderPreferencesBlock(prefs);
    expect(block).toContain("Coach preferences");
    expect(block).toContain("apply these on every diagram");
  });
});
