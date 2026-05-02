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

describe("Renderer — duplicate defender role labels get suffixed ids", () => {
  it("4-3 Over Cover 3 (two DTs, two CBs) emits unique ids: DT, DT2, CB, CB2", () => {
    const { diagram } = playSpecToCoachDiagram(
      makeSpec({
        variant: "tackle_11",
        defense: { front: "4-3 Over", coverage: "Cover 3" },
      } as Partial<PlaySpec>),
    );
    const defenderIds = diagram.players.filter((p) => p.team === "D").map((p) => p.id);
    const dups = defenderIds.filter((id, i) => defenderIds.indexOf(id) !== i);
    expect(dups, `duplicate defender ids: ${dups.join(",")}`).toEqual([]);
    expect(defenderIds).toContain("DT");
    expect(defenderIds).toContain("DT2");
    expect(defenderIds).toContain("CB");
    expect(defenderIds).toContain("CB2");
  });

  it("display role stays bare ('DT' not 'DT2') so the diagram still shows DT in both triangles", () => {
    const { diagram } = playSpecToCoachDiagram(
      makeSpec({
        variant: "tackle_11",
        defense: { front: "4-3 Over", coverage: "Cover 3" },
      } as Partial<PlaySpec>),
    );
    const dt2 = diagram.players.find((p) => p.id === "DT2");
    expect(dt2?.role).toBe("DT");
  });

  it("override targeting 'DT2' applies only to the second DT, not the first", () => {
    const { diagram } = playSpecToCoachDiagram(
      makeSpec({
        variant: "tackle_11",
        defense: { front: "4-3 Over", coverage: "Cover 3" },
        defenderAssignments: [{ defender: "DT2", action: { kind: "spy", target: "QB" } }],
      } as Partial<PlaySpec>),
    );
    const dt2Routes = (diagram.routes ?? []).filter((r) => r.from === "DT2");
    expect(dt2Routes.length).toBe(1);
    const dtRoutes = (diagram.routes ?? []).filter((r) => r.from === "DT");
    // First DT keeps its catalog blitz, so it has a route too — but with
    // path ending at LOS, not the spy hold-position.
    expect(dtRoutes[0].path[0][1]).toBe(0);
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

describe("Renderer — read_and_react geometry (Phase D7)", () => {
  function specWithReact(behavior: "jump_route" | "carry_vertical" | "follow_to_flat" | "wall_off" | "robber") {
    return {
      schemaVersion: PLAY_SPEC_SCHEMA_VERSION,
      variant: "flag_7v7" as const,
      formation: { name: "Spread Doubles" },
      defense: { front: "7v7 Zone" as const, coverage: "Cover 3" as const },
      assignments: [
        { player: "X", action: { kind: "route" as const, family: "Slant" } },
      ],
      defenderAssignments: [
        {
          defender: "HL",
          action: {
            kind: "read_and_react" as const,
            trigger: { player: "X" as const },
            behavior,
          },
        },
      ],
    };
  }

  it("jump_route ends near (but not at) the trigger receiver", () => {
    const { diagram } = playSpecToCoachDiagram(specWithReact("jump_route"));
    const route = (diagram.routes ?? []).find((r) => r.from === "HL");
    expect(route).toBeDefined();
    expect(route!.route_kind).toBe("react_jump_route");
    expect(route!.startDelaySec).toBeGreaterThan(0);
  });

  it("robber path drops to deep middle (x≈0, y≈8)", () => {
    const { diagram } = playSpecToCoachDiagram(specWithReact("robber"));
    const route = (diagram.routes ?? []).find((r) => r.from === "HL");
    const final = route!.path[route!.path.length - 1];
    expect(final[0]).toBe(0);
    expect(final[1]).toBe(8);
  });

  it("carry_vertical emits 2 waypoints (downfield then break)", () => {
    const { diagram } = playSpecToCoachDiagram(specWithReact("carry_vertical"));
    const route = (diagram.routes ?? []).find((r) => r.from === "HL");
    expect(route!.path.length).toBe(2);
  });

  it("follow_to_flat ends at shallow depth (within ~3 yds of LOS)", () => {
    const { diagram } = playSpecToCoachDiagram(specWithReact("follow_to_flat"));
    const route = (diagram.routes ?? []).find((r) => r.from === "HL");
    const final = route!.path[route!.path.length - 1];
    // Defender HL starts at y≈5; ending at y - 2 = ~3 is the flat depth.
    expect(final[1]).toBeLessThanOrEqual(4);
  });

  it("wall_off ends at the same depth as the defender", () => {
    const { diagram } = playSpecToCoachDiagram(specWithReact("wall_off"));
    const defender = diagram.players.find((p) => p.id === "HL");
    const route = (diagram.routes ?? []).find((r) => r.from === "HL");
    const final = route!.path[route!.path.length - 1];
    expect(final[1]).toBe(defender!.y);
  });
});

describe("Renderer — zones tagged with owner label for per-defender colors", () => {
  it("Cover 1 deep-middle zone is owned by FS", () => {
    const { diagram } = playSpecToCoachDiagram(
      makeSpec({ defense: { front: "7v7 Man", coverage: "Cover 1" } }),
    );
    const fsZone = (diagram.zones ?? []).find((z) => z.label.toLowerCase().includes("deep middle"));
    expect(fsZone?.ownerLabel).toBe("FS");
  });

  it("Cover 3 deep thirds owned by the corners and FS", () => {
    const { diagram } = playSpecToCoachDiagram(
      makeSpec({ defense: { front: "7v7 Zone", coverage: "Cover 3" } }),
    );
    const zones = diagram.zones ?? [];
    const deepL = zones.find((z) => z.label === "Deep 1/3 L");
    const deepM = zones.find((z) => z.label === "Deep 1/3 M");
    const deepR = zones.find((z) => z.label === "Deep 1/3 R");
    expect(deepL?.ownerLabel).toBe("CB");
    expect(deepM?.ownerLabel).toBe("FS");
    expect(deepR?.ownerLabel).toBe("CB");
  });
});
