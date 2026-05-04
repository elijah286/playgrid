/**
 * Tests for the overlap resolver in coachDiagramToPlayDocument.
 *
 * The resolver is what enforces "no two players visually overlap" at
 * persist time. It has three correctness properties this file pins:
 *
 *   1. OL-OL pairs are exempt — football linemen are SHOULDER-to-
 *      shoulder, and the rendered token diameter (~3.4yd on tackle_11)
 *      is wider than realistic OL splits (1-2yd). Forcing them apart
 *      either gives ahistorical wide spreads OR (the bug surfaced
 *      2026-05-01) leaves them oscillating with one stuck on top of
 *      a neighbor.
 *
 *   2. Non-OL same-team overlaps DO get resolved — slot stacking,
 *      back-on-OL collisions, etc. are pushed apart.
 *
 *   3. When resolution can't converge (3+ players in an unresolvable
 *      cluster, mutual anchors), the resolver THROWS rather than
 *      silently shipping a malformed diagram.
 *
 * Contract enforced here is the structural counterpart to AGENTS.md
 * Rule 5 ("make impossible by construction"): persisted diagrams CAN
 * NOT contain hidden visual overlaps among non-lineman players.
 */

import { describe, expect, it } from "vitest";
import {
  coachDiagramToPlayDocument,
  derivedColorGroupForLabel,
  PLAYBOOK_PALETTE,
  type CoachDiagram,
} from "./coachDiagramConverter";

function diagram(players: Array<{ id: string; x: number; y: number; team?: "O" | "D"; color?: string; role?: string }>): CoachDiagram {
  return {
    title: "Test",
    variant: "tackle_11",
    players: players.map((p) => ({ ...p, team: p.team ?? "O" })),
    routes: [],
  };
}

describe("overlap resolver — OL-OL exemption", () => {
  it("preserves all 5 OL at 2yd splits without nudging", () => {
    // The synthesizer's canonical tackle line. If the resolver tries to
    // "fix" these, LT and LG end up oscillating (the production bug).
    const doc = coachDiagramToPlayDocument(
      diagram([
        { id: "LT", x: -4, y: 0 },
        { id: "LG", x: -2, y: 0 },
        { id: "C",  x:  0, y: 0 },
        { id: "RG", x:  2, y: 0 },
        { id: "RT", x:  4, y: 0 },
        { id: "QB", x:  0, y: -5 },
      ]),
    );
    // Convert positions back to yards from center.
    const fieldWidthYds = doc.sportProfile.fieldWidthYds;
    const xYds = (norm: number) => (norm - 0.5) * fieldWidthYds;
    const byLabel = new Map(doc.layers.players.map((p) => [p.label, p]));
    expect(xYds(byLabel.get("LT")!.position.x)).toBeCloseTo(-4, 1);
    expect(xYds(byLabel.get("LG")!.position.x)).toBeCloseTo(-2, 1);
    expect(xYds(byLabel.get("C")!.position.x)).toBeCloseTo(0, 1);
    expect(xYds(byLabel.get("RG")!.position.x)).toBeCloseTo(2, 1);
    expect(xYds(byLabel.get("RT")!.position.x)).toBeCloseTo(4, 1);
  });

  it("regression: LT and LG do NOT end up at the same position", () => {
    // The production failure mode: LT at -4, LG nudged to -3.56 → a
    // pair indistinguishable in the rendered SVG. After the OL-exempt
    // change, both stay at their canonical positions.
    const doc = coachDiagramToPlayDocument(
      diagram([
        { id: "LT", x: -4, y: 0 },
        { id: "LG", x: -2, y: 0 },
        { id: "C",  x:  0, y: 0 },
        { id: "RG", x:  2, y: 0 },
        { id: "RT", x:  4, y: 0 },
      ]),
    );
    const lt = doc.layers.players.find((p) => p.label === "LT")!;
    const lg = doc.layers.players.find((p) => p.label === "LG")!;
    // Different normalized x (more than 1 yard apart on a 53yd field).
    const dxNorm = Math.abs(lt.position.x - lg.position.x);
    expect(dxNorm).toBeGreaterThan(1 / 53);
  });
});

