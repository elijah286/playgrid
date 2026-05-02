/**
 * Renderer tests for Phase D3 — defense zones + movement.
 *
 * The screenshot bug ("show their zones?" on Cover 1 → no zones drawn)
 * is the canonical regression. With per-defender assignments and the
 * renderer now respecting them, Cover 1 must render:
 *   - the FS as a deep-middle zone shape
 *   - every other defender as a man-match arrow toward their target
 *   - blitz arrows for D-line/blitzers when present
 *
 * For zone coverages (Cover 2/3/4), every defender's zone is drawn.
 * For Cover 0, no zones are drawn — pure man.
 */

import { describe, expect, it } from "vitest";
import { playSpecToCoachDiagram } from "./specRenderer";
import { PLAY_SPEC_SCHEMA_VERSION, type PlaySpec } from "./spec";

function makeSpec(overrides: Partial<PlaySpec> = {}): PlaySpec {
  return {
    schemaVersion: PLAY_SPEC_SCHEMA_VERSION,
    variant: "flag_7v7",
    formation: { name: "Spread Doubles" },
    assignments: [
      { player: "X", action: { kind: "route", family: "Slant" } },
      { player: "Z", action: { kind: "route", family: "Post" } },
      { player: "H", action: { kind: "route", family: "Hitch" } },
      { player: "S", action: { kind: "route", family: "Flat" } },
    ],
    ...overrides,
  };
}

describe("Renderer — defense zones (Phase D3)", () => {
  it("Cover 3 emits exactly 3 deep-third zones plus underneath zones", () => {
    const { diagram, warnings } = playSpecToCoachDiagram(
      makeSpec({ defense: { front: "7v7 Zone", coverage: "Cover 3" } }),
    );
    expect(warnings.filter((w) => w.code === "defense_unknown")).toHaveLength(0);
    const zones = diagram.zones ?? [];
    const deepZones = zones.filter((z) => z.label.toLowerCase().startsWith("deep"));
    expect(deepZones.length, "expected 3 deep-third zones").toBe(3);
    const underneath = zones.filter((z) => !z.label.toLowerCase().startsWith("deep"));
    expect(underneath.length, "expected ≥ 4 underneath zones").toBeGreaterThanOrEqual(4);
  });

  it("Cover 1 (the screenshot bug) draws the FS deep-middle zone AND man-match arrows for the rest", () => {
    const { diagram, warnings } = playSpecToCoachDiagram(
      makeSpec({ defense: { front: "7v7 Man", coverage: "Cover 1" } }),
    );
    expect(warnings.filter((w) => w.code === "defense_unknown")).toHaveLength(0);
    const zones = diagram.zones ?? [];
    const fsZone = zones.find((z) => z.label.toLowerCase().includes("deep middle"));
    expect(fsZone, "FS deep-middle zone must render in Cover 1").toBeDefined();

    // Every defender that's NOT the FS should have a man-match route.
    const routes = (diagram.routes ?? []).filter((r) => {
      const def = diagram.players.find((p) => p.id === r.from);
      return def?.team === "D";
    });
    expect(routes.length, "expected man-match arrows for defenders other than FS").toBeGreaterThanOrEqual(4);
  });

  it("Cover 0 emits NO zones — pure man with maybe a spy", () => {
    const { diagram, warnings } = playSpecToCoachDiagram(
      makeSpec({ defense: { front: "7v7 Man", coverage: "Cover 0" } }),
    );
    expect(warnings.filter((w) => w.code === "defense_unknown")).toHaveLength(0);
    expect(diagram.zones ?? []).toHaveLength(0);
  });

  it("man-match arrows point from defender toward their assigned receiver", () => {
    const { diagram } = playSpecToCoachDiagram(
      makeSpec({ defense: { front: "7v7 Man", coverage: "Cover 1" } }),
    );
    const defenders = diagram.players.filter((p) => p.team === "D");
    const offense = diagram.players.filter((p) => p.team !== "D");
    const routes = diagram.routes ?? [];

    // Find the CB on the X side (negative x) — should point toward X.
    const xPlayer = offense.find((p) => p.id === "X");
    expect(xPlayer).toBeDefined();
    if (!xPlayer) return;

    const cbRoutes = routes.filter((r) => {
      const def = defenders.find((d) => d.id === r.from);
      return def?.id === "CB" && Math.sign(def.x) === Math.sign(xPlayer.x);
    });
    expect(cbRoutes.length, "expected at least one CB man-match route on X's side").toBeGreaterThan(0);
    if (cbRoutes.length === 0) return;
    const lastWp = cbRoutes[0].path[cbRoutes[0].path.length - 1];
    // The arrow's terminal should be on the same horizontal side as X.
    expect(Math.sign(lastWp[0])).toBe(Math.sign(xPlayer.x));
  });
});

describe("Renderer — defenderAssignments overrides (Phase D3)", () => {
  it("override changes a Cover 3 hook defender into a blitz", () => {
    const baseline = playSpecToCoachDiagram(
      makeSpec({ defense: { front: "7v7 Zone", coverage: "Cover 3" } }),
    );
    const overridden = playSpecToCoachDiagram(
      makeSpec({
        defense: { front: "7v7 Zone", coverage: "Cover 3" },
        defenderAssignments: [{ defender: "HL", action: { kind: "blitz", gap: "A" } }],
      }),
    );
    // HL drops the Hook L zone in baseline. After override, the Hook L
    // zone should NOT be drawn (no defender references it anymore) and
    // a route from HL should exist.
    const baseZones = baseline.diagram.zones ?? [];
    const overZones = overridden.diagram.zones ?? [];
    const hadHookL = baseZones.some((z) => z.label === "Hook L");
    expect(hadHookL).toBe(true);
    const stillHasHookL = overZones.some((z) => z.label === "Hook L");
    expect(stillHasHookL, "overriding HL into blitz should drop Hook L").toBe(false);

    const hlRoute = (overridden.diagram.routes ?? []).find((r) => r.from === "HL");
    expect(hlRoute, "HL should have a blitz route emitted").toBeDefined();
  });

  it("override referencing an unknown defender warns", () => {
    const { warnings } = playSpecToCoachDiagram(
      makeSpec({
        defense: { front: "7v7 Zone", coverage: "Cover 3" },
        defenderAssignments: [{ defender: "GHOST", action: { kind: "blitz" } }],
      }),
    );
    expect(warnings.find((w) => w.code === "defender_assignment_player_missing")).toBeDefined();
  });

  it("override zone_drop with unknown zoneId warns", () => {
    const { warnings } = playSpecToCoachDiagram(
      makeSpec({
        defense: { front: "7v7 Zone", coverage: "Cover 3" },
        defenderAssignments: [
          { defender: "FS", action: { kind: "zone_drop", zoneId: "the_void" } },
        ],
      }),
    );
    expect(warnings.find((w) => w.code === "defender_zone_unknown")).toBeDefined();
  });
});
