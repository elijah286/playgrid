/**
 * Goldens for the defensive-render sanitizer.
 *
 * Pins the structural contract of `sanitizeCoachDiagram`:
 *   - Every corruption case from production has a regression test.
 *   - The sanitizer is PURE — same input → same output, no randomness.
 *   - Warnings are stable identifiers; tests assert on `code` so
 *     refactors that rephrase the message don't break tests.
 *
 * Add a new test here whenever a coach surfaces a render bug. The
 * sanitizer is the last line of defense; if a corruption case can
 * reach the renderer, the sanitizer must catch it.
 */

import { describe, expect, it } from "vitest";
import { sanitizeCoachDiagram } from "./sanitize";
import type { CoachDiagram } from "@/features/coach-ai/coachDiagramConverter";

function baseDiagram(overrides: Partial<CoachDiagram> = {}): CoachDiagram {
  return {
    title: "Test",
    variant: "tackle_11",
    players: [
      { id: "Q", x: 0,   y: -3, team: "O" },
      { id: "X", x: -18, y: 0,  team: "O" },
      { id: "Z", x: 18,  y: 0,  team: "O" },
    ],
    routes: [],
    zones: [],
    ...overrides,
  };
}

describe("sanitize — purity + idempotence", () => {
  it("returns clean diagram unchanged with no warnings", () => {
    const input = baseDiagram();
    const result = sanitizeCoachDiagram(input);
    expect(result.warnings).toHaveLength(0);
    expect(result.diagram.players).toHaveLength(3);
  });

  it("is idempotent — sanitizing twice produces the same output", () => {
    const input = baseDiagram();
    const r1 = sanitizeCoachDiagram(input);
    const r2 = sanitizeCoachDiagram(r1.diagram);
    expect(r2.diagram).toEqual(r1.diagram);
    expect(r2.warnings).toHaveLength(0);
  });

  it("does not mutate the input diagram", () => {
    const input = baseDiagram({
      players: [
        { id: "Q", x: 0, y: -3, team: "O" },
        { id: "X", x: -5, y: 0, team: "O" },
      ],
      zones: [
        { kind: "rectangle", center: [200, 10], size: [10, 6], label: "Drift" },
      ],
    });
    const playersRef = input.players;
    const zonesRef = input.zones;
    sanitizeCoachDiagram(input);
    // The input object's arrays are the same reference (we didn't
    // touch them); the zone's center is unchanged in the original.
    expect(input.players).toBe(playersRef);
    expect(input.zones).toBe(zonesRef);
    expect(input.zones![0].center).toEqual([200, 10]);
  });
});

describe("sanitize — zones (the image-3 production case)", () => {
  it("DROPS a zone whose size exceeds the field width", () => {
    // 2026-05-02 image 3: Cal emitted a Flood Left with a single
    // zone covering the entire field — purple paint everywhere.
    // The sanitizer must drop oversize zones before display.
    const result = sanitizeCoachDiagram(
      baseDiagram({
        zones: [
          { kind: "rectangle", center: [0, 10], size: [100, 25], label: "Hook" },
        ],
      }),
    );
    expect(result.diagram.zones).toHaveLength(0);
    expect(result.warnings.some((w) => w.code === "zone_dropped_oversized")).toBe(true);
  });

  it("DROPS a zone with NaN in center", () => {
    const result = sanitizeCoachDiagram(
      baseDiagram({
        zones: [
          { kind: "rectangle", center: [NaN, 10], size: [10, 8], label: "Bad" },
        ],
      }),
    );
    expect(result.diagram.zones).toHaveLength(0);
    expect(result.warnings.some((w) => w.code === "zone_dropped_nonfinite")).toBe(true);
  });

  it("DROPS a zone with non-positive size", () => {
    const result = sanitizeCoachDiagram(
      baseDiagram({
        zones: [
          { kind: "rectangle", center: [0, 10], size: [0, 8], label: "ZeroW" },
          { kind: "rectangle", center: [0, 10], size: [10, -1], label: "NegH" },
        ],
      }),
    );
    expect(result.diagram.zones).toHaveLength(0);
    expect(result.warnings.filter((w) => w.code === "zone_dropped_nonfinite").length).toBe(2);
  });

  it("KEEPS a normal zone (10×6 hook zone at midfield)", () => {
    const result = sanitizeCoachDiagram(
      baseDiagram({
        zones: [
          { kind: "rectangle", center: [0, 10], size: [10, 6], label: "Hook" },
        ],
      }),
    );
    expect(result.diagram.zones).toHaveLength(1);
    expect(result.warnings).toHaveLength(0);
  });

  it("CLAMPS a zone whose center is wildly off-field", () => {
    const result = sanitizeCoachDiagram(
      baseDiagram({
        zones: [
          { kind: "rectangle", center: [200, 10], size: [10, 6], label: "Drift" },
        ],
      }),
    );
    expect(result.diagram.zones).toHaveLength(1);
    expect(result.diagram.zones![0].center[0]).toBe(53 / 2); // tackle_11 half-width = 26.5
    expect(result.warnings.some((w) => w.code === "zone_center_clamped")).toBe(true);
  });

  it("variant determines field width — flag_5v5 (25yd wide) drops a 30yd zone", () => {
    const result = sanitizeCoachDiagram(
      baseDiagram({
        variant: "flag_5v5",
        zones: [
          { kind: "rectangle", center: [0, 10], size: [30, 6], label: "TooWide" },
        ],
      }),
    );
    expect(result.diagram.zones).toHaveLength(0);
    expect(result.warnings.some((w) => w.code === "zone_dropped_oversized")).toBe(true);
  });
});