describe("overlap resolver — non-OL pairs ARE resolved", () => {
  it("nudges a slot stacked on a back", () => {
    // Two non-linemen at the same (x, y) — must be separated.
    const doc = coachDiagramToPlayDocument(
      diagram([
        { id: "C",  x: 0, y: 0 },
        { id: "QB", x: 0, y: -5 },
        { id: "B",  x: -4, y: -5 },
        { id: "H",  x: -4, y: -5 }, // stacked on B
      ]),
    );
    const b = doc.layers.players.find((p) => p.label === "B")!;
    const h = doc.layers.players.find((p) => p.label === "H")!;
    const dxNorm = Math.abs(b.position.x - h.position.x);
    const dyNorm = Math.abs(b.position.y - h.position.y);
    // Resolved: at least 1 yard apart in normalized space.
    expect(Math.hypot(dxNorm, dyNorm)).toBeGreaterThan(1 / 53);
  });

  it("does not move QB or C even when colliding with a back", () => {
    // QB and C are anchored — a back placed on top of the QB should
    // be pushed aside, NOT have the QB move out from center.
    const doc = coachDiagramToPlayDocument(
      diagram([
        { id: "C",  x: 0, y: 0 },
        { id: "QB", x: 0, y: -5 },
        { id: "B",  x: 0, y: -5 }, // stacked on QB
      ]),
    );
    const qb = doc.layers.players.find((p) => p.label === "Q")!;
    const fieldWidthYds = doc.sportProfile.fieldWidthYds;
    const qbXYds = (qb.position.x - 0.5) * fieldWidthYds;
    expect(qbXYds).toBeCloseTo(0, 1); // QB stayed at center
  });

  it("regression: under-center QB on Singleback Y-Cross renders without throw", () => {
    // Production failure 2026-05-03: compose_play({ concept: "Y-Cross" })
    // emits Singleback formation with QB at (0, -1) directly behind C at
    // (0, 0). On flag_7v7 (fieldLengthYds=25) the 1yd gap normalizes to
    // 0.04, under the 0.067 overlap threshold. The resolver nudged the
    // (anchored) QB sideways into H, then the convergence-check threw
    // "Diagram failed to render". Anchored-anchored pairs must be exempt:
    // QB-on-C is intentional football geometry.
    expect(() =>
      coachDiagramToPlayDocument({
        title: "Y-Cross",
        variant: "flag_7v7",
        focus: "O",
        players: [
          { id: "C",  role: "C",  x: 0,   y: 0,  team: "O" },
          { id: "QB", role: "QB", x: 0,   y: -1, team: "O" },
          { id: "B",  role: "B",  x: 4,   y: -5, team: "O" },
          { id: "X",  role: "X",  x: -12, y: 0,  team: "O" },
          { id: "Y",  role: "Y",  x: 5,   y: 0,  team: "O" },
          { id: "Z",  role: "Z",  x: 12,  y: 0,  team: "O" },
          { id: "H",  role: "H",  x: 2,   y: -1, team: "O" },
        ],
        routes: [],
      }),
    ).not.toThrow();
  });

  it("under-center QB stays at C.x after resolution (does not get nudged)", () => {
    // Symmetric guarantee: even though the QB-C pair "appears" to overlap
    // by the normalized threshold, the resolver must NOT move the QB.
    // If it did, the under-center snap would render misaligned and any
    // nearby skill player (H in slot, B in pistol) would collide with it.
    const doc = coachDiagramToPlayDocument({
      title: "Under-center",
      variant: "flag_7v7",
      focus: "O",
      players: [
        { id: "C",  role: "C",  x: 0, y: 0,  team: "O" },
        { id: "QB", role: "QB", x: 0, y: -1, team: "O" },
        { id: "H",  role: "H",  x: 2, y: -1, team: "O" }, // would collide with a nudged QB
      ],
      routes: [],
    });
    const qb = doc.layers.players.find((p) => p.label === "Q")!;
    const fieldWidthYds = doc.sportProfile.fieldWidthYds;
    expect((qb.position.x - 0.5) * fieldWidthYds).toBeCloseTo(0, 2);
  });
});

