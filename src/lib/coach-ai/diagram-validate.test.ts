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

  it("placeholder section break — see Flood side check below", () => {
    expect(true).toBe(true);
  });
});

describe("validateDiagrams — side enforcement (Flood / Sail)", () => {
  // Flood is a side-flooding concept: the catalog's family+depth match
  // must additionally satisfy "all 3 matched players on the same side".
  // Without this, Cal could put Corner on the left + Curl on the right
  // and the matcher passes — which is what surfaced 2026-05-02 (a
  // "Flood Left" with Z and S on the right side of the formation).

  it("REJECTS a Flood when matched players span both sides of the formation", () => {
    // Corner at depth 14 (in [12,18]), Curl at 5 (in [4,7]), Flat at 2
    // (in [0,4]). Catalog-compliant geometries; concept matcher passes
    // family+depth — but the players span both sides, so the side
    // check rejects.
    const fence = makeFence({
      title: "Flood Left",
      variant: "tackle_11",
      players: [
        { id: "Q", x: 0,   y: -3, team: "O" },
        { id: "X", x: -22, y:  0, team: "O" }, // left  — Corner deep
        { id: "S", x:  10, y:  0, team: "O" }, // RIGHT — Curl (wrong side!)
        { id: "B", x:  -3, y:  0, team: "O" }, // left  — Flat
      ],
      routes: [
        // X (left, x=-22) Corner breaks OUTSIDE = toward LEFT sideline → more negative x.
        { from: "X", path: [[-26, 14]],  route_kind: "Corner" },
        // S (right, x=10) Curl settles toward QB → slightly inside (more negative x).
        { from: "S", path: [[8,    5]],  route_kind: "Curl" },
        // B (left, x=-3) Flat releases toward LEFT sideline → more negative x.
        { from: "B", path: [[-12,  2]],  route_kind: "Flat" },
      ],
    });
    const result = validateDiagrams({
      text: `${fence}\n@X runs a corner. @S runs a curl. @B runs a flat. Flood Left.`,
      variant: "tackle_11",
      lastPlaceDefense: null,
      routeTemplates: [
        snapshot("Corner", -22, 0, [[-26, 14]]),
        snapshot("Curl",    10, 0, [[8,    5]]),
        snapshot("Flat",    -3, 0, [[-12,  2]]),
      ],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const sideError = result.errors.find((e) => e.toLowerCase().includes("same side"));
    expect(sideError, `expected a same-side error; got: ${result.errors.join(" | ")}`).toBeDefined();
  });

  it("ACCEPTS a Flood when all 3 matched players are on the same side", () => {
    const fence = makeFence({
      title: "Flood Right",
      variant: "tackle_11",
      players: [
        { id: "Q", x:   0, y: -3, team: "O" },
        { id: "Z", x:  22, y:  0, team: "O" },
        { id: "S", x:  10, y:  0, team: "O" },
        { id: "B", x:   3, y:  0, team: "O" },
      ],
      routes: [
        // Z (right, x=22) Corner breaks OUTSIDE = toward RIGHT sideline → more positive x.
        { from: "Z", path: [[26, 14]], route_kind: "Corner" },
        // S (right, x=10) Curl settles toward QB → slightly inside (more negative x).
        { from: "S", path: [[8,   5]], route_kind: "Curl" },
        // B (right, x=3) Flat releases toward RIGHT sideline → more positive x.
        { from: "B", path: [[12,  2]], route_kind: "Flat" },
      ],
    });
    const result = validateDiagrams({
      text: `${fence}\n@Z runs a corner. @S runs a curl. @B runs a flat. Flood Right.`,
      variant: "tackle_11",
      lastPlaceDefense: null,
      routeTemplates: [
        snapshot("Corner", 22, 0, [[26, 14]]),
        snapshot("Curl",   10, 0, [[8,   5]]),
        snapshot("Flat",    3, 0, [[12,  2]]),
      ],
    });
    expect(result.ok, result.ok ? undefined : result.errors.join(" | ")).toBe(true);
  });
});

describe("validateDiagrams — tackle_11 OL-completeness", () => {
  // 2026-05-02: coach reported an I-Form Flood Right where Cal
  // hand-authored only 8 offensive players (LG + RT + Q + F + B + X +
  // Y + Z) and dropped LT, C, RG. The pre-existing place_offense gate
  // didn't fire because offense.length=8 < 11 (the gate triggers at
  // ≥ variant count). This validator catches the missing-OL case
  // regardless of total count.

  it("REJECTS a tackle_11 full play missing LT, C, and RG", () => {
    // Full play (7+ offensive players) so the OL-completeness check
    // fires. Single-route demos with fewer players are exempt.
    const fence = makeFence({
      title: "Hand-authored play",
      variant: "tackle_11",
      players: [
        { id: "Q",  x:  0, y: -3, team: "O" },
        { id: "LG", x: -2, y:  0, team: "O" }, // present
        { id: "RT", x:  4, y:  0, team: "O" }, // present
        { id: "X",  x: -18, y: 0, team: "O" },
        { id: "Z",  x:  18, y: 0, team: "O" },
        { id: "Y",  x:   6, y: 0, team: "O" },
        { id: "B",  x:  -4, y: -5, team: "O" },
        { id: "F",  x:   4, y: -5, team: "O" },
        // MISSING: LT, C, RG (still 8 offensive players >= 7 threshold)
      ],
      routes: [],
    });
    const result = validateDiagrams({
      text: fence,
      variant: "tackle_11",
      lastPlaceDefense: null,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const olError = result.errors.find((e) => e.includes("missing required offensive linemen"));
    expect(olError, `expected an OL-completeness error; got: ${result.errors.join(" | ")}`).toBeDefined();
    expect(olError).toContain("LT");
    expect(olError).toContain("C");
    expect(olError).toContain("RG");
  });

  it("REJECTS a tackle_11 play with all 5 OL but STACKED at the same x", () => {
    // The actual failure mode coach hit: Cal authored all 5 OL IDs but
    // placed them at overlapping x positions. Overlap resolver skips
    // OL-OL pairs (real splits are tight) so it doesn't separate them,
    // and the IDs all exist so the missing-OL check above doesn't fire.
    // This validator catches stacked OL specifically.
    const fence = makeFence({
      title: "I-Form Flood Right (broken)",
      variant: "tackle_11",
      players: [
        { id: "Q",  x:  0, y: -3, team: "O" },
        // 5 OL IDs all present BUT 3 stacked on x=-2 and 2 stacked on x=4 (Cal's hand-authoring failure).
        { id: "LT", x: -2, y:  0, team: "O" },
        { id: "LG", x: -2, y:  0, team: "O" },
        { id: "C",  x: -2, y:  0, team: "O" },
        { id: "RG", x:  4, y:  0, team: "O" },
        { id: "RT", x:  4, y:  0, team: "O" },
        { id: "X",  x: -18, y: 0, team: "O" },
        { id: "Z",  x:  18, y: 0, team: "O" },
        { id: "Y",  x:   6, y: 0, team: "O" },
        { id: "F",  x:   0, y: -3, team: "O" },
        { id: "B",  x:   0, y: -6, team: "O" },
      ],
      routes: [],
    });
    const result = validateDiagrams({
      text: fence,
      variant: "tackle_11",
      lastPlaceDefense: null,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const stackError = result.errors.find((e) => e.toLowerCase().includes("stacked"));
    expect(stackError, `expected an OL-stacking error; got: ${result.errors.join(" | ")}`).toBeDefined();
  });

  it("ACCEPTS a tackle_11 play that has all 5 OL", () => {
    const fence = makeFence({
      title: "Complete play",
      variant: "tackle_11",
      players: [
        { id: "Q",  x:  0, y: -3, team: "O" },
        { id: "LT", x: -4, y:  0, team: "O" },
        { id: "LG", x: -2, y:  0, team: "O" },
        { id: "C",  x:  0, y:  0, team: "O" },
        { id: "RG", x:  2, y:  0, team: "O" },
        { id: "RT", x:  4, y:  0, team: "O" },
        { id: "X",  x: -18, y: 0, team: "O" },
        { id: "Z",  x:  18, y: 0, team: "O" },
        { id: "B",  x:  -4, y: -5, team: "O" },
      ],
      routes: [],
    });
    const result = validateDiagrams({
      text: fence,
      variant: "tackle_11",
      lastPlaceDefense: null,
    });
    // No OL-completeness error specifically. Other validators may fire
    // (e.g., place_offense gate if 11+ players hand-authored), but the
    // OL-completeness check shouldn't.
    if (!result.ok) {
      const olError = result.errors.find((e) => e.includes("missing required offensive linemen"));
      expect(olError, `unexpected OL-completeness error: ${result.errors.join(" | ")}`).toBeUndefined();
    }
  });

  it("EXEMPTS flag variants from the OL-completeness check (no OL row in flag)", () => {
    const fence = makeFence({
      title: "Flag play",
      variant: "flag_5v5",
      players: [
        { id: "Q", x: 0,   y: -3, team: "O" },
        { id: "C", x: 0,   y:  0, team: "O" },
        { id: "X", x: -10, y:  0, team: "O" },
      ],
      routes: [],
    });
    const result = validateDiagrams({
      text: fence,
      variant: "flag_5v5",
      lastPlaceDefense: null,
    });
    // No tackle_11 check. May fail other checks but NOT for "missing OL".
    if (!result.ok) {
      const olError = result.errors.find((e) => e.includes("missing required offensive linemen"));
      expect(olError).toBeUndefined();
    }
  });
});

describe("validateDiagrams — concept-claim requires skeleton/modify tool", () => {
  // 2026-05-02: Cal hand-authored a "Mesh" with both drags at 2yd. The
  // catalog's assertConcept layer rejects when the spec's depth values
  // are clean, but the only structural way to guarantee canonical
  // geometry is to route through get_concept_skeleton. This gate fires
  // when a full play CLAIMS a catalog concept name without calling
  // either the skeleton tool or one of the modify tools.

  function fullTackleMeshFence() {
    return makeFence({
      title: "Spread Doubles — Mesh",
      variant: "tackle_11",
      players: [
        { id: "Q", x: 0, y: -3, team: "O" },
        { id: "LT", x: -4, y: 0, team: "O" }, { id: "LG", x: -2, y: 0, team: "O" },
        { id: "C",  x: 0,  y: 0, team: "O" }, { id: "RG", x: 2,  y: 0, team: "O" },
        { id: "RT", x: 4,  y: 0, team: "O" },
        { id: "X", x: -18, y: 0, team: "O" }, { id: "Z", x: 18, y: 0, team: "O" },
        { id: "H", x: -10, y: -1, team: "O" }, { id: "S", x: 10, y: -1, team: "O" },
        { id: "B", x: 2, y: -5, team: "O" },
      ],
      routes: [
        { from: "H", path: [[-10, 2], [10, 2]], route_kind: "Drag" },
        { from: "S", path: [[10, 2], [-10, 2]], route_kind: "Drag" },
      ],
    });
  }

  it("REJECTS a full Mesh play when no skeleton or modify tool was called", () => {
    const result = validateDiagrams({
      text: `${fullTackleMeshFence()}\n@H drag, @S drag — Mesh concept.`,
      variant: "tackle_11",
      lastPlaceDefense: null,
      placeOffenseCalled: true,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const skeletonError = result.errors.find((e) => e.includes("get_concept_skeleton"));
    expect(skeletonError).toBeDefined();
  });

  it("ACCEPTS a full Mesh play when get_concept_skeleton was called", () => {
    const result = validateDiagrams({
      text: `${fullTackleMeshFence()}\n@H drag, @S drag — Mesh concept.`,
      variant: "tackle_11",
      lastPlaceDefense: null,
      placeOffenseCalled: true,
      conceptSkeletonCalled: true,
    });
    // The concept-skeleton gate doesn't fire — though other gates may
    // (skipping route templates, mesh assertConcept rejecting both at
    // 2yd, etc.). We only check that THIS gate didn't trigger.
    if (!result.ok) {
      expect(result.errors.find((e) => e.includes("did NOT call get_concept_skeleton"))).toBeUndefined();
    }
  });

  it("ACCEPTS when modify_play_route was called (surgical edit path)", () => {
    const result = validateDiagrams({
      text: `${fullTackleMeshFence()}\n@H drag, @S drag — Mesh concept.`,
      variant: "tackle_11",
      lastPlaceDefense: null,
      placeOffenseCalled: true,
      modifyPlayRouteCalled: true,
    });
    if (!result.ok) {
      expect(result.errors.find((e) => e.includes("did NOT call get_concept_skeleton"))).toBeUndefined();
    }
  });
});

describe("validateDiagrams — modify-not-regenerate gate", () => {
  // 2026-05-02: coach asked "make one of the mesh routes a lot deeper"
  // and Cal redrew the entire play with a different formation, swapped
  // player roles, and a 20yd dig that broke the mesh concept. This
  // gate enforces that when the prior turn had a fence and the new
  // turn emits a fence, one of the surgical-modify tools must have run
  // (unless the user explicitly asked for a fresh play).

  const minimalFence = makeFence({
    title: "Test",
    variant: "tackle_11",
    players: [
      { id: "Q", x: 0, y: -3, team: "O" },
      { id: "X", x: -13, y: 0, team: "O" },
    ],
    routes: [{ from: "X", path: [[-13, 3], [-7, 5.8]], route_kind: "Slant" }],
  });

  it("REJECTS regeneration when prior fence existed and no modify tool was called", () => {
    const result = validateDiagrams({
      text: `${minimalFence}\n@X runs a slant.`,
      variant: "tackle_11",
      lastPlaceDefense: null,
      routeTemplates: [snapshot("Slant", -13, 0, [[-13, 3], [-7, 5.8]])],
      priorAssistantTurnHadFence: true,
      userRequestsNewPlay: false,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const regenError = result.errors.find((e) => e.includes("regenerated from scratch"));
    expect(regenError).toBeDefined();
  });

  it("ACCEPTS when modify_play_route was called this turn", () => {
    const result = validateDiagrams({
      text: `${minimalFence}\n@X runs a slant.`,
      variant: "tackle_11",
      lastPlaceDefense: null,
      routeTemplates: [snapshot("Slant", -13, 0, [[-13, 3], [-7, 5.8]])],
      priorAssistantTurnHadFence: true,
      userRequestsNewPlay: false,
      modifyPlayRouteCalled: true,
    });
    expect(result.ok, result.ok ? undefined : result.errors.join(" | ")).toBe(true);
  });

  it("ACCEPTS when add_defense_to_play was called this turn", () => {
    const result = validateDiagrams({
      text: `${minimalFence}\n@X runs a slant.`,
      variant: "tackle_11",
      lastPlaceDefense: null,
      routeTemplates: [snapshot("Slant", -13, 0, [[-13, 3], [-7, 5.8]])],
      priorAssistantTurnHadFence: true,
      userRequestsNewPlay: false,
      addDefenseToPlayCalled: true,
    });
    expect(result.ok, result.ok ? undefined : result.errors.join(" | ")).toBe(true);
  });

  it("ACCEPTS when the user explicitly requested a new play", () => {
    const result = validateDiagrams({
      text: `${minimalFence}\n@X runs a slant.`,
      variant: "tackle_11",
      lastPlaceDefense: null,
      routeTemplates: [snapshot("Slant", -13, 0, [[-13, 3], [-7, 5.8]])],
      priorAssistantTurnHadFence: true,
      userRequestsNewPlay: true,
    });
    expect(result.ok, result.ok ? undefined : result.errors.join(" | ")).toBe(true);
  });

  it("ACCEPTS the first play of a session (no prior fence)", () => {
    const result = validateDiagrams({
      text: `${minimalFence}\n@X runs a slant.`,
      variant: "tackle_11",
      lastPlaceDefense: null,
      routeTemplates: [snapshot("Slant", -13, 0, [[-13, 3], [-7, 5.8]])],
      priorAssistantTurnHadFence: false,
    });
    expect(result.ok, result.ok ? undefined : result.errors.join(" | ")).toBe(true);
  });
});

describe("validateDiagrams — bare prose-mention exemption", () => {
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
