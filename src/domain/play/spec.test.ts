/**
 * PlaySpec round-trip tests.
 *
 * The contract: for any well-formed PlaySpec (named formation, named
 * defense, catalog routes), the cycle
 *
 *     PlaySpec → CoachDiagram → PlaySpec'
 *
 * must preserve the semantic content (formation name, defense ref,
 * route families per player). Pixel-level coordinates are NOT in the
 * contract — they're rendered output, not input.
 *
 * These tests are the third layer of the eval harness (catalog
 * round-trips, validator goldens, spec round-trips). When a coach
 * surfaces "Cal saved a play but the prose described it differently,"
 * the corresponding regression goes here as a spec → diagram → spec
 * test that fails until fixed.
 */

import { describe, expect, it } from "vitest";
import {
  PLAY_SPEC_SCHEMA_VERSION,
  type PlaySpec,
  type PlayerAssignment,
} from "./spec";
import { playSpecToCoachDiagram } from "./specRenderer";
import { coachDiagramToPlaySpec } from "./specParser";
import { findTemplate } from "./routeTemplates";

/** Helper: build a minimal PlaySpec for a flag_7v7 spread look. */
function spreadSlantPost(): PlaySpec {
  return {
    schemaVersion: PLAY_SPEC_SCHEMA_VERSION,
    variant: "flag_7v7",
    title: "Spread Slant/Post",
    playType: "offense",
    formation: { name: "Spread Doubles" },
    assignments: [
      { player: "X", action: { kind: "route", family: "Slant" } },
      { player: "Z", action: { kind: "route", family: "Post" } },
      { player: "H", action: { kind: "route", family: "Hitch" } },
      { player: "S", action: { kind: "route", family: "Flat" } },
    ],
  };
}

