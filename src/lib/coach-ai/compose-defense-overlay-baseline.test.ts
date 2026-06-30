/**
 * Regression: "add a defense to my offensive play" must overlay onto the play
 * the coach has OPEN (the anchored play), not produce an offense-less defense
 * or silently rebuild a different play.
 *
 * Surfaced 2026-06-28 (coach feedback): "adding a defensive formation into an
 * offensive play ... doesn't respond well", while creating the defense first
 * and adding the offense after "responded better".
 *
 * Root cause: compose_defense's overlay branch needs an OFFENSE baseline to
 * preserve (Rule 11). The agent loop sourced that baseline ONLY from
 * chat-history ```play fences (findPriorOffenseFenceJson). But when the coach
 * opens an offensive play and asks for a defense in a fresh chat, the offense
 * lives in ctx.playDiagramText (the anchored diagram injected into the system
 * prompt) — NOT in history. So the baseline resolved to null and fell back to
 * the most-recent ANY fence (often a defense-only exploration), yielding an
 * overlay with zero offense — and the byte-preservation failures that follow
 * trigger the validator retry loop (the user-visible "very slow").
 *
 * Fix: extractAnchoredOffenseFence() exposes the anchored play as a baseline,
 * and resolveDefenseOverlayBaseline() slots it AFTER history-offense (so
 * edits made this chat still win) but BEFORE the any-fence fallback (so a
 * defense-only exploration never becomes the overlay target).
 *
 * Refined 2026-06-30 (coach feedback): the "history-offense always wins"
 * precedence broke when the in-chat offense fence was a DIFFERENT play than the
 * anchored one. A coach viewing "Tesla" asked to overlay a defense and got
 * "Stick Right" (a play built earlier in the same playbook-scoped thread)
 * because Stick Right was the most-recent offense fence in history. The
 * precedence is now roster-aware: an in-chat fence wins over the anchored play
 * ONLY when it carries the same offense roster (an edit of the same play);
 * a different play in history loses to the play actually on screen.
 */

import { describe, expect, it } from "vitest";
import {
  autoCorrectPriorFence,
  extractAnchoredOffenseFence,
  resolveDefenseOverlayBaseline,
} from "./agent";

const OFFENSE_DIAGRAM = JSON.stringify({
  title: "Mesh Right",
  variant: "flag_7v7",
  players: [
    { id: "QB", x: 0, y: -3, team: "O" },
    { id: "C", x: 0, y: 0, team: "O" },
    { id: "X", x: -12, y: 0, team: "O" },
    { id: "H", x: -6, y: 0, team: "O" },
    { id: "S", x: 6, y: 0, team: "O" },
    { id: "Z", x: 12, y: 0, team: "O" },
    { id: "B", x: 2, y: -2, team: "O" },
  ],
  routes: [{ from: "X", path: [[-8, 6]], route_kind: "drag" }],
});

const DEFENSE_ONLY_DIAGRAM = JSON.stringify({
  title: "4-3 Cover 3",
  variant: "flag_7v7",
  focus: "D",
  players: [
    { id: "CB", x: -10, y: 8, team: "D" },
    { id: "FS", x: 0, y: 14, team: "D" },
    { id: "M", x: 0, y: 5, team: "D" },
  ],
  routes: [],
});

describe("extractAnchoredOffenseFence", () => {
  it("returns the diagram when it contains offense players", () => {
    expect(extractAnchoredOffenseFence(OFFENSE_DIAGRAM)).toBe(OFFENSE_DIAGRAM.trim());
  });

  it("returns null for a defense-only anchored play (nothing to preserve)", () => {
    expect(extractAnchoredOffenseFence(DEFENSE_ONLY_DIAGRAM)).toBeNull();
  });

  it("returns null when no play is anchored", () => {
    expect(extractAnchoredOffenseFence(null)).toBeNull();
  });

  it("returns null for unparseable text", () => {
    expect(extractAnchoredOffenseFence("not json {")).toBeNull();
  });

  it("treats untagged players (no team field) as offense", () => {
    const untagged = JSON.stringify({ players: [{ id: "QB", x: 0, y: -3 }] });
    expect(extractAnchoredOffenseFence(untagged)).toBe(untagged.trim());
  });

  it("returns null when an anchored play has a defenders-and-offense mix but no offense", () => {
    const allDefense = JSON.stringify({ players: [{ id: "CB", x: 0, y: 8, team: "D" }] });
    expect(extractAnchoredOffenseFence(allDefense)).toBeNull();
  });
});

