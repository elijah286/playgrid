/**
 * Layer 2 of the wrong-play-anchoring fix (2026-06-30).
 *
 * Layer 1 made the anchored play win over stale chat history as the defense
 * OVERLAY baseline, and used roster matching to tell "an edit of the anchored
 * play" from "a different play built in chat". That covers the compose-in-chat
 * case (all turns authored while viewing the same play). It does NOT cover the
 * NAVIGATION case: the coach discusses play A, navigates to play B, then says
 * "make this deeper" / "add a defense". A and B may share a roster, and edit
 * tools (revise_play, modify_play_route, flip_play) aren't routed through the
 * overlay resolver — so the most-recent fence (play A) would hijack the edit.
 *
 * Layer 2 threads a per-turn play id through history and scopes the fence
 * walk-backs to the play the coach is on NOW. A fence authored under a
 * different play is skipped; turns with an unknown (legacy) or lobby scope are
 * never excluded, so behavior degrades gracefully when the id is absent.
 */

import { describe, expect, it } from "vitest";
import { findPriorOffenseFenceJson, makePlayScopeFilter } from "./agent";
import type { ChatMessage } from "./llm";

const PLAY_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const PLAY_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

function offenseFence(title: string): string {
  return JSON.stringify({
    title,
    variant: "flag_5v5",
    players: [
      { id: "QB", x: 0, y: -5, team: "O" },
      { id: "C", x: 0, y: 0, team: "O" },
      { id: "X", x: -10, y: 0, team: "O" },
      { id: "Y", x: 4, y: 0, team: "O" },
      { id: "Z", x: 10, y: 0, team: "O" },
    ],
    routes: [],
  });
}

function assistantWithFence(fenceJson: string): ChatMessage {
  return { role: "assistant", content: [{ type: "text", text: "```play\n" + fenceJson + "\n```" }] };
}

describe("makePlayScopeFilter", () => {
  it("includes everything when no play is anchored", () => {
    const f = makePlayScopeFilter(null, [PLAY_A, PLAY_B]);
    expect(f(0)).toBe(true);
    expect(f(1)).toBe(true);
  });

  it("excludes turns authored under a different play", () => {
    const f = makePlayScopeFilter(PLAY_B, [PLAY_A, PLAY_B]);
    expect(f(0)).toBe(false); // authored on A
    expect(f(1)).toBe(true); // authored on B (current)
  });

  it("never excludes unknown (legacy/undefined) or lobby (null) scopes", () => {
    const f = makePlayScopeFilter(PLAY_B, [undefined as unknown as string | null, null]);
    expect(f(0)).toBe(true); // legacy turn, no id
    expect(f(1)).toBe(true); // lobby turn
  });

  it("treats a missing historyPlayIds array as all-unknown (no scoping)", () => {
    const f = makePlayScopeFilter(PLAY_B, undefined);
    expect(f(0)).toBe(true);
    expect(f(5)).toBe(true);
  });
});

describe("findPriorOffenseFenceJson with play scope", () => {
  // Coach discussed play A (built a fence), navigated to play B. The most-recent
  // offense fence in history belongs to A — it must NOT be returned while the
  // coach is on B.
  const history: ChatMessage[] = [
    { role: "user", content: "build me a play" },
    assistantWithFence(offenseFence("Play A")),
    { role: "user", content: "now make it deeper" }, // (asked after navigating to B)
  ];
  const historyPlayIds: (string | null)[] = [PLAY_A, PLAY_A, PLAY_B];

  it("skips a fence authored on a different play (navigation case)", () => {
    const scoped = makePlayScopeFilter(PLAY_B, historyPlayIds);
    expect(findPriorOffenseFenceJson(history, scoped)).toBeNull();
  });

  it("returns the fence when the coach is still on the play that authored it", () => {
    const scoped = makePlayScopeFilter(PLAY_A, historyPlayIds);
    expect(findPriorOffenseFenceJson(history, scoped)).toBe(offenseFence("Play A"));
  });

  it("returns the fence with no scoping (unchanged default behavior)", () => {
    expect(findPriorOffenseFenceJson(history)).toBe(offenseFence("Play A"));
  });

  it("degrades gracefully: legacy turns with no play id are still found", () => {
    const legacyIds: (string | null)[] = [null, null, PLAY_B];
    const scoped = makePlayScopeFilter(PLAY_B, legacyIds);
    // The fence turn has a null (unknown) scope → not excluded.
    expect(findPriorOffenseFenceJson(history, scoped)).toBe(offenseFence("Play A"));
  });
});