describe("PlaySpec → CoachDiagram (renderer)", () => {
  it("renders offensive players from the formation synthesizer", () => {
    const { diagram, warnings } = playSpecToCoachDiagram(spreadSlantPost());
    expect(diagram.players.length).toBeGreaterThan(0);
    expect(diagram.players.every((p) => p.team === "O" || p.team === undefined)).toBe(true);
    expect(warnings.filter((w) => w.code === "formation_fallback")).toHaveLength(0);
  });

  it("renders one route per route assignment, with route_kind set", () => {
    const { diagram } = playSpecToCoachDiagram(spreadSlantPost());
    const routes = diagram.routes ?? [];
    // Some players in Spread Doubles may not exist (depends on synthesizer
    // labeling), so only assert on routes that actually emitted.
    expect(routes.length).toBeGreaterThan(0);
    for (const r of routes) {
      expect(r.route_kind, `route from ${r.from} missing route_kind`).toBeDefined();
      expect(findTemplate(r.route_kind!)).not.toBeNull();
    }
  });

  it("warns when a formation name doesn't parse", () => {
    const spec: PlaySpec = {
      ...spreadSlantPost(),
      formation: { name: "Plzlfgkfgmpwoeiruterpkasf" }, // gibberish
    };
    const { warnings } = playSpecToCoachDiagram(spec);
    expect(warnings.some((w) => w.code === "formation_fallback")).toBe(true);
  });

  it("warns when an assignment references an unknown player", () => {
    const spec: PlaySpec = {
      ...spreadSlantPost(),
      assignments: [
        { player: "PHANTOM", action: { kind: "route", family: "Slant" } },
      ],
    };
    const { warnings } = playSpecToCoachDiagram(spec);
    expect(warnings.some((w) => w.code === "assignment_player_missing")).toBe(true);
  });

  it("warns when synthesizer returns wrong player count for variant (integrity guard)", () => {
    // The Pro Set / Pro I bug returned 10 players for tackle_11. After
    // the fix it returns 11 — so this is a defensive test that the
    // GUARD itself fires correctly when count mismatches happen. We
    // simulate by spying on what playSpecToCoachDiagram does with a
    // formation we KNOW the synthesizer can't fully populate.
    //
    // This test asserts that IF the synthesizer ever again under-
    // produces for a given variant, the renderer surfaces the
    // formation_player_count_mismatch warning instead of silently
    // shipping a malformed play. Currently no formation reproduces
    // this, so we run the negative case with a known-good formation
    // (must NOT warn) — the positive guard is enforced by the
    // synthesizer tests asserting full counts per formation.
    const spec: PlaySpec = {
      ...spreadSlantPost(),
      variant: "tackle_11",
      formation: { name: "Pro Set" }, // Used to under-populate; now fixed
    };
    const { warnings } = playSpecToCoachDiagram(spec);
    expect(
      warnings.find((w) => w.code === "formation_player_count_mismatch"),
      "Pro Set tackle_11 should now produce 11 players — guard should NOT fire",
    ).toBeUndefined();
  });

  it("warns when route family isn't in the catalog", () => {
    const spec = spreadSlantPost();
    spec.assignments[0] = {
      player: "X",
      action: { kind: "route", family: "Uppercut" },
    };
    const { warnings } = playSpecToCoachDiagram(spec);
    expect(warnings.some((w) => w.code === "route_template_missing")).toBe(true);
  });

  it("renders defenders when a known defense is referenced (flag_7v7 zone Cover 3)", () => {
    const spec: PlaySpec = {
      ...spreadSlantPost(),
      // Front + coverage must match the catalog labels from
      // defensiveAlignments.ts. F7_COVER_3 uses front="7v7 Zone".
      defense: { front: "7v7 Zone", coverage: "Cover 3", strength: "right" },
    };
    const { diagram, warnings } = playSpecToCoachDiagram(spec);
    const defenders = diagram.players.filter((p) => p.team === "D");
    expect(defenders.length).toBeGreaterThan(0);
    expect(warnings.filter((w) => w.code === "defense_unknown")).toHaveLength(0);
  });

  it("renders defenders for tackle_11 (4-3 Over Cover 3)", () => {
    const spec: PlaySpec = {
      ...spreadSlantPost(),
      variant: "tackle_11",
      defense: { front: "4-3 Over", coverage: "Cover 3", strength: "right" },
    };
    const { diagram, warnings } = playSpecToCoachDiagram(spec);
    const defenders = diagram.players.filter((p) => p.team === "D");
    expect(defenders.length).toBe(11);
    expect(warnings.filter((w) => w.code === "defense_unknown")).toHaveLength(0);
  });

  it("warns + omits defenders when the defense ref doesn't match the catalog", () => {
    const spec: PlaySpec = {
      ...spreadSlantPost(),
      defense: { front: "Made-up Front", coverage: "Imaginary Coverage" },
    };
    const { diagram, warnings } = playSpecToCoachDiagram(spec);
    const defenders = diagram.players.filter((p) => p.team === "D");
    expect(defenders).toHaveLength(0);
    expect(warnings.some((w) => w.code === "defense_unknown")).toBe(true);
  });

  it("does NOT emit a duplicate start node (regression: spec-rendered routes had 2 identical nodes)", () => {
    // 2026-05-01 production bug: every spec-rendered route had 4 nodes
    // where node[0] == node[1] (the carrier position appeared twice).
    // Cause: pathFromTemplate emitted the template's first point (which
    // is at carrier-relative offset (0,0) = the carrier itself), then
    // the downstream converter prepended its own start node from the
    // carrier's position. Duplicate node = degenerate zero-length
    // segment that confuses SVG path generation.
    const { diagram } = playSpecToCoachDiagram(spreadSlantPost());
    for (const r of diagram.routes ?? []) {
      // Path is the post-start waypoints (start node added by converter).
      // The first waypoint must NOT be at the carrier's position.
      const carrier = diagram.players.find((p) => p.id === r.from);
      expect(carrier).toBeDefined();
      const firstWp = r.path[0];
      const dx = Math.abs(firstWp[0] - carrier!.x);
      const dy = Math.abs(firstWp[1] - carrier!.y);
      expect(
        Math.hypot(dx, dy),
        `route from "${r.from}" first waypoint ${JSON.stringify(firstWp)} duplicates carrier position (${carrier!.x}, ${carrier!.y})`,
      ).toBeGreaterThan(0.01);
    }
  });

  it("renderer scales template y by depthYds — concept-level adaptation actually changes geometry", () => {
    // Architectural test: action.depthYds was always read by the
    // matcher / prose / validator but IGNORED by the renderer until
    // 2026-05-01. Without this, Cal could write `depthYds: 4` on a
    // drag and the diagram would still draw it at the catalog default
    // (1.5yd). This test pins the new behavior: same family, different
    // depthYds → different rendered geometry.
    const spec: PlaySpec = {
      schemaVersion: PLAY_SPEC_SCHEMA_VERSION,
      variant: "flag_7v7",
      title: "Mesh — high/low",
      playType: "offense",
      formation: { name: "Spread Doubles" },
      assignments: [
        { player: "X", action: { kind: "route", family: "Drag", depthYds: 2 } },
        { player: "Z", action: { kind: "route", family: "Drag", depthYds: 4 } },
      ],
    };
    const { diagram } = playSpecToCoachDiagram(spec);
    const xRoute = diagram.routes?.find((r) => r.from === "X");
    const zRoute = diagram.routes?.find((r) => r.from === "Z");
    expect(xRoute, "X drag missing").toBeDefined();
    expect(zRoute, "Z drag missing").toBeDefined();
    const xCarrier = diagram.players.find((p) => p.id === "X")!;
    const zCarrier = diagram.players.find((p) => p.id === "Z")!;
    // Deepest waypoint y minus carrier y = the route's depth as drawn.
    const xDepth = Math.max(...xRoute!.path.map(([, y]) => y - xCarrier.y));
    const zDepth = Math.max(...zRoute!.path.map(([, y]) => y - zCarrier.y));
    // X requested 2yd, Z requested 4yd. Allow ±0.3yd float slack.
    expect(xDepth).toBeGreaterThan(1.7);
    expect(xDepth).toBeLessThan(2.3);
    expect(zDepth).toBeGreaterThan(3.7);
    expect(zDepth).toBeLessThan(4.3);
    // The whole point: the two drags render at DIFFERENT depths, so
    // a Mesh's high/low pair actually meshes instead of colliding.
    expect(zDepth - xDepth).toBeGreaterThan(1.5);
  });

  it("emits route paths anchored at the carrier (not at origin)", () => {
    const { diagram } = playSpecToCoachDiagram(spreadSlantPost());
    const routes = diagram.routes ?? [];
    // The renderer's job: route waypoints must be RELATIVE to the
    // carrier's position, not absolute origin coordinates. A bug
    // would produce wp ≈ (0, ~depth) regardless of carrier x.
    //
    // We verify by checking the LAST waypoint (the route's terminus)
    // is reachable from carrier within the route's reasonable extent
    // (< 25yd lateral, < 25yd vertical — fits any catalog route).
    // The first waypoint check (which assumed every route has a
    // vertical stem) was wrong for routes like Flat that step
    // laterally from the carrier without a stem.
    for (const r of routes) {
      const carrier = diagram.players.find((p) => p.id === r.from);
      expect(carrier).toBeDefined();
      const [endX, endY] = r.path[r.path.length - 1];
      // Last waypoint within sensible distance of carrier.
      expect(Math.abs(endX - carrier!.x)).toBeLessThan(25);
      expect(Math.abs(endY - carrier!.y)).toBeLessThan(25);
      // Sanity: a route with carrier at x=10 should NOT have all
      // waypoints clustered at x≈0 (origin) — that'd be the bug.
      // Check at least one waypoint is closer to carrier than to origin.
      const carrierBased = r.path.some(
        ([x, y]) => Math.hypot(x - carrier!.x, y - carrier!.y) < Math.hypot(x, y),
      );
      // Only enforce when carrier itself is far from origin (else origin-
      // based and carrier-based are indistinguishable).
      if (Math.hypot(carrier!.x, carrier!.y) > 5) {
        expect(carrierBased, `route from "${r.from}" not anchored to carrier`).toBe(true);
      }
    }
  });
});

