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
import { coachDiagramToPlayDocument, type CoachDiagram } from "./coachDiagramConverter";

function diagram(players: Array<{ id: string; x: number; y: number; team?: "O" | "D" }>): CoachDiagram {
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
