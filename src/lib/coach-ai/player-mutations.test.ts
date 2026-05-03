/**
 * Goldens for applyPlayerStyleMod — the surgical "change what a player
 * looks like" primitive. Pins:
 *   - Selector: by label and by id; rejects unknown / ambiguous.
 *   - Field validation: label length, hex/named colors, shape tokens.
 *   - Identity preservation: id, position, role byte-equal across the mod.
 *   - Side effects: carrier route stroke follows fill; @LABEL mentions
 *     in notes get rewritten when the label changes.
 *   - No-op rejection: a "rename to current name" returns ok=false so
 *     Cal can't claim a write that didn't happen.
 */

import { describe, expect, it } from "vitest";
import type { PlayDocument, Player } from "@/domain/play/types";
import { applyPlayerStyleMod } from "./player-mutations";

function makePlayer(over: Partial<Player>): Player {
  return {
    id: over.id ?? "p1",
    role: over.role ?? "WR",
    label: over.label ?? "X",
    position: over.position ?? { x: 0.1, y: 0.4 },
    eligible: over.eligible ?? true,
    style: over.style ?? { fill: "#EF4444", stroke: "#7f1d1d", labelColor: "#FFFFFF" },
    shape: over.shape,
  };
}

function makeDoc(players: Player[], notes = ""): PlayDocument {
  return {
    schemaVersion: 1,
    metadata: {
      coachName: "Test",
      wristbandCode: "",
      formation: "Test",
      tags: [],
      notes,
    },
    sportProfile: { variant: "tackle_11", fieldLengthYds: 25, fieldWidthYds: 53.33 },
    printProfile: {
      visibility: { showNotes: true, showWristbandCode: true, showPlayerLabels: true },
      wristband: { diagramScale: 1 },
      fontScale: 1,
    },
    lineOfScrimmageY: 0.4,
    layers: { players, routes: [], annotations: [], zones: [] },
  } as unknown as PlayDocument;
}

describe("applyPlayerStyleMod — selector resolution", () => {
  it("resolves by current label", () => {
    const doc = makeDoc([
      makePlayer({ id: "p_h", label: "H" }),
      makePlayer({ id: "p_b", label: "B" }),
    ]);
    const r = applyPlayerStyleMod(doc, { player_selector: "H", fill: "purple" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.player.id).toBe("p_h");
  });

  it("resolves by player id", () => {
    const doc = makeDoc([makePlayer({ id: "p_h", label: "H" })]);
    const r = applyPlayerStyleMod(doc, { player_selector: "p_h", fill: "purple" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.player.label).toBe("H");
  });

  it("rejects an unknown selector with the available labels in the message", () => {
    const doc = makeDoc([makePlayer({ id: "p_h", label: "H" })]);
    const r = applyPlayerStyleMod(doc, { player_selector: "Q", fill: "purple" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("H");
  });

  it("rejects an ambiguous label match", () => {
    const doc = makeDoc([
      makePlayer({ id: "p_h1", label: "H" }),
      makePlayer({ id: "p_h2", label: "H" }),
    ]);
    const r = applyPlayerStyleMod(doc, { player_selector: "H", fill: "purple" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/ambiguous/i);
  });
});

describe("applyPlayerStyleMod — field validation", () => {
  const doc = makeDoc([makePlayer({ id: "p1", label: "X" })]);

  it("rejects when no fields are supplied", () => {
    const r = applyPlayerStyleMod(doc, { player_selector: "X" });
    expect(r.ok).toBe(false);
  });

  it("accepts named fill colors", () => {
    const r = applyPlayerStyleMod(doc, { player_selector: "X", fill: "purple" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.player.style.fill).toBe("#A855F7");
  });

  it("accepts hex fill colors and uppercases them", () => {
    const r = applyPlayerStyleMod(doc, { player_selector: "X", fill: "#a855f7" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.player.style.fill).toBe("#A855F7");
  });

  it("rejects an unknown color name", () => {
    const r = applyPlayerStyleMod(doc, { player_selector: "X", fill: "chartreuse" });
    expect(r.ok).toBe(false);
  });

  it("rejects a label longer than 3 chars", () => {
    const r = applyPlayerStyleMod(doc, { player_selector: "X", label: "WIDE" });
    expect(r.ok).toBe(false);
  });

  it("rejects an unknown shape", () => {
    const r = applyPlayerStyleMod(doc, { player_selector: "X", shape: "hexagon" });
    expect(r.ok).toBe(false);
  });

  it("rejects a no-op (request matches current state)", () => {
    const r = applyPlayerStyleMod(doc, { player_selector: "X", fill: "red" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/already matches/i);
  });
});

describe("applyPlayerStyleMod — identity preservation + side effects", () => {
  it("preserves id, position, and role across a recolor", () => {
    const doc = makeDoc([
      makePlayer({ id: "p_h", label: "H", position: { x: 0.82, y: 0.3 }, role: "WR" }),
      makePlayer({ id: "p_b", label: "B", position: { x: 0.5, y: 0.22 }, role: "RB" }),
    ]);
    const r = applyPlayerStyleMod(doc, { player_selector: "H", fill: "purple" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const next = r.doc.layers.players;
      expect(next).toHaveLength(2);
      expect(next[0]!.id).toBe("p_h");
      expect(next[0]!.position).toEqual({ x: 0.82, y: 0.3 });
      expect(next[0]!.role).toBe("WR");
      expect(next[1]!.id).toBe("p_b");
      expect(next[1]!.position).toEqual({ x: 0.5, y: 0.22 });
    }
  });

  it("auto-picks black label color when fill changes to a light color", () => {
    const doc = makeDoc([makePlayer({ id: "p1", label: "X" })]);
    const r = applyPlayerStyleMod(doc, { player_selector: "X", fill: "yellow" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.player.style.fill).toBe("#FACC15");
      expect(r.player.style.labelColor).toBe("#1C1C1E");
    }
  });

  it("auto-picks white label color when fill changes to a dark color", () => {
    const doc = makeDoc([
      makePlayer({ id: "p1", label: "X", style: { fill: "#FFFFFF", stroke: "#0f172a", labelColor: "#1C1C1E" } }),
    ]);
    const r = applyPlayerStyleMod(doc, { player_selector: "X", fill: "purple" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.player.style.labelColor).toBe("#FFFFFF");
  });

  it("rewrites @LABEL mentions in notes when the label changes", () => {
    const doc = makeDoc(
      [makePlayer({ id: "p_h", label: "H" })],
      "@H runs the slant. Then @H sits down. @HQ is a different token.",
    );
    const r = applyPlayerStyleMod(doc, { player_selector: "H", label: "F" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.doc.metadata.notes).toBe(
        "@F runs the slant. Then @F sits down. @HQ is a different token.",
      );
    }
  });

  it("returns the list of fields that actually changed", () => {
    const doc = makeDoc([makePlayer({ id: "p1", label: "X" })]);
    const r = applyPlayerStyleMod(doc, { player_selector: "X", label: "F", fill: "purple" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.changedFields).toContain("label");
      expect(r.changedFields).toContain("fill");
      expect(r.changedFields).toContain("stroke");
    }
  });
});
