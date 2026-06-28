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
 */

import { describe, expect, it } from "vitest";
import { extractAnchoredOffenseFence, resolveDefenseOverlayBaseline } from "./agent";

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

  it("prefers an in-chat offense fence over the anchored play (edits this chat must win)", () => {
    // Cal edited a route this chat (fresher than the pre-edit anchored diagram).
    const editedInChat = OFFENSE_DIAGRAM.replace("Mesh Right", "Mesh Right (edited)");
    const baseline = resolveDefenseOverlayBaseline({
      historyOffenseFence: editedInChat,
      anchoredOffenseFence: OFFENSE_DIAGRAM,
      anyHistoryFence: editedInChat,
    });
    expect(baseline).toBe(editedInChat);
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