describe("player color routing — role-keyed convention", () => {
  // Convention pinned 2026-05-03 by coach feedback: high-contrast
  // role-first defaults — RB purple, FB orange, slot family (S/A/H/F)
  // yellow. Backs separate from slots so a 7v7 default (Q/C/X/Y/Z/S/F-RB)
  // gets six distinct hues without a clash.

  function colorFor(label: string, role?: string): string {
    const doc = coachDiagramToPlayDocument(diagram([
      { id: "C", x: 0, y: 0 },
      { id: "QB", x: 0, y: -5 },
      { id: label, x: 5, y: 0, ...(role ? { role } : {}) },
    ]));
    // The third player is the one under test. Filter out C and Q since
    // the converter rewrites some raw labels (e.g. "RB" → "B" for display).
    const target = doc.layers.players.find((p) => p.label !== "Q" && p.label !== "C");
    return target?.style.fill ?? "";
  }

  it("X / X2 → red (#EF4444)", () => {
    expect(colorFor("X")).toBe("#EF4444");
    expect(colorFor("X2")).toBe(colorFor("X"));
  });

  it("Z / Z2 → blue (#3B82F6)", () => {
    expect(colorFor("Z")).toBe("#3B82F6");
    expect(colorFor("Z2")).toBe(colorFor("Z"));
  });

  it("Y → green (#22C55E)", () => {
    expect(colorFor("Y")).toBe("#22C55E");
  });

  it("slot family (S, A, H, F-as-WR) all → yellow (#FACC15)", () => {
    expect(colorFor("S")).toBe("#FACC15");
    expect(colorFor("A")).toBe("#FACC15");
    expect(colorFor("H")).toBe("#FACC15");
    expect(colorFor("H2")).toBe("#FACC15");
    expect(colorFor("F")).toBe("#FACC15"); // F without role=RB is a slot
    expect(colorFor("F2")).toBe("#FACC15");
  });

  it("F with role=RB → orange (lone back in 7v7 default formation)", () => {
    // 2026-05-04: backs moved from purple to orange so @C (now purple)
    // and @B/@HB stay distinct.
    expect(colorFor("F", "RB")).toBe("#F26522");
  });

  it("B / B2 / RB / HB → orange (#F26522) — primary back", () => {
    expect(colorFor("B")).toBe("#F26522");
    expect(colorFor("B2")).toBe("#F26522");
    expect(colorFor("RB")).toBe("#F26522");
    expect(colorFor("HB")).toBe("#F26522");
  });

  it("FB → orange (#F26522) — explicit fullback shares orange with primary back; relabel one when both on the field", () => {
    expect(colorFor("FB")).toBe("#F26522");
  });

  it("C → purple (#A855F7) — distinct from QB white", () => {
    // colorFor's fixture already contains a @C, so build a custom diagram
    // for this case.
    const doc = coachDiagramToPlayDocument(diagram([
      { id: "QB", x: 0, y: -5 },
      { id: "C", x: 0, y: 0 },
    ]));
    const c = doc.layers.players.find((p) => p.label === "C");
    expect(c?.style.fill).toBe("#A855F7");
  });

  it("preserves the FULL suffixed label for display (H2 not H)", () => {
    const doc = coachDiagramToPlayDocument(diagram([
      { id: "C", x: 0, y: 0 },
      { id: "H2", x: 5, y: 0 },
    ]));
    expect(doc.layers.players.find((p) => p.label === "H2")).toBeDefined();
  });
});

describe("derivedColorGroupForLabel — semantic groups", () => {
  // The chat-time validator's no-shared-color gate consumes this
  // helper. Pin the mapping so a tweak to the renderer's color
  // routing also forces a deliberate update here.
  it("maps standard receivers to their canonical groups", () => {
    expect(derivedColorGroupForLabel("X")).toBe("X");
    expect(derivedColorGroupForLabel("Y")).toBe("Y");
    expect(derivedColorGroupForLabel("Z")).toBe("Z");
  });

  it("collapses S, A, H, and F (no role) — plus digit-suffixed variants — into the SLOT group (yellow)", () => {
    expect(derivedColorGroupForLabel("S")).toBe("SLOT");
    expect(derivedColorGroupForLabel("A")).toBe("SLOT");
    expect(derivedColorGroupForLabel("H")).toBe("SLOT");
    expect(derivedColorGroupForLabel("H2")).toBe("SLOT");
    expect(derivedColorGroupForLabel("F")).toBe("SLOT");
    expect(derivedColorGroupForLabel("F2")).toBe("SLOT");
  });

  it("collapses B, HB, RB, and F-with-role-RB into the RB group (purple)", () => {
    expect(derivedColorGroupForLabel("B")).toBe("RB");
    expect(derivedColorGroupForLabel("B2")).toBe("RB");
    expect(derivedColorGroupForLabel("HB")).toBe("RB");
    expect(derivedColorGroupForLabel("RB")).toBe("RB");
    expect(derivedColorGroupForLabel("F", "RB")).toBe("RB");
  });

  it("FB → its own group (orange) so HB+FB both display distinctly", () => {
    expect(derivedColorGroupForLabel("FB")).toBe("FB");
  });

  it("treats QB, C, and linemen as their own exempt groups", () => {
    expect(derivedColorGroupForLabel("QB")).toBe("QB");
    expect(derivedColorGroupForLabel("Q")).toBe("QB");
    expect(derivedColorGroupForLabel("C")).toBe("C");
    expect(derivedColorGroupForLabel("LT")).toBe("LINEMAN");
    expect(derivedColorGroupForLabel("RG")).toBe("LINEMAN");
  });

  it("falls back to ROTATION for genuinely unknown labels", () => {
    expect(derivedColorGroupForLabel("XYZ")).toBe("ROTATION");
    expect(derivedColorGroupForLabel("WR1")).toBe("ROTATION");
  });
});

