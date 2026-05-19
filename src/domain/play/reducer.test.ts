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
});
