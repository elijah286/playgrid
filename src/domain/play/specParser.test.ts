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

describe("specParser — run-play primitives (route_kind 'carry' + 'handoff')", () => {
  // Surfaced 2026-05-25 production: a coach saw a Dive Right run play
  // whose notes said "(unconfirmed) @QB: Unrecognized route_kind
  // 'carry'." / "(unconfirmed) @B: Unrecognized route_kind 'carry'."
  //
  // Cause: `actionFromRoute` in specParser.ts treats `route_kind` as a
  // route family name and tries to look it up in the catalog. "carry"
  // isn't a route family — it's a run-play primitive (the ball-carrier
  // path). The lookup fails and falls through to a custom action with
  // the misleading "Unrecognized" description. Same applies to
  // `route_kind: "handoff"` (the renderer-only indicator arrow between
  // QB and ball-carrier).
  //
  // Fix: recognize "carry" → `{ kind: "carry", waypoints: path }`
  // BEFORE the template lookup; recognize "handoff" → `{ kind:
  // "unspecified" }` (the handoff indicator is metadata, not an
  // assignment — the ballPath ledger carries the real exchange info).

  function makeOffenseDiagram(overrides: Partial<CoachDiagram> = {}): CoachDiagram {
    return {
      variant: "tackle_11",
      title: "Dive Right",
      players: [
        { id: "QB", team: "O", x: 0, y: -5 },
        { id: "B",  team: "O", x: 0, y: -7 },
        { id: "LT", team: "O", x: -3, y: 0 },
        { id: "C",  team: "O", x: 0, y: 0 },
        { id: "RT", team: "O", x: 3, y: 0 },
      ],
      routes: [],
      ...overrides,
    };
  }

  it("parses route_kind='carry' as a kind:'carry' assignment (NOT custom)", () => {
    const spec = coachDiagramToPlaySpec(
      makeOffenseDiagram({
        routes: [
          { from: "B", route_kind: "carry", path: [[1, 0], [3, 2], [5, 5]] },
        ],
      }),
    );
    const b = spec.assignments.find((a) => a.player === "B");
    expect(b).toBeDefined();
    if (!b) return;
    // The whole point of the fix: kind must be "carry", not "custom"
    // with an "Unrecognized" description.
    expect(b.action.kind).toBe("carry");
    if (b.action.kind !== "carry") return;
    expect(b.action.waypoints).toEqual([[1, 0], [3, 2], [5, 5]]);
  });

  it("does NOT emit 'Unrecognized route_kind' for kind:'carry' routes", () => {
    const spec = coachDiagramToPlaySpec(
      makeOffenseDiagram({
        routes: [
          { from: "B", route_kind: "carry", path: [[1, 5]] },
          { from: "QB", route_kind: "carry", path: [[0, -3]] },
        ],
      }),
    );
    for (const a of spec.assignments) {
      if (a.action.kind === "custom") {
        expect(a.action.description).not.toMatch(/Unrecognized/i);
      }
    }
  });

  it("parses route_kind='handoff' as an indicator (no real assignment kind)", () => {
    // The handoff arrow is a renderer-only indicator route showing the
    // QB → carrier exchange. It carries no per-player intent — the
    // ballPath ledger is the source of truth for handoffs. The parser
    // should treat handoff routes as informational, NOT as a custom
    // action that emits "Unrecognized" in notes.
    const spec = coachDiagramToPlaySpec(
      makeOffenseDiagram({
        routes: [
          { from: "QB", route_kind: "handoff", path: [[0, -6]] },
        ],
      }),
    );
    const qb = spec.assignments.find((a) => a.player === "QB");
    expect(qb).toBeDefined();
    if (!qb) return;
    // Must NOT be a custom "Unrecognized" — either unspecified, block,
    // or absent (filtered out). The strong assertion is "no Unrecognized
    // in the description if it ends up as custom."
    if (qb.action.kind === "custom") {
      expect(qb.action.description).not.toMatch(/Unrecognized/i);
    }
  });
});