describe("explicit color override — honored on either side of the diagram", () => {
  // The override gate used to require isFocus === true (offense on an
  // offense-focused diagram). Loosened 2026-05-03 so coaches can
  // recolor any token via Cal's set_player_color mod — including
  // defenders on an offense-focused play.
  it("offense token honors player.color when offense-focused", () => {
    const doc = coachDiagramToPlayDocument({
      title: "Test",
      variant: "tackle_11",
      focus: "O",
      players: [
        { id: "C", x: 0, y: 0, team: "O" },
        { id: "QB", x: 0, y: -5, team: "O" },
        { id: "H", x: 5, y: 0, team: "O", color: PLAYBOOK_PALETTE.purple },
      ],
      routes: [],
    });
    const h = doc.layers.players.find((p) => p.label === "H");
    expect(h?.style.fill).toBe("#A855F7");
  });

  it("defender token now honors player.color on an offense-focused diagram (was: ignored)", () => {
    const doc = coachDiagramToPlayDocument({
      title: "Test",
      variant: "tackle_11",
      focus: "O",
      players: [
        { id: "C", x: 0, y: 0, team: "O" },
        { id: "QB", x: 0, y: -5, team: "O" },
        { id: "M", x: 0, y: 4, team: "D", color: PLAYBOOK_PALETTE.green },
      ],
      routes: [],
    });
    const m = doc.layers.players.find((p) => p.label === "M");
    expect(m?.style.fill).toBe("#22C55E");
  });

  it("non-overridden non-focus players keep the muted gray default", () => {
    const doc = coachDiagramToPlayDocument({
      title: "Test",
      variant: "tackle_11",
      focus: "O",
      players: [
        { id: "C", x: 0, y: 0, team: "O" },
        { id: "QB", x: 0, y: -5, team: "O" },
        { id: "M", x: 0, y: 4, team: "D" },
      ],
      routes: [],
    });
    const m = doc.layers.players.find((p) => p.label === "M");
    // STYLE_NON_FOCUS = #CBD5E1 — muted gray for non-focus side default.
    expect(m?.style.fill).toBe("#CBD5E1");
  });
});

describe("overlap resolver — no residual non-OL overlaps after resolution", () => {
  it("the full Spread Doubles tackle_11 layout has no non-OL overlaps", () => {
    // Real-world inputs: the synthesizer's Spread Doubles output. The
    // resolver should leave LT/LG/C/RG/RT untouched (OL-OL exempt),
    // and all other pairs at clear distance.
    const doc = coachDiagramToPlayDocument(
      diagram([
        { id: "LT", x: -4, y: 0 },
        { id: "LG", x: -2, y: 0 },
        { id: "C",  x:  0, y: 0 },
        { id: "RG", x:  2, y: 0 },
        { id: "RT", x:  4, y: 0 },
        { id: "QB", x:  0, y: -5 },
        { id: "B",  x: -4, y: -5 },
        { id: "X",  x: -18, y: 0 },
        { id: "H",  x: -11, y: -1 },
        { id: "Z",  x:  18, y: 0 },
        { id: "H2", x:  11, y: -1 },
      ]),
    );
    // Among non-OL players: every same-team pair must be > token-diameter
    // apart in normalized coords (allowing OL-OL exemption).
    const linemen = new Set(["LT", "LG", "RG", "RT", "C"]);
    const TOKEN_DIAMETER_NORM = 0.064;
    const players = doc.layers.players;
    for (let i = 0; i < players.length; i++) {
      for (let j = 0; j < i; j++) {
        const a = players[i];
        const b = players[j];
        if (linemen.has(a.label) && linemen.has(b.label)) continue;
        const dx = a.position.x - b.position.x;
        const dy = a.position.y - b.position.y;
        expect(
          Math.hypot(dx, dy),
          `non-OL pair (${a.label}, ${b.label}) overlaps in rendered space`,
        ).toBeGreaterThanOrEqual(TOKEN_DIAMETER_NORM);
      }
    }
  });
});