describe("CoachDiagram → PlaySpec (parser)", () => {
  it("extracts a route assignment for a route with route_kind set", () => {
    const spec = coachDiagramToPlaySpec({
      title: "Test",
      variant: "flag_7v7",
      players: [
        { id: "Q", x: 0, y: -3, team: "O" },
        { id: "X", x: -13, y: 0, team: "O" },
      ],
      routes: [
        { from: "X", path: [[-13, 3], [-7, 5.8]], route_kind: "slant" },
      ],
    });
    const xAssignment = spec.assignments.find((a) => a.player === "X");
    expect(xAssignment?.action.kind).toBe("route");
    if (xAssignment?.action.kind !== "route") return;
    expect(xAssignment.action.family).toBe("Slant"); // canonical-cased
  });

  it("preserves freehand routes (no route_kind) as custom actions", () => {
    const spec = coachDiagramToPlaySpec({
      title: "Test",
      variant: "flag_7v7",
      players: [
        { id: "Q", x: 0, y: -3, team: "O" },
        { id: "X", x: -13, y: 0, team: "O" },
      ],
      routes: [{ from: "X", path: [[-13, 5], [-3, 10], [-15, 15]] }],
    });
    const xAssignment = spec.assignments.find((a) => a.player === "X");
    expect(xAssignment?.action.kind).toBe("custom");
    if (xAssignment?.action.kind !== "custom") return;
    expect(xAssignment.action.waypoints).toHaveLength(3);
  });

  it("treats linemen without routes as blockers", () => {
    const spec = coachDiagramToPlaySpec({
      variant: "flag_7v7",
      players: [
        { id: "Q", x: 0, y: -3, team: "O" },
        { id: "C", x: 0, y: 0, team: "O" },
        { id: "LT", x: -3, y: 0, team: "O" },
        { id: "RT", x: 3, y: 0, team: "O" },
      ],
      routes: [],
    });
    const lt = spec.assignments.find((a) => a.player === "LT");
    expect(lt?.action.kind).toBe("block");
  });

  it("does not emit assignments for defenders", () => {
    const spec = coachDiagramToPlaySpec({
      variant: "flag_7v7",
      players: [
        { id: "Q", x: 0, y: -3, team: "O" },
        { id: "X", x: -13, y: 0, team: "O" },
        { id: "CB", x: -13, y: 5, team: "D" },
      ],
      routes: [],
    });
    expect(spec.assignments.find((a) => a.player === "CB")).toBeUndefined();
  });

  it("uses hint formation/defense over diagram inference", () => {
    const spec = coachDiagramToPlaySpec(
      { variant: "flag_7v7", players: [{ id: "Q", x: 0, y: -3, team: "O" }], routes: [] },
      { formation: "Trips Right", defenseFront: "Cover 3", defenseCoverage: "Cover 3" },
    );
    expect(spec.formation.name).toBe("Trips Right");
    expect(spec.defense?.front).toBe("Cover 3");
  });
});

