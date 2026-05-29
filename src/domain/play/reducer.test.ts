import { describe, expect, it } from "vitest";
import { applyCommand } from "./reducer";
import { createEmptyPlayDocument } from "./factory";

describe("applyCommand", () => {
  it("moves a player", () => {
    const doc = createEmptyPlayDocument();
    const pid = doc.layers.players[0].id;
    const next = applyCommand(doc, {
      type: "player.move",
      playerId: pid,
      position: { x: 0.2, y: 0.2 },
    });
    expect(next.layers.players.find((p) => p.id === pid)?.position).toEqual({
      x: 0.2,
      y: 0.2,
    });
  });

  it("flips horizontally", () => {
    const doc = createEmptyPlayDocument();
    const flipped = applyCommand(doc, { type: "document.flip", axis: "horizontal" });
    const p0 = doc.layers.players[0].position;
    const p1 = flipped.layers.players[0].position;
    expect(p1.x).toBeCloseTo(1 - p0.x, 5);
    expect(p1.y).toBeCloseTo(p0.y, 5);
  });

  describe("player.setShape — shape ↔ isHotRoute sync", () => {
    // Star shape and hot-route are the same concept: the renderer reads
    // `shape` to draw the star; Cal reads `isHotRoute` to mention the
    // call in notes. The reducer keeps them in lockstep so the toolbar's
    // unified shape popover (and FormationInspector) can dispatch a
    // single command without producing a contradictory state.

    it("setting shape to star marks the player as a hot route", () => {
      const doc = createEmptyPlayDocument();
      const pid = doc.layers.players[0].id;
      const next = applyCommand(doc, {
        type: "player.setShape",
        playerId: pid,
        shape: "star",
      });
      const p = next.layers.players.find((x) => x.id === pid);
      expect(p?.shape).toBe("star");
      expect(p?.isHotRoute).toBe(true);
    });

    it("setting shape to anything else clears the hot-route flag", () => {
      const doc = createEmptyPlayDocument();
      const pid = doc.layers.players[0].id;
      // first mark hot
      const hot = applyCommand(doc, {
        type: "player.setShape",
        playerId: pid,
        shape: "star",
      });
      // then switch to square — hot route should go away
      const next = applyCommand(hot, {
        type: "player.setShape",
        playerId: pid,
        shape: "square",
      });
      const p = next.layers.players.find((x) => x.id === pid);
      expect(p?.shape).toBe("square");
      expect(p?.isHotRoute).toBe(false);
    });
  });

  describe("badge text + visibility", () => {
    it("sets manual badge text and forces the badge visible", () => {
      const doc = createEmptyPlayDocument();
      const pid = doc.layers.players[0].id;
      const next = applyCommand(doc, { type: "player.setBadgeText", playerId: pid, text: "X" });
      const p = next.layers.players.find((x) => x.id === pid);
      expect(p?.badge).toBe("X");
      expect(p?.badgeHidden).toBe(false);
    });

    it("trims and caps badge text at 4 chars", () => {
      const doc = createEmptyPlayDocument();
      const pid = doc.layers.players[0].id;
      const next = applyCommand(doc, { type: "player.setBadgeText", playerId: pid, text: "  hotread  " });
      expect(next.layers.players.find((x) => x.id === pid)?.badge).toBe("hotr");
    });

    it("empty badge text clears the override and hides the badge", () => {
      const doc = createEmptyPlayDocument();
      const pid = doc.layers.players[0].id;
      const withBadge = applyCommand(doc, { type: "player.setBadgeText", playerId: pid, text: "A" });
      const cleared = applyCommand(withBadge, { type: "player.setBadgeText", playerId: pid, text: "  " });
      const p = cleared.layers.players.find((x) => x.id === pid);
      expect(p?.badge).toBeUndefined();
      expect(p?.badgeHidden).toBe(true);
    });

    it("hiding sets badgeHidden without losing the text", () => {
      const doc = createEmptyPlayDocument();
      const pid = doc.layers.players[0].id;
      const withBadge = applyCommand(doc, { type: "player.setBadgeText", playerId: pid, text: "A" });
      const hidden = applyCommand(withBadge, { type: "player.setBadgeVisible", playerId: pid, visible: false });
      const p = hidden.layers.players.find((x) => x.id === pid);
      expect(p?.badge).toBe("A");
      expect(p?.badgeHidden).toBe(true);
    });

    it("showing a player with no value seeds the next number", () => {
      const doc = createEmptyPlayDocument();
      const pid = doc.layers.players[0].id;
      const next = applyCommand(doc, { type: "player.setBadgeVisible", playerId: pid, visible: true });
      const p = next.layers.players.find((x) => x.id === pid);
      expect(p?.badge).toBe("1");
      expect(p?.badgeHidden).toBe(false);
    });
  });
});
