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
});
