/**
 * Parser tests — defender movement round-trip.
 *
 * The screenshot bug ("I can move defenders but I can't draw routes for
 * them"): when a coach drags a path on a defender in the editor, the route
 * lands on `doc.layers.routes` carried by the defender. Without parser
 * support, that route is silently dropped from the derived PlaySpec — Cal
 * can't see it, notes can't describe it, and on the next save → load the
 * canvas re-renders without the movement.
 *
 * The fix: defender routes parse into `defenderAssignments[]` with a
 * `custom_path` action so the waypoints survive the round-trip.
 */

import { describe, expect, it } from "vitest";
import { coachDiagramToPlaySpec } from "./specParser";
import { playSpecToCoachDiagram } from "./specRenderer";
import { PLAY_SPEC_SCHEMA_VERSION, type PlaySpec } from "./spec";
import type { CoachDiagram } from "@/features/coach-ai/coachDiagramConverter";

function makeDefenseDiagram(overrides: Partial<CoachDiagram> = {}): CoachDiagram {
  return {
    variant: "flag_7v7",
    title: "Cover 1 with FS rotation",
    focus: "D",
    players: [
      { id: "FS", team: "D", x: 0, y: 12 },
      { id: "SS", team: "D", x: 6, y: 8 },
      { id: "M",  team: "D", x: 0, y: 5 },
      { id: "CB", team: "D", x: -10, y: 7 },
    ],
    routes: [],
    ...overrides,
  };
}

describe("specParser — defender movement preservation", () => {
  it("converts a defender route into a custom_path defenderAssignment", () => {
    const spec = coachDiagramToPlaySpec(
      makeDefenseDiagram({
        routes: [
          // FS rotates from deep middle down to the strong-side flat
          { from: "FS", path: [[6, 5]] },
        ],
      }),
    );

    expect(spec.defenderAssignments).toBeDefined();
    expect(spec.defenderAssignments).toHaveLength(1);
    const fs = spec.defenderAssignments![0];
    expect(fs.defender).toBe("FS");
    expect(fs.action.kind).toBe("custom_path");
    if (fs.action.kind !== "custom_path") throw new Error("type guard");
    expect(fs.action.waypoints).toEqual([[6, 5]]);
  });

  it("preserves multiple waypoints in order", () => {
    const spec = coachDiagramToPlaySpec(
      makeDefenseDiagram({
        routes: [
          { from: "M", path: [[3, 8], [8, 8], [8, 3]] },
        ],
      }),
    );

    const m = spec.defenderAssignments?.find((a) => a.defender === "M");
    expect(m).toBeDefined();
    if (m!.action.kind !== "custom_path") throw new Error("type guard");
    expect(m!.action.waypoints).toEqual([[3, 8], [8, 8], [8, 3]]);
  });

  it("preserves the curve flag", () => {
    const spec = coachDiagramToPlaySpec(
      makeDefenseDiagram({
        routes: [
          { from: "SS", path: [[0, 12]], curve: true },
        ],
      }),
    );
    const ss = spec.defenderAssignments?.find((a) => a.defender === "SS");
    if (ss!.action.kind !== "custom_path") throw new Error("type guard");
    expect(ss!.action.curve).toBe(true);
  });

  it("emits no defenderAssignments when no defender routes are present", () => {
    const spec = coachDiagramToPlaySpec(makeDefenseDiagram());
    expect(spec.defenderAssignments).toBeUndefined();
  });

  it("does NOT confuse offensive routes with defender movement", () => {
    const spec = coachDiagramToPlaySpec({
      variant: "flag_7v7",
      players: [
        { id: "X", team: "O", x: -10, y: 0 },
        { id: "Z", team: "O", x: 10, y: 0 },
        { id: "FS", team: "D", x: 0, y: 12 },
      ],
      routes: [
        { from: "X", path: [[-10, 8]] },     // offensive route
        { from: "FS", path: [[5, 5]] },      // defender movement
      ],
    });

    // Offensive routes flow into assignments, defender routes flow into
    // defenderAssignments — neither bucket should pick up the other.
    const xAssign = spec.assignments.find((a) => a.player === "X");
    expect(xAssign).toBeDefined();
    expect(spec.defenderAssignments).toHaveLength(1);
    expect(spec.defenderAssignments![0].defender).toBe("FS");
  });

  it("ignores defender routes with empty paths (sanitizer-equivalent)", () => {
    const spec = coachDiagramToPlaySpec(
      makeDefenseDiagram({
        // Empty path → not a real movement; the canvas wouldn't have
        // produced this either, but we guard for hand-edited JSON.
        routes: [{ from: "FS", path: [] }],
      }),
    );
    expect(spec.defenderAssignments).toBeUndefined();
  });

  it("round-trips a custom_path defender action through render → parse", () => {
    // The full Cal-exercised loop: a spec containing custom_path defender
    // movement must render to a diagram and parse back without losing the
    // waypoints. This is the test that catches future renderer/parser
    // refactors that silently strip defender movement.
    const original: PlaySpec = {
      schemaVersion: PLAY_SPEC_SCHEMA_VERSION,
      variant: "flag_7v7",
      formation: { name: "Spread Doubles" },
      defense: { front: "7v7 Zone", coverage: "Cover 3" },
      assignments: [
        { player: "X", action: { kind: "route", family: "Slant" } },
      ],
      defenderAssignments: [
        {
          defender: "FS",
          action: {
            kind: "custom_path",
            description: "FS rotates down to robber",
            waypoints: [[2, 6]],
          },
        },
      ],
    };

    const { diagram } = playSpecToCoachDiagram(original);
    const reparsed = coachDiagramToPlaySpec(diagram, {
      variant: "flag_7v7",
      defenseFront: "7v7 Zone",
      defenseCoverage: "Cover 3",
    });

    const fs = reparsed.defenderAssignments?.find((a) => a.defender === "FS");
    expect(fs, "FS movement should round-trip").toBeDefined();
    if (fs!.action.kind !== "custom_path") throw new Error("type guard");
    expect(fs!.action.waypoints).toBeDefined();
    expect(fs!.action.waypoints!.length).toBeGreaterThan(0);
    // Final waypoint should match the original spec waypoint (renderer
    // anchors at the defender's catalog position; parser reads back the
    // diagram-coordinate path).
    const lastReparsed = fs!.action.waypoints![fs!.action.waypoints!.length - 1];
    expect(lastReparsed[0]).toBeCloseTo(2, 0);
    expect(lastReparsed[1]).toBeCloseTo(6, 0);
  });

  it("generates a coach-readable description for hand-drawn movement", () => {
    const spec = coachDiagramToPlaySpec(
      makeDefenseDiagram({
        routes: [
          // FS drives from the deep middle down toward the LOS, sliding
          // to the right hash.
          { from: "FS", path: [[8, 4]] },
        ],
      }),
    );
    const fs = spec.defenderAssignments?.[0];
    if (fs!.action.kind !== "custom_path") throw new Error("type guard");
    // Description should mention the defender + a direction so the
    // notes-from-spec projection has something concrete to render even
    // when the coach didn't write notes.
    expect(fs!.action.description).toMatch(/FS/);
    expect(fs!.action.description.length).toBeGreaterThan(5);
  });
});
