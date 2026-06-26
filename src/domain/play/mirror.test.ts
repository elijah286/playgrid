import { describe, it, expect } from "vitest";
import { mirrorCoachDiagram, type FlipMode } from "./mirror";
import type { CoachDiagram } from "@/features/coach-ai/coachDiagramConverter";

/** Flood Right (flag_7v7-ish): X backside go, Z corner, S out, B flat, H drag.
 *  Routes use absolute waypoints in the [x = yds from center, y = yds past LOS]
 *  coordinate system. */
function floodRight(): CoachDiagram {
  return {
    title: "Flood Right",
    variant: "flag_7v7",
    focus: "O",
    players: [
      { id: "Q", x: 0, y: -3, team: "O" },
      { id: "C", x: 0, y: 0, team: "O" },
      { id: "X", x: -12, y: 0, team: "O" },
      { id: "Z", x: 12, y: 0, team: "O" },
      { id: "S", x: 8, y: 0, team: "O" },
      { id: "H", x: -6, y: 0, team: "O" },
      { id: "B", x: 2, y: -5, team: "O" },
    ],
    routes: [
      { from: "X", path: [[-12, 16]], route_kind: "Go" },
      { from: "Z", path: [[12, 8], [16, 14]], route_kind: "Corner", direction: "right" },
      { from: "S", path: [[8, 6], [13, 6]], route_kind: "Out", direction: "right" },
      { from: "B", path: [[2, -1], [9, 1]], route_kind: "Flat", direction: "right" },
      { from: "H", path: [[-6, 2], [0, 3], [5, 3]], route_kind: "Drag", direction: "right" },
    ],
  };
}

const byId = (d: CoachDiagram, id: string) => d.players.find((p) => p.id === id)!;
const routeFrom = (d: CoachDiagram, from: string) => (d.routes ?? []).find((r) => r.from === from)!;

describe("mirrorCoachDiagram — full", () => {
  it("negates every player x and keeps y", () => {
    const { diagram } = mirrorCoachDiagram(floodRight(), "full");
    expect(byId(diagram, "X").x).toBe(12);
    expect(byId(diagram, "Z").x).toBe(-12);
    expect(byId(diagram, "S").x).toBe(-8);
    expect(byId(diagram, "B").x).toBe(-2);
    expect(byId(diagram, "B").y).toBe(-5); // y untouched
    expect(byId(diagram, "C").x).toBe(0); // center stays centered (no -0)
    expect(Object.is(byId(diagram, "C").x, -0)).toBe(false);
  });

  it("negates route waypoint x and swaps direction", () => {
    const { diagram } = mirrorCoachDiagram(floodRight(), "full");
    expect(routeFrom(diagram, "Z").path).toEqual([[-12, 8], [-16, 14]]);
    expect(routeFrom(diagram, "Z").direction).toBe("left");
    expect(routeFrom(diagram, "H").path).toEqual([[6, 2], [0, 3], [-5, 3]]);
  });

  it("is its own inverse (mirror² = identity)", () => {
    const once = mirrorCoachDiagram(floodRight(), "full").diagram;
    const twice = mirrorCoachDiagram(once, "full").diagram;
    expect(twice.players).toEqual(floodRight().players);
    expect(twice.routes).toEqual(floodRight().routes);
  });

  it("mirrors zones across the center", () => {
    const withZone: CoachDiagram = {
      ...floodRight(),
      zones: [{ kind: "rectangle", center: [10, 8], size: [6, 6], label: "Flat" }],
    };
    const { diagram } = mirrorCoachDiagram(withZone, "full");
    expect(diagram.zones![0].center).toEqual([-10, 8]);
  });
});

describe("mirrorCoachDiagram — routes", () => {
  it("leaves every player position untouched", () => {
    const before = floodRight();
    const { diagram } = mirrorCoachDiagram(before, "routes");
    expect(diagram.players).toEqual(before.players);
  });

  it("reflects each route about its OWN player's x", () => {
    const { diagram } = mirrorCoachDiagram(floodRight(), "routes");
    // S is at x=8 running an out to x=13 (away from center). Reflected about
    // 8 → 2*8 - 13 = 3 (now breaking toward center / inside).
    expect(routeFrom(diagram, "S").path).toEqual([[8, 6], [3, 6]]);
    // X at x=-12 running a straight go (x stays -12 → 2*-12 - -12 = -12).
    expect(routeFrom(diagram, "X").path).toEqual([[-12, 16]]);
  });

  it("drops route_kind + marks nonCanonical (break side inverted, family no longer holds)", () => {
    const { diagram } = mirrorCoachDiagram(floodRight(), "routes");
    const s = routeFrom(diagram, "S");
    expect(s.route_kind).toBeUndefined();
    expect(s.direction).toBeUndefined();
    expect(s.nonCanonical).toBe(true);
  });
});

describe("mirrorCoachDiagram — formation", () => {
  it("mirrors player positions but keeps each route's field-absolute shape", () => {
    const { diagram } = mirrorCoachDiagram(floodRight(), "formation");
    // S moves from x=8 to x=-8.
    expect(byId(diagram, "S").x).toBe(-8);
    // S's out kept its rightward shape: original [8,6]->[13,6] (a +5 break);
    // translated by -2*8 = -16 → [-8,6]->[-3,6] (still a +5 rightward break).
    expect(routeFrom(diagram, "S").path).toEqual([[-8, 6], [-3, 6]]);
    // Break side relative to the receiver inverted (was outside, now inside),
    // so the named family is dropped + the route marked custom.
    expect(routeFrom(diagram, "S").route_kind).toBeUndefined();
    expect(routeFrom(diagram, "S").nonCanonical).toBe(true);
  });

  it("keeps the route anchored to its (moved) player", () => {
    const { diagram } = mirrorCoachDiagram(floodRight(), "formation");
    // First waypoint of H's drag starts at the player after the move.
    const h = byId(diagram, "H");
    expect(routeFrom(diagram, "H").path[0]).toEqual([h.x, 2]);
  });
});

describe("mirrorCoachDiagram — robustness", () => {
  it("handles an empty / minimal diagram without throwing", () => {
    const d: CoachDiagram = { variant: "flag_5v5", players: [{ id: "Q", x: 0, y: -3, team: "O" }] };
    for (const mode of ["full", "routes", "formation"] as FlipMode[]) {
      expect(() => mirrorCoachDiagram(d, mode)).not.toThrow();
    }
  });

  it("preserves player count, ids, and teams across every mode", () => {
    const before = floodRight();
    for (const mode of ["full", "routes", "formation"] as FlipMode[]) {
      const { diagram } = mirrorCoachDiagram(before, mode);
      expect(diagram.players.map((p) => p.id).sort()).toEqual(before.players.map((p) => p.id).sort());
      expect(diagram.players.length).toBe(before.players.length);
    }
  });
});