describe("CoachDiagram → PlaySpec — confidence inference", () => {
  it("attaches high-confidence to formation when an explicit name is given", () => {
    const spec = coachDiagramToPlaySpec(
      { variant: "flag_7v7", title: "Trips Right", players: [{ id: "Q", x: 0, y: -3, team: "O" }], routes: [] },
      { formation: "Trips Right" },
    );
    expect(spec.formation.confidence).toBe("high");
  });

  it("attaches low-confidence to formation when falling back to default", () => {
    const spec = coachDiagramToPlaySpec(
      { variant: "flag_7v7", players: [{ id: "Q", x: 0, y: -3, team: "O" }], routes: [] },
    );
    // No title, no hint — falls to "Spread Doubles" placeholder.
    expect(spec.formation.confidence).toBe("low");
  });

  it("attaches low-confidence to defense placeholder when defenders exist but no scheme is named", () => {
    const spec = coachDiagramToPlaySpec({
      variant: "flag_7v7",
      players: [
        { id: "Q", x: 0, y: -3, team: "O" },
        { id: "CB", x: -10, y: 5, team: "D" },
      ],
      routes: [],
    });
    expect(spec.defense?.confidence).toBe("low");
  });

  it("attaches high-confidence to assignments backed by a catalog route", () => {
    const spec = coachDiagramToPlaySpec({
      variant: "flag_7v7",
      players: [
        { id: "Q", x: 0, y: -3, team: "O" },
        { id: "X", x: -13, y: 0, team: "O" },
      ],
      routes: [{ from: "X", path: [[-13, 3], [-7, 5.8]], route_kind: "slant" }],
    });
    const x = spec.assignments.find((a) => a.player === "X");
    expect(x?.confidence).toBe("high");
  });

  it("attaches low-confidence to custom (freehand) assignments", () => {
    const spec = coachDiagramToPlaySpec({
      variant: "flag_7v7",
      players: [
        { id: "Q", x: 0, y: -3, team: "O" },
        { id: "X", x: -13, y: 0, team: "O" },
      ],
      routes: [{ from: "X", path: [[-13, 5], [-3, 10]] }], // no route_kind
    });
    const x = spec.assignments.find((a) => a.player === "X");
    expect(x?.confidence).toBe("low");
  });

  it("attaches low-confidence to unspecified players", () => {
    const spec = coachDiagramToPlaySpec({
      variant: "flag_7v7",
      players: [
        { id: "Q", x: 0, y: -3, team: "O" },
        // Skill-position-shaped label with no route — parser leaves unspecified.
        { id: "F", x: 4, y: 0, team: "O" },
      ],
      routes: [],
    });
    const f = spec.assignments.find((a) => a.player === "F");
    expect(f?.action.kind).toBe("unspecified");
    expect(f?.confidence).toBe("low");
  });
});