describe("sanitize — players", () => {
  it("DROPS a player with NaN x/y", () => {
    const result = sanitizeCoachDiagram(
      baseDiagram({
        players: [
          { id: "Q", x: 0,   y: -3, team: "O" },
          { id: "X", x: NaN, y: 0,  team: "O" },
        ],
      }),
    );
    expect(result.diagram.players.find((p) => p.id === "X")).toBeUndefined();
    expect(result.warnings.some((w) => w.code === "player_dropped_nonfinite" && w.subject === "X")).toBe(true);
  });

  it("DROPS a player whose position is way outside the field", () => {
    const result = sanitizeCoachDiagram(
      baseDiagram({
        players: [
          { id: "Q",     x: 0,   y: -3,  team: "O" },
          { id: "GHOST", x: 500, y: 200, team: "O" },
        ],
      }),
    );
    expect(result.diagram.players.find((p) => p.id === "GHOST")).toBeUndefined();
    expect(result.warnings.some((w) => w.code === "player_dropped_out_of_bounds" && w.subject === "GHOST")).toBe(true);
  });

  it("NUDGES the second of two non-OL players that overlap", () => {
    const result = sanitizeCoachDiagram(
      baseDiagram({
        players: [
          { id: "Q",  x: 0,   y: -3, team: "O" },
          { id: "H",  x: -10, y: -1, team: "O" },
          { id: "H2", x: -10, y: -1, team: "O" }, // overlaps H
        ],
      }),
    );
    expect(result.diagram.players).toHaveLength(3);
    const h = result.diagram.players.find((p) => p.id === "H")!;
    const h2 = result.diagram.players.find((p) => p.id === "H2")!;
    expect(h.x).toBe(-10);
    expect(h2.x).not.toBe(-10);
    expect(result.warnings.some((w) => w.code === "player_overlap_nudged" && w.subject === "H2")).toBe(true);
  });

  it("does NOT nudge OL pairs (LT/LG/C/RG/RT) since real splits are tight", () => {
    // The OL validator already enforces correct OL spacing. The
    // sanitizer must not interfere — nudging a tight LG-C pair
    // would corrupt a correct formation.
    const result = sanitizeCoachDiagram(
      baseDiagram({
        players: [
          { id: "LT", x: -4, y: 0, team: "O" },
          { id: "LG", x: -2, y: 0, team: "O" },
          { id: "C",  x:  0, y: 0, team: "O" },
        ],
      }),
    );
    expect(result.warnings.filter((w) => w.code === "player_overlap_nudged")).toHaveLength(0);
  });

  it("offense + defense at the same position is NOT flagged (mirroring is legal)", () => {
    const result = sanitizeCoachDiagram(
      baseDiagram({
        players: [
          { id: "X",   x: -18, y: 0, team: "O" },
          { id: "CB1", x: -18, y: 5, team: "D" },
        ],
      }),
    );
    expect(result.warnings.filter((w) => w.code === "player_overlap_nudged")).toHaveLength(0);
  });
});