describe("resolveDefenseOverlayBaseline", () => {
  it("BUG REPRO: anchored offense + no history offense -> overlays onto the anchored play", () => {
    // Coach opened an offensive play and asked for a defense in a fresh chat.
    // The only prior fence is a defense-only exploration ("show me Cover 3").
    const baseline = resolveDefenseOverlayBaseline({
      historyOffenseFence: null,
      anchoredOffenseFence: OFFENSE_DIAGRAM,
      anyHistoryFence: DEFENSE_ONLY_DIAGRAM,
    });
    // Before the fix this resolved to DEFENSE_ONLY_DIAGRAM -> offense vanished.
    expect(baseline).toBe(OFFENSE_DIAGRAM);
  });

  it("prefers a SAME-ROSTER in-chat offense fence over the anchored play (edits this chat must win)", () => {
    // Cal edited a route this chat (fresher than the pre-edit anchored diagram).
    // Same players/ids — only the route changed — so it's the same play, edited.
    const editedInChat = OFFENSE_DIAGRAM.replace(
      '"route_kind":"drag"',
      '"route_kind":"corner"',
    ).replace("Mesh Right", "Mesh Right (edited)");
    const baseline = resolveDefenseOverlayBaseline({
      historyOffenseFence: editedInChat,
      anchoredOffenseFence: OFFENSE_DIAGRAM,
      anyHistoryFence: editedInChat,
    });
    expect(baseline).toBe(editedInChat);
  });

  it("BUG REPRO (Tesla, 2026-06-30): a DIFFERENT play in history loses to the anchored play", () => {
    // Coach is viewing "Tesla" (anchored). Earlier in the same playbook-scoped
    // thread they built "Stick Right", which is the most-recent offense fence.
    // The overlay must land on Tesla — the play on screen — not Stick Right.
    const stickRight = JSON.stringify({
      title: "Stick Right",
      variant: "flag_5v5",
      players: [
        { id: "C", x: 0, y: 0, team: "O" },
        { id: "QB", x: 0, y: -5, team: "O" },
        { id: "Y", x: 4, y: -5, team: "O" },
        { id: "X", x: -10, y: 0, team: "O" },
        { id: "Z", x: 10, y: 0, team: "O" },
      ],
      routes: [],
    });
    const baseline = resolveDefenseOverlayBaseline({
      historyOffenseFence: stickRight, // a DIFFERENT play than the anchored one
      anchoredOffenseFence: OFFENSE_DIAGRAM, // the play on screen
      anyHistoryFence: stickRight,
    });
    // Before the fix this resolved to stickRight — the wrong-play overlay.
    expect(baseline).toBe(OFFENSE_DIAGRAM);
  });

  it("falls back to any history fence when neither offense source exists", () => {
    const baseline = resolveDefenseOverlayBaseline({
      historyOffenseFence: null,
      anchoredOffenseFence: null,
      anyHistoryFence: DEFENSE_ONLY_DIAGRAM,
    });
    expect(baseline).toBe(DEFENSE_ONLY_DIAGRAM);
  });

  it("returns null when there is nothing to overlay onto", () => {
    expect(
      resolveDefenseOverlayBaseline({
        historyOffenseFence: null,
        anchoredOffenseFence: null,
        anyHistoryFence: null,
      }),
    ).toBeNull();
  });
});

describe("autoCorrectPriorFence — fabrication guard, not baseline-enforcer", () => {
  const ANCHORED = OFFENSE_DIAGRAM; // Tesla, on screen
  const HISTORY_DIFFERENT = JSON.stringify({
    title: "Stick Right",
    players: [
      { id: "C", x: 0, y: 0, team: "O" },
      { id: "QB", x: 0, y: -5, team: "O" },
      { id: "Y", x: 4, y: -5, team: "O" },
      { id: "X", x: -10, y: 0, team: "O" },
      { id: "Z", x: 10, y: 0, team: "O" },
    ],
    routes: [],
  });

  it("injects the baseline when Cal omits on_play", () => {
    const out = autoCorrectPriorFence("compose_defense", { front: "4-3", coverage: "Cover 1" }, ANCHORED, [
      HISTORY_DIFFERENT,
    ]);
    expect(out.on_play).toBe(ANCHORED);
  });

  it("keeps Cal's on_play when it matches the baseline roster (the anchored play)", () => {
    const out = autoCorrectPriorFence(
      "compose_defense",
      { on_play: ANCHORED, coverage: "Cover 1" },
      ANCHORED,
      [HISTORY_DIFFERENT],
    );
    expect(out.on_play).toBe(ANCHORED);
  });

  it("keeps Cal's on_play when it matches a real-but-different play (compose-then-overlay without navigating)", () => {
    // Baseline resolved to the anchored play, but Cal legitimately targets a
    // different real play it composed in chat. The guard must NOT clobber it.
    const out = autoCorrectPriorFence(
      "compose_defense",
      { on_play: HISTORY_DIFFERENT, coverage: "Cover 1" },
      ANCHORED, // baseline = anchored
      [HISTORY_DIFFERENT], // but this is also a known-real fence
    );
    expect(out.on_play).toBe(HISTORY_DIFFERENT);
  });

  it("overwrites a fabricated on_play that matches no real fence", () => {
    const fabricated = JSON.stringify({
      title: "Made Up",
      players: [
        { id: "A", x: 0, y: 0, team: "O" },
        { id: "B", x: 1, y: 0, team: "O" },
        { id: "QB", x: 0, y: -5, team: "O" },
      ],
      routes: [],
    });
    const out = autoCorrectPriorFence(
      "compose_defense",
      { on_play: fabricated, coverage: "Cover 1" },
      ANCHORED,
      [HISTORY_DIFFERENT],
    );
    expect(out.on_play).toBe(ANCHORED);
  });
});
