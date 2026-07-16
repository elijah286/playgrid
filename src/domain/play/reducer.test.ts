import { describe, expect, it } from "vitest";
import { applyCommand, defensiveSwapDiscards } from "./reducer";
import { createEmptyPlayDocument, defaultDefendersForVariant } from "./factory";
import type { Player } from "./types";

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

describe("document.replaceDefensiveFormation", () => {
  /** A defensive play: defenders in doc.layers.players, a coverage drawn on
   *  top (zones + a blitz path). Mirrors what a coach actually has on screen
   *  before they change the formation. */
  function defensivePlay() {
    const doc = createEmptyPlayDocument({ metadata: { playType: "defense" } as never });
    const defenders = defaultDefendersForVariant("flag_5v5");
    return {
      ...doc,
      metadata: { ...doc.metadata, playType: "defense" as const },
      layers: {
        ...doc.layers,
        players: defenders,
        routes: [
          {
            id: "r_blitz",
            carrierPlayerId: defenders[0].id,
            kind: "path" as const,
            nodes: [
              { id: "n1", position: { x: 0.5, y: 0.5 } },
              { id: "n2", position: { x: 0.5, y: 0.3 } },
            ],
          },
        ] as never,
        zones: [
          {
            id: "z_flat",
            kind: "ellipse" as const,
            center: { x: 0.2, y: 0.55 },
            size: { w: 0.1, h: 0.08 },
            label: "Flat L",
            style: { fill: "#0002", stroke: "#000" },
          },
        ] as never,
      },
    };
  }

  const target: Player[] = [
    { id: "def_cb", role: "CB", label: "CB", position: { x: 0.15, y: 0.56 }, eligible: false, shape: "triangle" as const, style: { fill: "#EF4444", stroke: "#991b1b", labelColor: "#fff" } },
    { id: "def_fs", role: "S", label: "FS", position: { x: 0.5, y: 0.8 }, eligible: false, shape: "triangle" as const, style: { fill: "#EF4444", stroke: "#991b1b", labelColor: "#fff" } },
  ];

  it("replaces the defenders wholesale — a front change is a personnel change, not a move", () => {
    const doc = defensivePlay();
    const next = applyCommand(doc, {
      type: "document.replaceDefensiveFormation",
      formationId: "f1",
      formationName: "Cover 2",
      players: target,
      formationLosY: 0.4,
    });
    // The old defenders are gone entirely — not repositioned, not merged.
    expect(next.layers.players.map((p) => p.id)).toEqual(["def_cb", "def_fs"]);
  });

  it("installs the TARGET coverage's zones — swapping to Cover 2 draws Cover 2", () => {
    // Swapping must give the same picture as creating a play from this
    // formation. Clearing instead would make one formation mean two different
    // things depending on how the coach arrived at it.
    const doc = defensivePlay();
    expect(doc.layers.zones).toHaveLength(1); // the OLD front's coverage
    const targetZones = [
      { id: "z_deep_l", kind: "ellipse" as const, center: { x: 0.3, y: 0.85 }, size: { w: 0.2, h: 0.1 }, label: "Deep 1/2 L", style: { fill: "#0002", stroke: "#000" } },
      { id: "z_deep_r", kind: "ellipse" as const, center: { x: 0.7, y: 0.85 }, size: { w: 0.2, h: 0.1 }, label: "Deep 1/2 R", style: { fill: "#0002", stroke: "#000" } },
    ];
    const next = applyCommand(doc, {
      type: "document.replaceDefensiveFormation",
      formationId: "f1",
      formationName: "Cover 2",
      players: target,
      zones: targetZones as never,
      formationLosY: 0.4,
    });
    expect(next.layers.zones?.map((z) => z.label)).toEqual(["Deep 1/2 L", "Deep 1/2 R"]);
    expect(next.layers.zones).not.toContainEqual(expect.objectContaining({ label: "Flat L" }));
  });

  it("leaves a bare front when the target has no coverage (man, or coach-drawn)", () => {
    const doc = defensivePlay();
    const next = applyCommand(doc, {
      type: "document.replaceDefensiveFormation",
      formationId: "f1",
      formationName: "Cover 0",
      players: target,
      formationLosY: 0.4,
    });
    expect(next.layers.zones).toEqual([]);
  });

  it("drops defender paths — routes are keyed to carriers that no longer exist", () => {
    const doc = defensivePlay();
    expect(doc.layers.routes).toHaveLength(1);
    const next = applyCommand(doc, {
      type: "document.replaceDefensiveFormation",
      formationId: "f1",
      formationName: "Cover 2",
      players: target,
      formationLosY: 0.4,
    });
    expect(next.layers.routes).toEqual([]);
  });

  it("links the formation and clears any drift tag", () => {
    const doc = {
      ...defensivePlay(),
      metadata: { ...defensivePlay().metadata, formationTag: "Press" },
    };
    const next = applyCommand(doc, {
      type: "document.replaceDefensiveFormation",
      formationId: "f1",
      formationName: "Cover 2",
      players: target,
      formationLosY: 0.4,
    });
    expect(next.metadata.formationId).toBe("f1");
    expect(next.metadata.formation).toBe("Cover 2");
    expect(next.metadata.formationTag).toBeNull();
  });

  it("refuses on a non-defensive play rather than deleting the offense", () => {
    // The wholesale replace is only safe because a defensive play contains
    // nothing but defenders. On an offensive play it would wipe the players.
    const doc = createEmptyPlayDocument();
    const before = doc.layers.players.map((p) => p.id);
    const next = applyCommand(doc, {
      type: "document.replaceDefensiveFormation",
      formationId: "f1",
      formationName: "Cover 2",
      players: target,
      formationLosY: 0.4,
    });
    expect(next).toBe(doc);
    expect(next.layers.players.map((p) => p.id)).toEqual(before);
  });

  it("transforms positions through yards-from-LOS when the play's LOS differs", () => {
    const doc = { ...defensivePlay(), lineOfScrimmageY: 0.5 };
    const next = applyCommand(doc, {
      type: "document.replaceDefensiveFormation",
      formationId: "f1",
      formationName: "Cover 2",
      players: target,
      formationLosY: 0.4,
    });
    // def_cb sits 0.16 above a 0.4 LOS = 4 yds downfield in a 25-yd window.
    // Against a 0.5 LOS on a 25-yd field that lands at 0.5 + 4/25 = 0.66.
    const cb = next.layers.players.find((p) => p.id === "def_cb")!;
    expect(cb.position.y).toBeCloseTo(0.66, 5);
    expect(cb.position.x).toBe(0.15); // x is width-relative — untransformed
  });
});