describe("sanitize — routes", () => {
  it("DROPS a route whose carrier doesn't exist", () => {
    const result = sanitizeCoachDiagram(
      baseDiagram({
        routes: [
          { from: "GHOST", path: [[0, 5]] },
        ],
      }),
    );
    expect(result.diagram.routes).toHaveLength(0);
    expect(result.warnings.some((w) => w.code === "route_dropped_unknown_carrier")).toBe(true);
  });

  it("DROPS a route whose carrier was dropped by an earlier pass (NaN position)", () => {
    const result = sanitizeCoachDiagram(
      baseDiagram({
        players: [
          { id: "Q", x: 0,   y: -3, team: "O" },
          { id: "X", x: NaN, y: 0,  team: "O" }, // dropped by player pass
        ],
        routes: [
          { from: "X", path: [[0, 5]] }, // dropped because X is gone
        ],
      }),
    );
    expect(result.diagram.routes).toHaveLength(0);
    expect(result.warnings.some((w) => w.code === "route_dropped_unknown_carrier" && w.subject === "X")).toBe(true);
  });

  it("DROPS a route with empty path AND empty motion", () => {
    const result = sanitizeCoachDiagram(
      baseDiagram({
        routes: [
          { from: "X", path: [] },
        ],
      }),
    );
    expect(result.diagram.routes).toHaveLength(0);
    expect(result.warnings.some((w) => w.code === "route_dropped_empty_path")).toBe(true);
  });

  it("KEEPS a motion-only route (empty path, non-empty motion)", () => {
    const result = sanitizeCoachDiagram(
      baseDiagram({
        routes: [
          { from: "X", path: [], motion: [[-5, -1]] },
        ],
      }),
    );
    expect(result.diagram.routes).toHaveLength(1);
  });

  it("DROPS a route with a NaN waypoint", () => {
    const result = sanitizeCoachDiagram(
      baseDiagram({
        routes: [
          { from: "X", path: [[0, 5], [NaN, 10]] },
        ],
      }),
    );
    expect(result.diagram.routes).toHaveLength(0);
    expect(result.warnings.some((w) => w.code === "route_dropped_nonfinite_waypoint")).toBe(true);
  });

  it("CLAMPS a route waypoint that flies way off the field", () => {
    const result = sanitizeCoachDiagram(
      baseDiagram({
        routes: [
          { from: "X", path: [[-13, 3], [500, 5]] }, // x=500 is way off
        ],
      }),
    );
    expect(result.diagram.routes).toHaveLength(1);
    expect(result.diagram.routes![0].path[1][0]).toBeLessThanOrEqual(53);
    expect(result.warnings.some((w) => w.code === "route_waypoint_clamped")).toBe(true);
  });

  it("KEEPS legitimate deep verts (y=18) without clamping", () => {
    const result = sanitizeCoachDiagram(
      baseDiagram({
        routes: [
          { from: "Z", path: [[18, 5], [18, 18]] },
        ],
      }),
    );
    expect(result.diagram.routes).toHaveLength(1);
    expect(result.warnings.filter((w) => w.code === "route_waypoint_clamped")).toHaveLength(0);
  });
});

describe("sanitize — combined corruption (multiple passes interact)", () => {
  it("handles a fully corrupt diagram gracefully", () => {
    const result = sanitizeCoachDiagram({
      title: "Disaster",
      variant: "flag_7v7",
      players: [
        { id: "Q",     x: 0,    y: -3,   team: "O" },
        { id: "X",     x: NaN,  y: 0,    team: "O" },
        { id: "GHOST", x: 999,  y: 999,  team: "O" },
      ],
      routes: [
        { from: "X",     path: [[0, 5]] },     // carrier dropped → drop
        { from: "GHOST", path: [[0, 5]] },     // carrier dropped → drop
        { from: "Q",     path: [[NaN, 5]] },   // NaN waypoint → drop
      ],
      zones: [
        { kind: "rectangle", center: [NaN, 0], size: [10, 6], label: "Z1" },
        { kind: "rectangle", center: [0, 10],  size: [50, 6], label: "TooWide" },
      ],
    });
    expect(result.diagram.players).toHaveLength(1);
    expect(result.diagram.players[0].id).toBe("Q");
    expect(result.diagram.routes).toHaveLength(0);
    expect(result.diagram.zones).toHaveLength(0);
    // Each corruption is reported once.
    expect(result.warnings.length).toBeGreaterThanOrEqual(5);
  });
});
