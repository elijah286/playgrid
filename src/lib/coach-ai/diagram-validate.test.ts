/**
 * Goldens for the chat-time validateDiagrams checks added 2026-05-02:
 *   1. validateRouteAssignments runs at chat-time (was: only at SAVE)
 *   2. Prose-completeness: every skill player with a route must be
 *      mentioned by @Label in the prose
 *
 * Both fixes are responses to a coach surfacing in production:
 *   - "X is not a slant" — the diagram had X with declared route_kind
 *     "Slant" but at 12yd depth (catalog Slant range is [3, 7]).
 *     SAVE-time validator would have caught it; chat preview did not.
 *   - "doesn't explain Z" — Z was on a vertical clear-out in the
 *     diagram, but Cal's prose only mentioned X / B / H / S.
 */

import { describe, expect, it } from "vitest";
import { validateDiagrams } from "./diagram-validate";

function makeFence(diagram: object): string {
  return ["```play", JSON.stringify(diagram), "```"].join("\n");
}

/** Helper: provide get_route_template snapshots so the existing
 *  named-route compliance check passes. Tests targeting the NEW
 *  validators (route_kind geometry, prose-completeness) bypass that
 *  check by supplying matching snapshots so we isolate the behavior
 *  under test. */
function snapshot(name: string, playerX: number, playerY: number, path: Array<[number, number]>, curve = false) {
  return { name, playerX, playerY, path, curve };
}

describe("validateDiagrams — chat-time route_kind geometry check", () => {
  it("REJECTS a 12-yard 'Slant' (depth outside catalog range [3, 7])", () => {
    const fence = makeFence({
      title: "Test",
      variant: "tackle_11",
      players: [
        { id: "Q", x: 0, y: -3, team: "O" },
        { id: "X", x: -13, y: 0, team: "O" },
      ],
      routes: [
        { from: "X", path: [[-13, 3], [-7, 12]], route_kind: "Slant" },
      ],
    });
    const result = validateDiagrams({
      text: `${fence}\n@X runs a slant.`,
      variant: "tackle_11",
      lastPlaceDefense: null,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const slantError = result.errors.find((e) => e.toLowerCase().includes("slant"));
    expect(slantError).toBeDefined();
  });

  it("ACCEPTS a canonical 5-yard slant", () => {
    const fence = makeFence({
      title: "Test",
      variant: "tackle_11",
      players: [
        { id: "Q", x: 0, y: -3, team: "O" },
        { id: "X", x: -13, y: 0, team: "O" },
      ],
      routes: [
        { from: "X", path: [[-13, 3], [-7, 5.8]], route_kind: "Slant" },
      ],
    });
    const result = validateDiagrams({
      text: `${fence}\n@X runs a slant.`,
      variant: "tackle_11",
      lastPlaceDefense: null,
      routeTemplates: [
        snapshot("Slant", -13, 0, [[-13, 3], [-7, 5.8]]),
      ],
    });
    expect(result.ok, result.ok ? undefined : result.errors.join(" | ")).toBe(true);
  });
});

describe("validateDiagrams — prose-completeness", () => {
  it("REJECTS a play whose prose omits a skill player with a route", () => {
    // The 2026-05-02 production case: Z runs a vertical but the prose
    // never mentions @Z.
    const fence = makeFence({
      title: "Test",
      variant: "tackle_11",
      players: [
        { id: "Q", x: 0, y: -3, team: "O" },
        { id: "X", x: -13, y: 0, team: "O" },
        { id: "Z", x: 13, y: 0, team: "O" },
      ],
      routes: [
        { from: "X", path: [[-13, 3], [-7, 5.8]], route_kind: "Slant" },
        { from: "Z", path: [[13, 5], [13, 18]], route_kind: "Go" },
      ],
    });
    const result = validateDiagrams({
      text: `${fence}\n@X runs a slant.`, // Z omitted!
      variant: "tackle_11",
      lastPlaceDefense: null,
      routeTemplates: [
        snapshot("Slant", -13, 0, [[-13, 3], [-7, 5.8]]),
        snapshot("Go", 13, 0, [[13, 5], [13, 18]]),
      ],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const omittedError = result.errors.find((e) => e.includes("omits") && e.includes("@Z"));
    expect(omittedError).toBeDefined();
  });

  it("ACCEPTS a play whose prose mentions every skill player with a route", () => {
    const fence = makeFence({
      title: "Test",
      variant: "tackle_11",
      players: [
        { id: "Q", x: 0, y: -3, team: "O" },
        { id: "X", x: -13, y: 0, team: "O" },
        { id: "Z", x: 13, y: 0, team: "O" },
      ],
      routes: [
        { from: "X", path: [[-13, 3], [-7, 5.8]], route_kind: "Slant" },
        { from: "Z", path: [[13, 5], [13, 18]], route_kind: "Go" },
      ],
    });
    const result = validateDiagrams({
      text: `${fence}\n@X runs a slant. @Z runs a vertical to clear the deep zone.`,
      variant: "tackle_11",
      lastPlaceDefense: null,
      routeTemplates: [
        snapshot("Slant", -13, 0, [[-13, 3], [-7, 5.8]]),
        snapshot("Go", 13, 0, [[13, 5], [13, 18]]),
      ],
    });
    expect(result.ok, result.ok ? undefined : result.errors.join(" | ")).toBe(true);
  });

  it("EXEMPTS linemen and QB from the prose-mention requirement", () => {
    // Linemen running pass-protection / RB drop routes don't need
    // narration in the prose.
    const fence = makeFence({
      title: "Test",
      variant: "tackle_11",
      players: [
        { id: "Q", x: 0, y: -3, team: "O" },
        { id: "C", x: 0, y: 0, team: "O" },
        { id: "X", x: -13, y: 0, team: "O" },
      ],
      routes: [
        { from: "X", path: [[-13, 3], [-7, 5.8]], route_kind: "Slant" },
      ],
    });
    const result = validateDiagrams({
      text: `${fence}\n@X runs a slant.`, // No mention of @C or @Q
      variant: "tackle_11",
      lastPlaceDefense: null,
      routeTemplates: [snapshot("Slant", -13, 0, [[-13, 3], [-7, 5.8]])],
    });
    expect(result.ok, result.ok ? undefined : result.errors.join(" | ")).toBe(true);
  });
});