describe("defensiveSwapDiscards", () => {
  it("reports nothing to lose on a fresh play, so the UI can skip the warning", () => {
    const doc = createEmptyPlayDocument({ metadata: { playType: "defense" } as never });
    const d = defensiveSwapDiscards({ ...doc, layers: { ...doc.layers, routes: [], zones: [] } });
    expect(d.any).toBe(false);
    expect(d.defenderPaths).toBe(0);
  });

  it("does NOT warn about zones — they are replaced by the target's, not lost", () => {
    // Most zones on a defensive play were installed by us at creation, not
    // drawn by the coach. Warning about them would be untrue AND would nag on
    // every single swap, which is how confirms get trained away.
    const doc = createEmptyPlayDocument({ metadata: { playType: "defense" } as never });
    const zonesOnly = {
      ...doc,
      layers: {
        ...doc.layers,
        routes: [],
        zones: [{ id: "z1", kind: "ellipse", center: { x: 0.5, y: 0.5 }, size: { w: 0.1, h: 0.1 }, label: "Hook", style: { fill: "#0002", stroke: "#000" } }] as never,
      },
    };
    expect(defensiveSwapDiscards(zonesOnly).any).toBe(false);
  });

  it("counts defender paths so the confirm can name what's lost", () => {
    const doc = createEmptyPlayDocument();
    const withWork = {
      ...doc,
      layers: {
        ...doc.layers,
        routes: [{ id: "r1", carrierPlayerId: "d1", kind: "path", nodes: [] }] as never,
        zones: [{ id: "z1", kind: "ellipse", center: { x: 0.5, y: 0.5 }, size: { w: 0.1, h: 0.1 }, label: "Hook", style: { fill: "#0002", stroke: "#000" } }] as never,
      },
    };
    const d = defensiveSwapDiscards(withWork);
    expect(d).toEqual({ defenderPaths: 1, any: true });
  });
});