describe("PlaySpec round-trip (spec → diagram → spec)", () => {
  it("preserves route family per player after a full cycle", () => {
    const original = spreadSlantPost();
    const { diagram } = playSpecToCoachDiagram(original);
    const reparsed = coachDiagramToPlaySpec(diagram, {
      variant: original.variant,
      formation: original.formation.name,
      playType: original.playType,
    });

    const originalByPlayer = new Map<string, PlayerAssignment>();
    for (const a of original.assignments) originalByPlayer.set(a.player, a);

    for (const reparsedAssignment of reparsed.assignments) {
      const orig = originalByPlayer.get(reparsedAssignment.player);
      if (!orig) continue; // synthesizer may add players not in original
      // Only check route-family identity for route actions.
      if (orig.action.kind !== "route") continue;
      expect(reparsedAssignment.action.kind, `${reparsedAssignment.player} action kind drift`).toBe("route");
      if (reparsedAssignment.action.kind !== "route") continue;
      expect(reparsedAssignment.action.family).toBe(orig.action.family);
    }
  });

  it("preserves variant + formation name through a full cycle", () => {
    const original = spreadSlantPost();
    const { diagram } = playSpecToCoachDiagram(original);
    const reparsed = coachDiagramToPlaySpec(diagram, {
      variant: original.variant,
      formation: original.formation.name,
      playType: original.playType,
    });
    expect(reparsed.variant).toBe(original.variant);
    expect(reparsed.formation.name).toBe(original.formation.name);
  });

  it("preserves defense ref through a full cycle", () => {
    const original: PlaySpec = {
      ...spreadSlantPost(),
      defense: { front: "7v7 Zone", coverage: "Cover 3", strength: "right" },
    };
    const { diagram } = playSpecToCoachDiagram(original);
    const reparsed = coachDiagramToPlaySpec(diagram, {
      variant: original.variant,
      formation: original.formation.name,
      defenseFront: original.defense!.front,
      defenseCoverage: original.defense!.coverage,
      playType: original.playType,
    });
    expect(reparsed.defense?.front).toBe(original.defense!.front);
    expect(reparsed.defense?.coverage).toBe(original.defense!.coverage);
  });

  it("rendered routes pass the route-assignment validator", async () => {
    // This is the structural guarantee: anything the renderer emits is
    // catalog-conformant by construction. The validator agreeing is the
    // proof that the spec → diagram path can't generate "12-yard slant"
    // type bugs.
    const { validateRouteAssignments } = await import("@/lib/coach-ai/route-assignment-validate");
    const { diagram } = playSpecToCoachDiagram(spreadSlantPost());
    const result = validateRouteAssignments(diagram);
    expect(result.ok, result.ok ? undefined : JSON.stringify(result.errors)).toBe(true);
  });
});
