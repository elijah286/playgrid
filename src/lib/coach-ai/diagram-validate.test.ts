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
    // Corner at depth 14 (in [12,18]), Out at 8 (in [7,10]), Flat at 2
    // (in [0,4]). Catalog-compliant geometries; concept matcher passes
    // family+depth — but the players span both sides, so the side
    // check rejects.
    const fence = makeFence({
      title: "Flood Left",
      variant: "tackle_11",
      players: [
        { id: "Q", x: 0,   y: -3, team: "O" },
        { id: "X", x: -22, y:  0, team: "O" }, // left  — Corner deep
        { id: "S", x:  10, y:  0, team: "O" }, // RIGHT — Out (wrong side!)
        { id: "B", x:  -3, y:  0, team: "O" }, // left  — Flat
      ],
      routes: [
        // X (left, x=-22) Corner breaks OUTSIDE = toward LEFT sideline → more negative x.
        { from: "X", path: [[-26, 14]],  route_kind: "Corner" },
        // S (right, x=10) Out breaks toward sideline → more positive x.
        { from: "S", path: [[14,    8]],  route_kind: "Out" },
        // B (left, x=-3) Flat releases toward LEFT sideline → more negative x.
        { from: "B", path: [[-12,  2]],  route_kind: "Flat" },
      ],
    });
    const result = validateDiagrams({
      text: `${fence}\n@X runs a corner. @S runs an out. @B runs a flat. Flood Left.`,
      variant: "tackle_11",
      lastPlaceDefense: null,
      routeTemplates: [
        snapshot("Corner", -22, 0, [[-26, 14]]),
        snapshot("Out",     10, 0, [[14,    8]]),
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
        // S (right, x=10) Out breaks toward right sideline → more positive x.
        { from: "S", path: [[16,  8]], route_kind: "Out" },
        // B (right, x=3) Flat releases toward RIGHT sideline → more positive x.
        { from: "B", path: [[12,  2]], route_kind: "Flat" },
      ],
    });
    const result = validateDiagrams({
      text: `${fence}\n@Z runs a corner. @S runs an out. @B runs a flat. Flood Right.`,
      variant: "tackle_11",
      lastPlaceDefense: null,
      routeTemplates: [
        snapshot("Corner", 22, 0, [[26, 14]]),
        snapshot("Out",    10, 0, [[16,  8]]),
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

describe("validateDiagrams — skeleton-fidelity gate", () => {
  // 2026-05-02 image-1 retry: even with the concept-skeleton-required
  // gate, Cal called get_concept_skeleton, IGNORED its returned fence,
  // and re-rendered Mesh routes via get_route_template at default
  // depth — H@~2yd and S@~2yd, collapsing the staggered cross. The
  // fidelity gate compares emitted route paths against the skeleton's
  // returned fence per-player and forces re-emit on depth drift.

  function meshSkeletonFence() {
    return JSON.stringify({
      title: "Mesh",
      variant: "tackle_11",
      players: [
        { id: "Q", x: 0, y: -3, team: "O" },
        { id: "H", x: -10, y: -1, team: "O" },
        { id: "S", x: 10, y: -1, team: "O" },
      ],
      routes: [
        // Skeleton's H drag at depth=2 → max y=1 from carrier.y=-1
        { from: "H", path: [[-8.3, 1], [-0.4, 1], [12.9, 1]], route_kind: "Drag" },
        // Skeleton's S drag at depth=6 → max y=5 from carrier.y=-1
        { from: "S", path: [[8.4, 5], [0.4, 5], [-12.8, 5]], route_kind: "Drag" },
      ],
    });
  }

  function fullMeshFenceWithRoutes(hMaxY: number, sMaxY: number) {
    return makeFence({
      title: "Mesh",
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
        { from: "H", path: [[-8.3, hMaxY], [12.9, hMaxY]], route_kind: "Drag" },
        { from: "S", path: [[8.4, sMaxY], [-12.8, sMaxY]], route_kind: "Drag" },
      ],
    });
  }

  it("REJECTS when emitted routes drift from skeleton's depths (image-1 retry)", () => {
    // Skeleton: H@max-y=1, S@max-y=5. Emitted: both at max-y=2 (Cal
    // rebuilt at default ~2yd). Fidelity gate must catch this even
    // though conceptSkeletonCalled=true.
    const result = validateDiagrams({
      text:
        `${fullMeshFenceWithRoutes(2, 2)}\n` +
        `Mesh — @H drag underneath, @S drag over the top.`,
      variant: "tackle_11",
      lastPlaceDefense: null,
      placeOffenseCalled: true,
      conceptSkeletonCalled: true,
      skeletonReturnedFenceJson: meshSkeletonFence(),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const fidelityErr = result.errors.find((e) => /skeleton-fidelity/i.test(e));
    expect(fidelityErr).toBeDefined();
    expect(fidelityErr).toMatch(/@S/);
  });

  it("ACCEPTS when emitted routes match skeleton's depths (verbatim copy)", () => {
    const result = validateDiagrams({
      text:
        `${fullMeshFenceWithRoutes(1, 5)}\n` +
        `Mesh — @H drag underneath at 2yd, @S drag over the top at 6yd.`,
      variant: "tackle_11",
      lastPlaceDefense: null,
      placeOffenseCalled: true,
      conceptSkeletonCalled: true,
      skeletonReturnedFenceJson: meshSkeletonFence(),
    });
    if (!result.ok) {
      // Other gates may fire; only check that the fidelity error didn't.
      expect(result.errors.find((e) => /skeleton-fidelity/i.test(e))).toBeUndefined();
    }
  });

  it("ACCEPTS small rounding drift (<= 0.6yd)", () => {
    // Skeleton: H@1, S@5. Emit: H@1.4, S@5.5 (rounding drift). Pass.
    const result = validateDiagrams({
      text:
        `${fullMeshFenceWithRoutes(1.4, 5.5)}\n` +
        `Mesh — @H underneath, @S over the top.`,
      variant: "tackle_11",
      lastPlaceDefense: null,
      placeOffenseCalled: true,
      conceptSkeletonCalled: true,
      skeletonReturnedFenceJson: meshSkeletonFence(),
    });
    if (!result.ok) {
      expect(result.errors.find((e) => /skeleton-fidelity/i.test(e))).toBeUndefined();
    }
  });

  it("does not fire when no skeleton fence was captured", () => {
    // No skeletonReturnedFenceJson → fidelity gate inactive (not all
    // play-emit turns came from a skeleton).
    const result = validateDiagrams({
      text:
        `${fullMeshFenceWithRoutes(2, 2)}\n` +
        `Mesh — @H drag, @S drag.`,
      variant: "tackle_11",
      lastPlaceDefense: null,
      placeOffenseCalled: true,
      conceptSkeletonCalled: true,
      skeletonReturnedFenceJson: null,
    });
    if (!result.ok) {
      expect(result.errors.find((e) => /skeleton-fidelity/i.test(e))).toBeUndefined();
    }
  });
});

describe("validateDiagrams — surgical-edit identity gate", () => {
  // Coach surfaced 2026-05-02 (image 2): asked Cal to "make it a
  // curved line" on a Flood Right play. Cal called modify_play_route
  // (twice per the chips), but the emitted fence had a completely
  // different formation — Y appeared, S vanished, OL row broke. Most
  // likely cause: Cal fed modify_play_route a fabricated
  // prior_play_fence with the wrong formation, and the tool dutifully
  // applied a route change to the fabrication. The principle (coach
  // feedback): "when modifying a play, it should be as surgical and
  // limited as is necessary to oblige the request." This gate
  // enforces players[] byte-equality across edits.

  // A canonical Flood Right tackle_11 prior fence (compose_play output shape).
  const priorFenceJson = JSON.stringify({
    title: "Flood Right",
    variant: "tackle_11",
    players: [
      { id: "Q",  x:  0, y: -3, team: "O" },
      { id: "LT", x: -4, y: 0,  team: "O" },
      { id: "LG", x: -2, y: 0,  team: "O" },
      { id: "C",  x:  0, y: 0,  team: "O" },
      { id: "RG", x:  2, y: 0,  team: "O" },
      { id: "RT", x:  4, y: 0,  team: "O" },
      { id: "X",  x:-18, y: 0,  team: "O" },
      { id: "Z",  x: 18, y: 0,  team: "O" },
      { id: "H",  x:-10, y: -1, team: "O" },
      { id: "S",  x: 10, y: -1, team: "O" },
      { id: "B",  x:  2, y: -5, team: "O" },
    ],
    routes: [{ from: "Z", path: [[26, 14]], route_kind: "Corner" }],
  });

  it("REJECTS an edit that drops a player (the image-2 scenario: S vanished)", () => {
    // Same play but missing S (Cal's emitted fence dropped a player).
    const fence = makeFence({
      title: "Flood Right",
      variant: "tackle_11",
      players: [
        { id: "Q",  x:  0, y: -3, team: "O" },
        { id: "LT", x: -4, y: 0,  team: "O" },
        { id: "LG", x: -2, y: 0,  team: "O" },
        { id: "C",  x:  0, y: 0,  team: "O" },
        { id: "RG", x:  2, y: 0,  team: "O" },
        { id: "RT", x:  4, y: 0,  team: "O" },
        { id: "X",  x:-18, y: 0,  team: "O" },
        { id: "Z",  x: 18, y: 0,  team: "O" },
        { id: "H",  x:-10, y: -1, team: "O" },
        // S MISSING — drift.
        { id: "B",  x:  2, y: -5, team: "O" },
      ],
      routes: [{ from: "Z", path: [[26, 14]], route_kind: "Corner" }],
    });
    const result = validateDiagrams({
      text: `${fence}\n@Z runs a corner.`,
      variant: "tackle_11",
      lastPlaceDefense: null,
      priorAssistantTurnHadFence: true,
      priorAssistantFenceJson: priorFenceJson,
      modifyPlayRouteCalled: true, // Cal claims to have used the tool
      routeTemplates: [snapshot("Corner", 18, 0, [[26, 14]])],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const driftErr = result.errors.find((e) => /surgical/i.test(e) || /drifted/i.test(e));
    expect(driftErr, `expected a surgical-edit drift error; got: ${result.errors.join(" | ")}`).toBeDefined();
    expect(driftErr).toMatch(/@S/);
  });

  it("REJECTS an edit that adds a player (Y appeared)", () => {
    const fence = makeFence({
      title: "Flood Right",
      variant: "tackle_11",
      players: [
        { id: "Q",  x:  0, y: -3, team: "O" },
        { id: "LT", x: -4, y: 0,  team: "O" }, { id: "LG", x: -2, y: 0,  team: "O" },
        { id: "C",  x:  0, y: 0,  team: "O" }, { id: "RG", x:  2, y: 0,  team: "O" },
        { id: "RT", x:  4, y: 0,  team: "O" },
        { id: "X",  x:-18, y: 0,  team: "O" }, { id: "Z",  x: 18, y: 0,  team: "O" },
        { id: "H",  x:-10, y: -1, team: "O" }, { id: "S",  x: 10, y: -1, team: "O" },
        { id: "B",  x:  2, y: -5, team: "O" },
        { id: "Y",  x:  6, y:  0, team: "O" }, // Y added — drift.
      ],
      routes: [{ from: "Z", path: [[26, 14]], route_kind: "Corner" }],
    });
    const result = validateDiagrams({
      text: `${fence}\n@Z runs a corner.`,
      variant: "tackle_11",
      lastPlaceDefense: null,
      priorAssistantTurnHadFence: true,
      priorAssistantFenceJson: priorFenceJson,
      modifyPlayRouteCalled: true,
      routeTemplates: [snapshot("Corner", 18, 0, [[26, 14]])],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const driftErr = result.errors.find((e) => /surgical/i.test(e) || /drifted/i.test(e));
    expect(driftErr).toBeDefined();
    expect(driftErr).toMatch(/@Y/);
  });

  it("REJECTS an edit that moves a player (S relocated)", () => {
    const fence = makeFence({
      title: "Flood Right",
      variant: "tackle_11",
      players: [
        { id: "Q",  x:  0, y: -3, team: "O" },
        { id: "LT", x: -4, y: 0,  team: "O" }, { id: "LG", x: -2, y: 0,  team: "O" },
        { id: "C",  x:  0, y: 0,  team: "O" }, { id: "RG", x:  2, y: 0,  team: "O" },
        { id: "RT", x:  4, y: 0,  team: "O" },
        { id: "X",  x:-18, y: 0,  team: "O" }, { id: "Z",  x: 18, y: 0,  team: "O" },
        { id: "H",  x:-10, y: -1, team: "O" },
        { id: "S",  x:  6, y: -3, team: "O" }, // moved from (10, -1)
        { id: "B",  x:  2, y: -5, team: "O" },
      ],
      routes: [{ from: "Z", path: [[26, 14]], route_kind: "Corner" }],
    });
    const result = validateDiagrams({
      text: `${fence}\n@Z runs a corner.`,
      variant: "tackle_11",
      lastPlaceDefense: null,
      priorAssistantTurnHadFence: true,
      priorAssistantFenceJson: priorFenceJson,
      modifyPlayRouteCalled: true,
      routeTemplates: [snapshot("Corner", 18, 0, [[26, 14]])],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const driftErr = result.errors.find((e) => /surgical/i.test(e) || /drifted/i.test(e));
    expect(driftErr).toBeDefined();
    expect(driftErr).toMatch(/@S.*moved/);
  });

  it("ACCEPTS an edit where players[] is byte-identical (the legitimate revise_play case)", () => {
    const fence = makeFence(JSON.parse(priorFenceJson));
    const result = validateDiagrams({
      text: `${fence}\n@Z runs a corner.`,
      variant: "tackle_11",
      lastPlaceDefense: null,
      priorAssistantTurnHadFence: true,
      priorAssistantFenceJson: priorFenceJson,
      modifyPlayRouteCalled: true,
      routeTemplates: [snapshot("Corner", 18, 0, [[26, 14]])],
    });
    if (!result.ok) {
      // The drift error specifically must not appear; other gates may.
      expect(result.errors.find((e) => /surgical/i.test(e) || /drifted/i.test(e))).toBeUndefined();
    }
  });

  it("BYPASSES the gate when place_offense was called (legit formation change)", () => {
    const fence = makeFence({
      title: "Flood Right (now Trips Right)",
      variant: "tackle_11",
      players: [
        // Wholly different formation — but place_offense was called,
        // so the surgical-edit gate doesn't fire.
        { id: "Q",  x:  0, y: -3, team: "O" },
        { id: "LT", x: -4, y: 0,  team: "O" }, { id: "LG", x: -2, y: 0,  team: "O" },
        { id: "C",  x:  0, y: 0,  team: "O" }, { id: "RG", x:  2, y: 0,  team: "O" },
        { id: "RT", x:  4, y: 0,  team: "O" },
        { id: "X",  x:-18, y: 0,  team: "O" }, { id: "Z",  x: 18, y: 0,  team: "O" },
        { id: "H",  x: 10, y: -1, team: "O" }, // moved to right
        { id: "S",  x: 14, y: -1, team: "O" }, // moved
        { id: "B",  x:  2, y: -5, team: "O" },
      ],
      routes: [{ from: "Z", path: [[26, 14]], route_kind: "Corner" }],
    });
    const result = validateDiagrams({
      text: `${fence}\nFlipped to Trips Right per coach request.`,
      variant: "tackle_11",
      lastPlaceDefense: null,
      priorAssistantTurnHadFence: true,
      priorAssistantFenceJson: priorFenceJson,
      placeOffenseCalled: true,
      routeTemplates: [snapshot("Corner", 18, 0, [[26, 14]])],
    });
    if (!result.ok) {
      expect(result.errors.find((e) => /surgical/i.test(e) || /drifted/i.test(e))).toBeUndefined();
    }
  });

  it("BYPASSES the gate when the user explicitly requested a new play", () => {
    const fence = makeFence({
      title: "Slant Concept (different play)",
      variant: "tackle_11",
      players: [
        { id: "Q",  x:  0, y: -3, team: "O" },
        { id: "LT", x: -4, y: 0,  team: "O" }, { id: "LG", x: -2, y: 0,  team: "O" },
        { id: "C",  x:  0, y: 0,  team: "O" }, { id: "RG", x:  2, y: 0,  team: "O" },
        { id: "RT", x:  4, y: 0,  team: "O" },
        { id: "X",  x:-18, y: 0,  team: "O" },
        // Z dropped to swap formations
      ],
      routes: [],
    });
    const result = validateDiagrams({
      text: fence,
      variant: "tackle_11",
      lastPlaceDefense: null,
      priorAssistantTurnHadFence: true,
      priorAssistantFenceJson: priorFenceJson,
      userRequestsNewPlay: true,
      placeOffenseCalled: true,
    });
    if (!result.ok) {
      expect(result.errors.find((e) => /surgical/i.test(e) || /drifted/i.test(e))).toBeUndefined();
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

describe("validateDiagrams — prose-depth lint", () => {
  // 2026-05-02: skeleton placed H@2yd and S@6yd, the diagram rendered
  // correctly, but Cal's prose said "both drags at 2 yards" — Cal
  // improvised a depth the spec didn't have. The depth lint catches
  // active depth contradictions; family contradictions are caught by
  // the existing lint.

  function meshFence() {
    return makeFence({
      title: "Mesh",
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
        // H drag at 2yd: starts at -10,-1 → ends at 13,1 (max y = 1, depth = 2 from carrier.y=-1)
        { from: "H", path: [[-8.3, 1], [12.9, 1]], route_kind: "Drag" },
        // S drag at 6yd: starts at 10,-1 → ends at -13,5 (max y = 5, depth = 6)
        { from: "S", path: [[8.4, 5], [-12.8, 5]], route_kind: "Drag" },
      ],
    });
  }

  it("REJECTS prose claiming both mesh drags at 2 yards (image-3 case)", () => {
    const result = validateDiagrams({
      text:
        `${meshFence()}\n` +
        `Mesh concept. @H runs a drag at 2 yards left-to-right. ` +
        `@S also runs a drag at 2 yards right-to-left. Same depth — they cross visually.`,
      variant: "tackle_11",
      lastPlaceDefense: null,
      placeOffenseCalled: true,
      conceptSkeletonCalled: true,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const depthErr = result.errors.find((e) => /@S.*2 yards.*6 yards/.test(e));
    expect(depthErr).toBeDefined();
  });

  it("ACCEPTS prose with correct staggered depths (2 and 6)", () => {
    const result = validateDiagrams({
      text:
        `${meshFence()}\n` +
        `Mesh concept. @H runs a drag at 2 yards left-to-right. ` +
        `@S runs a drag at 6 yards right-to-left.`,
      variant: "tackle_11",
      lastPlaceDefense: null,
      placeOffenseCalled: true,
      conceptSkeletonCalled: true,
    });
    if (!result.ok) {
      // The depth lint shouldn't fire — but other gates may.
      expect(result.errors.find((e) => e.includes("yards but"))).toBeUndefined();
    }
  });

  it("ACCEPTS prose that paraphrases without naming a depth (no contradiction)", () => {
    const result = validateDiagrams({
      text:
        `${meshFence()}\n` +
        `Mesh concept. @H crosses left to right underneath. ` +
        `@S crosses right to left over the top.`,
      variant: "tackle_11",
      lastPlaceDefense: null,
      placeOffenseCalled: true,
      conceptSkeletonCalled: true,
    });
    if (!result.ok) {
      expect(result.errors.find((e) => e.includes("yards but"))).toBeUndefined();
    }
  });
});

describe("validateDiagrams — answer-mode lint against prior fence", () => {
  // Image 3 case: Cal answers "which one should go on top?" with
  // confabulated depths but emits NO new fence. Without the
  // answer-mode lint, this slipped through entirely. With prior fence
  // passed in, the validator can lint the prose against the saved
  // spec.

  const priorFenceJson = JSON.stringify({
    title: "Mesh",
    variant: "tackle_11",
    players: [
      { id: "Q", x: 0, y: -3, team: "O" },
      { id: "H", x: -10, y: -1, team: "O" },
      { id: "S", x: 10, y: -1, team: "O" },
    ],
    routes: [
      { from: "H", path: [[-8.3, 1], [12.9, 1]], route_kind: "Drag" },
      { from: "S", path: [[8.4, 5], [-12.8, 5]], route_kind: "Drag" },
    ],
  });

  it("REJECTS answer-mode prose that contradicts prior fence depths", () => {
    const result = validateDiagrams({
      text: "@H runs a drag at 2 yards. @S also runs a drag at 2 yards — same depth works because of timing.",
      variant: "tackle_11",
      lastPlaceDefense: null,
      priorAssistantTurnHadFence: true,
      priorAssistantFenceJson: priorFenceJson,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const depthErr = result.errors.find((e) => /@S.*2 yards.*6 yards/.test(e));
    expect(depthErr).toBeDefined();
  });

  it("ACCEPTS answer-mode prose that matches prior fence depths", () => {
    const result = validateDiagrams({
      text: "@H is at 2 yards (under-drag) and @S is at 6 yards (over-drag) — 4 yards of separation.",
      variant: "tackle_11",
      lastPlaceDefense: null,
      priorAssistantTurnHadFence: true,
      priorAssistantFenceJson: priorFenceJson,
    });
    expect(result.ok, result.ok ? undefined : result.errors.join(" | ")).toBe(true);
  });

  it("REJECTS broad 'same N-yard depth' claims when prior fence has staggered depths", () => {
    // Image 3 exact phrasing: "Same 2-yard depth works fine" on a
    // Mesh play where the saved spec had H@2 and S@6.
    const result = validateDiagrams({
      text: "@H runs first as the under-drag, @S runs second. Same 2-yard depth works fine because the timing creates the pick.",
      variant: "tackle_11",
      lastPlaceDefense: null,
      priorAssistantTurnHadFence: true,
      priorAssistantFenceJson: priorFenceJson,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const broadErr = result.errors.find((e) => e.includes("(broad-claim)") || /improvise depths/.test(e));
    expect(broadErr).toBeDefined();
  });

  it("ACCEPTS answer-mode prose that doesn't reference depth at all", () => {
    const result = validateDiagrams({
      text: "@H runs first as the under-drag, @S runs second as the over-drag — they cross because they release from opposite slots.",
      variant: "tackle_11",
      lastPlaceDefense: null,
      priorAssistantTurnHadFence: true,
      priorAssistantFenceJson: priorFenceJson,
    });
    expect(result.ok, result.ok ? undefined : result.errors.join(" | ")).toBe(true);
  });
});

describe("validateDiagrams — yards-units lint", () => {
  // Image 3 also: Cal said "@H starts at x=-11 (left slot)" — coaches
  // shouldn't have to know that x is in yards. Every spatial
  // measurement in prose must use yards explicitly.

  it("REJECTS prose with bare x= / y= coordinates lacking yards", () => {
    const result = validateDiagrams({
      text: "@H starts at x=-11 (left slot) → crosses RIGHT toward x=+13. Runs first.",
      variant: "tackle_11",
      lastPlaceDefense: null,
      priorAssistantTurnHadFence: false,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const unitErr = result.errors.find((e) => e.includes("without yard units"));
    expect(unitErr).toBeDefined();
  });

  it("ACCEPTS prose that uses yards explicitly", () => {
    const result = validateDiagrams({
      text: "@H starts 11 yards inside the center and crosses 13 yards toward the right sideline.",
      variant: "tackle_11",
      lastPlaceDefense: null,
      priorAssistantTurnHadFence: false,
    });
    expect(result.ok, result.ok ? undefined : result.errors.join(" | ")).toBe(true);
  });

  it("ACCEPTS coordinates with explicit yard units (x=-11 yards)", () => {
    const result = validateDiagrams({
      text: "@H starts at x=-11 yards (left slot) → crosses to x=+13 yards.",
      variant: "tackle_11",
      lastPlaceDefense: null,
      priorAssistantTurnHadFence: false,
    });
    expect(result.ok, result.ok ? undefined : result.errors.join(" | ")).toBe(true);
  });

  it("IGNORES x/y inside fenced JSON (the fence itself contains x= and y=)", () => {
    const fence = makeFence({
      title: "Test",
      variant: "tackle_11",
      players: [
        { id: "Q", x: 0, y: -3, team: "O" },
        { id: "X", x: -13, y: 0, team: "O" },
      ],
      routes: [{ from: "X", path: [[-13, 3], [-7, 5.8]], route_kind: "Slant" }],
    });
    const result = validateDiagrams({
      text: `${fence}\n@X runs a 5-yard slant.`,
      variant: "tackle_11",
      lastPlaceDefense: null,
      routeTemplates: [snapshot("Slant", -13, 0, [[-13, 3], [-7, 5.8]])],
    });
    expect(result.ok, result.ok ? undefined : result.errors.join(" | ")).toBe(true);
  });
});

describe("validateDiagrams — sanitizer gate (image-3 purple-field case)", () => {
  // 2026-05-02 image 3: Cal emitted a Flood Left where a single zone
  // had size that covered the whole field — the renderer painted the
  // entire viewport purple. The sanitizer drops oversize zones; the
  // validator surfaces the drop as an error so Cal must re-emit
  // without the corrupt element.

  it("REJECTS a fence with an oversize zone", () => {
    const fence = makeFence({
      title: "Flood Left",
      variant: "tackle_11",
      players: [
        { id: "Q", x: 0, y: -3, team: "O" },
        { id: "X", x: -13, y: 0, team: "O" },
      ],
      routes: [{ from: "X", path: [[-13, 3], [-7, 5.8]], route_kind: "Slant" }],
      zones: [
        { kind: "rectangle", center: [0, 10], size: [200, 50], label: "WholeField" },
      ],
    });
    const result = validateDiagrams({
      text: `${fence}\n@X runs a slant.`,
      variant: "tackle_11",
      lastPlaceDefense: null,
      routeTemplates: [snapshot("Slant", -13, 0, [[-13, 3], [-7, 5.8]])],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const sanErr = result.errors.find((e) => /sanitizer rejected.*zone_dropped_oversized/.test(e));
    expect(sanErr).toBeDefined();
  });

  it("REJECTS a fence with a NaN-position player", () => {
    const fence = makeFence({
      title: "Test",
      variant: "tackle_11",
      players: [
        { id: "Q", x: 0, y: -3, team: "O" },
        { id: "X", x: NaN, y: 0, team: "O" },
      ],
      routes: [],
    });
    const result = validateDiagrams({
      text: `${fence}\nbroken.`,
      variant: "tackle_11",
      lastPlaceDefense: null,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const sanErr = result.errors.find((e) => /sanitizer rejected.*player_dropped_nonfinite/.test(e));
    expect(sanErr).toBeDefined();
  });

  it("ACCEPTS a fence with normal-sized zones", () => {
    const fence = makeFence({
      title: "Cover 3",
      variant: "tackle_11",
      players: [
        { id: "Q", x: 0, y: -3, team: "O" },
        { id: "X", x: -13, y: 0, team: "O" },
      ],
      routes: [{ from: "X", path: [[-13, 3], [-7, 5.8]], route_kind: "Slant" }],
      zones: [
        { kind: "rectangle", center: [-15, 12], size: [12, 8], label: "Curl/Flat" },
        { kind: "rectangle", center: [0, 18], size: [16, 6], label: "Hook" },
      ],
    });
    const result = validateDiagrams({
      text: `${fence}\n@X runs a slant.`,
      variant: "tackle_11",
      lastPlaceDefense: null,
      routeTemplates: [snapshot("Slant", -13, 0, [[-13, 3], [-7, 5.8]])],
    });
    if (!result.ok) {
      // Other gates may fire (this is a stripped-down test play); only
      // ensure the sanitizer didn't reject a clean diagram.
      expect(result.errors.find((e) => /sanitizer rejected/.test(e))).toBeUndefined();
    }
  });
});

describe("validateDiagrams — phantom-write claims", () => {
  it("flags 'Fixed! The notes now match' when update_play_notes was NOT called", () => {
    const result = validateDiagrams({
      text: "You're absolutely right — that's a major error.\n\nFixed! The notes now match the actual players in the diagram.",
      variant: "tackle_11",
      lastPlaceDefense: null,
      writeToolsCalledOk: [],
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("update_play_notes"))).toBe(true);
  });

  it("passes 'Fixed! Notes updated.' when update_play_notes WAS called", () => {
    const result = validateDiagrams({
      text: "Fixed! Notes updated.",
      variant: "tackle_11",
      lastPlaceDefense: null,
      writeToolsCalledOk: ["update_play_notes"],
    });
    expect(result.ok).toBe(true);
  });

  it("flags '✅ Play Updated' when update_play was NOT called", () => {
    const result = validateDiagrams({
      text: "✅ Play Updated: 'Spread Bubble Screen'\nUpdated with: ...",
      variant: "tackle_11",
      lastPlaceDefense: null,
      writeToolsCalledOk: [],
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("update_play"))).toBe(true);
  });

  it("passes '✅ Play Updated' when update_play WAS called", () => {
    const result = validateDiagrams({
      text: "✅ Play Updated: 'Spread Bubble Screen'",
      variant: "tackle_11",
      lastPlaceDefense: null,
      writeToolsCalledOk: ["update_play"],
    });
    expect(result.ok).toBe(true);
  });

  it("does NOT flag generic 'Want me to update the notes?' suggestions", () => {
    const result = validateDiagrams({
      text: "Want me to update the notes? I could rewrite them to match the diagram.",
      variant: "tackle_11",
      lastPlaceDefense: null,
      writeToolsCalledOk: [],
    });
    const errs = result.ok ? [] : result.errors;
    expect(errs.some((e) => e.includes("update_play_notes"))).toBe(false);
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

// ── Variant-rule gates (blocking, center eligibility) ────────────────────
//
// 7v7 / flag is a non-contact game type — `kind: "block"` is illegal and
// any prose calling a player a "blocker" / "lead block" / "pass pro" is a
// rules violation. The center is also NOT an eligible receiver in 7v7.
// 5v5 flag: blocking still illegal but the center IS eligible.
// Tackle 11: blocking allowed, center NOT eligible.
//
// Surfaced 2026-05-03: Cal generated a 7v7 "bubble screen" with X/H/S/B
// labeled as "lead blockers" running flat routes. The geometry rendered
// as flats (no `kind: "block"` in the spec), but the prose announced
// blocking. The prose gate catches the production case; the action-kind
// gate catches the structurally bad inputs that bypass prose checks.
describe("validateDiagrams — blocking legality (7v7 / 5v5)", () => {
  it("REJECTS prose that calls a player a 'lead blocker' in flag_7v7", () => {
    const fence = makeFence({
      title: "Bubble Screen",
      variant: "flag_7v7",
      players: [
        { id: "Q", x: 0, y: -3, team: "O" },
        { id: "C", x: 0, y: 0, team: "O" },
        { id: "X", x: -16, y: 0, team: "O" },
        { id: "H", x: -8, y: 0, team: "O" },
        { id: "S", x: -4, y: 0, team: "O" },
        { id: "Z", x: 16, y: 0, team: "O" },
        { id: "B", x: 4, y: -3, team: "O" },
      ],
      routes: [
        { from: "Z", path: [[16, 1], [20, 1]], route_kind: "Flat" },
        { from: "X", path: [[-16, 1], [-20, 1]], route_kind: "Flat" },
      ],
    });
    const result = validateDiagrams({
      text:
        `${fence}\n` +
        "@Z catches the bubble. @X, @H, @S lead block on the perimeter. @B is a lead blocker.",
      variant: "flag_7v7",
      lastPlaceDefense: null,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const blockingError = result.errors.find((e) =>
      /blocking is not allowed|no blocking/i.test(e),
    );
    expect(blockingError).toBeDefined();
  });

  it("ACCEPTS blocking prose in tackle_11", () => {
    const fence = makeFence({
      title: "Iso",
      variant: "tackle_11",
      players: [
        { id: "Q", x: 0, y: -3, team: "O" },
        { id: "LT", x: -4, y: 0, team: "O" },
        { id: "LG", x: -2, y: 0, team: "O" },
        { id: "C", x: 0, y: 0, team: "O" },
        { id: "RG", x: 2, y: 0, team: "O" },
        { id: "RT", x: 4, y: 0, team: "O" },
        { id: "Y", x: 7, y: 0, team: "O" },
        { id: "X", x: -13, y: 0, team: "O" },
        { id: "Z", x: 13, y: 0, team: "O" },
        { id: "B", x: 0, y: -5, team: "O" },
        { id: "F", x: 0, y: -7, team: "O" },
      ],
      routes: [
        { from: "X", path: [[-13, 3], [-7, 5.8]], route_kind: "Slant" },
      ],
    });
    const result = validateDiagrams({
      text: `${fence}\n@F leads up through the hole and blocks the MIKE. @X runs a slant.`,
      variant: "tackle_11",
      lastPlaceDefense: null,
      routeTemplates: [snapshot("Slant", -13, 0, [[-13, 3], [-7, 5.8]])],
    });
    if (!result.ok) {
      // Other gates can still fire on this stripped-down play; only
      // assert the blocking gate did NOT.
      expect(
        result.errors.find((e) => /blocking is not allowed/i.test(e)),
      ).toBeUndefined();
    }
  });

  it("does not flag the word 'block' inside a defender label or zone name", () => {
    // False-positive guard: words like "block-down", "blocker-free", or a
    // defender labeled "Spy/Block" in the diagram zones shouldn't trip
    // the gate. Only prose verbs about an offensive player should fire.
    const fence = makeFence({
      title: "Mesh",
      variant: "flag_7v7",
      players: [
        { id: "Q", x: 0, y: -3, team: "O" },
        { id: "C", x: 0, y: 0, team: "O" },
        { id: "X", x: -16, y: 0, team: "O" },
        { id: "H", x: -8, y: 0, team: "O" },
        { id: "S", x: 4, y: 0, team: "O" },
        { id: "Z", x: 16, y: 0, team: "O" },
        { id: "B", x: -4, y: -3, team: "O" },
      ],
      routes: [
        { from: "H", path: [[-8, 2], [8, 2]], route_kind: "Drag" },
        { from: "S", path: [[4, 6], [-12, 6]], route_kind: "Drag" },
      ],
    });
    const result = validateDiagrams({
      text:
        `${fence}\n` +
        "@H and @S cross underneath. The defense is in a 2-deep shell — no blitz, the SAM is a spy.",
      variant: "flag_7v7",
      lastPlaceDefense: null,
    });
    if (!result.ok) {
      expect(
        result.errors.find((e) => /blocking is not allowed/i.test(e)),
      ).toBeUndefined();
    }
  });
});

describe("validateDiagrams — center eligibility (7v7 vs 5v5)", () => {
  it("REJECTS a route on @C in flag_7v7 (center is not eligible)", () => {
    const fence = makeFence({
      title: "Bad Snap Trick",
      variant: "flag_7v7",
      players: [
        { id: "Q", x: 0, y: -3, team: "O" },
        { id: "C", x: 0, y: 0, team: "O" },
        { id: "X", x: -16, y: 0, team: "O" },
        { id: "H", x: -8, y: 0, team: "O" },
        { id: "S", x: 4, y: 0, team: "O" },
        { id: "Z", x: 16, y: 0, team: "O" },
        { id: "B", x: -4, y: -3, team: "O" },
      ],
      routes: [
        // C cannot run a route in 7v7.
        { from: "C", path: [[0, 3], [0, 8]], route_kind: "Hitch" },
      ],
    });
    const result = validateDiagrams({
      text: `${fence}\n@C runs a hitch up the seam.`,
      variant: "flag_7v7",
      lastPlaceDefense: null,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const centerError = result.errors.find((e) =>
      /center is not (?:an )?eligible|ineligible center/i.test(e),
    );
    expect(centerError).toBeDefined();
  });

  it("ACCEPTS a route on @C in flag_5v5 (center is eligible)", () => {
    const fence = makeFence({
      title: "Center Hitch",
      variant: "flag_5v5",
      players: [
        { id: "Q", x: 0, y: -3, team: "O" },
        { id: "C", x: 0, y: 0, team: "O" },
        { id: "X", x: -10, y: 0, team: "O" },
        { id: "Z", x: 10, y: 0, team: "O" },
        { id: "B", x: 4, y: -3, team: "O" },
      ],
      routes: [
        { from: "C", path: [[0, 3], [0, 7]], route_kind: "Hitch" },
      ],
    });
    const result = validateDiagrams({
      text: `${fence}\n@C runs a hitch up the seam.`,
      variant: "flag_5v5",
      lastPlaceDefense: null,
    });
    if (!result.ok) {
      expect(
        result.errors.find((e) => /center is not (?:an )?eligible/i.test(e)),
      ).toBeUndefined();
    }
  });
});

describe("validateDiagrams — color-clash gate (no two skill players share a derived color)", () => {
  it("REJECTS a play with two slot carriers (H + S both rendering yellow)", () => {
    // Reproduces 2026-05-03 coach feedback (post-convention rewrite):
    // slot family (S/A/H/F-as-WR) all derive yellow under the high-
    // contrast role-keyed defaults, so two slots in one play clash.
    const fence = makeFence({
      title: "Trips Right Stick",
      variant: "flag_5v5",
      players: [
        { id: "Q", x: 0, y: -3, team: "O" },
        { id: "C", x: 0, y: 0, team: "O" },
        { id: "X", x: -10, y: 0, team: "O" },
        { id: "H", x: -5, y: 0, team: "O" },
        { id: "S", x: 6, y: 0, team: "O" },
      ],
      routes: [
        { from: "X", path: [[-10, 5]], route_kind: "Hitch" },
        { from: "H", path: [[-2, 6]], route_kind: "Drag" },
        { from: "S", path: [[10, 5]], route_kind: "Out" },
      ],
    });
    const result = validateDiagrams({
      text: `${fence}\n@X hitches, @H drags, @S runs the out.`,
      variant: "flag_5v5",
      lastPlaceDefense: null,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const clashError = result.errors.find((e) => /color clash/i.test(e));
    expect(clashError).toBeDefined();
    expect(clashError).toMatch(/yellow/);
  });

  it("REJECTS H + H2 (both derive to yellow under the slot family)", () => {
    const fence = makeFence({
      title: "Empty Right",
      variant: "flag_5v5",
      players: [
        { id: "Q", x: 0, y: -3, team: "O" },
        { id: "C", x: 0, y: 0, team: "O" },
        { id: "X", x: -10, y: 0, team: "O" },
        { id: "H", x: -5, y: 0, team: "O" },
        { id: "H2", x: 6, y: 0, team: "O" },
      ],
      routes: [
        { from: "X", path: [[-10, 5]], route_kind: "Hitch" },
        { from: "H", path: [[-2, 6]], route_kind: "Drag" },
        { from: "H2", path: [[10, 5]], route_kind: "Out" },
      ],
    });
    const result = validateDiagrams({
      text: `${fence}\n@X hitches, @H drags, @H2 runs the out.`,
      variant: "flag_5v5",
      lastPlaceDefense: null,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.find((e) => /color clash/i.test(e))).toBeDefined();
  });

  it("ACCEPTS a play that uses five distinct hues (X, Y, Z, H, B)", () => {
    // Convention-compliant 5-skill spread: WR1 + WR2 + TE-equiv + slot + back.
    const fence = makeFence({
      title: "Empty Doubles",
      variant: "flag_5v5",
      players: [
        { id: "Q", x: 0, y: -3, team: "O" },
        { id: "C", x: 0, y: 0, team: "O" },
        { id: "X", x: -12, y: 0, team: "O" },
        { id: "Y", x: -5, y: 0, team: "O" },
        { id: "H", x: 5, y: 0, team: "O" },
        { id: "Z", x: 12, y: 0, team: "O" },
      ],
      routes: [
        { from: "X", path: [[-12, 5]], route_kind: "Hitch" },
        { from: "Y", path: [[-2, 6]], route_kind: "Drag" },
        { from: "H", path: [[2, 6]], route_kind: "Drag" },
        { from: "Z", path: [[12, 5]], route_kind: "Hitch" },
      ],
    });
    const result = validateDiagrams({
      text: `${fence}\n@X hitches, @Y drags, @H drags, @Z hitches.`,
      variant: "flag_5v5",
      lastPlaceDefense: null,
    });
    if (!result.ok) {
      expect(result.errors.find((e) => /color clash/i.test(e))).toBeUndefined();
    }
  });

  it("REJECTS even when one of the clashing players has an explicit override to the SAME color", () => {
    // Coach explicitly setting two players to the same hue is still
    // visually broken — push back rather than ship it. (Under the
    // 2026-05-04 convention @B/RB derives orange; setting @H to
    // explicit orange creates the clash.)
    const fence = makeFence({
      title: "Test",
      variant: "flag_5v5",
      players: [
        { id: "Q", x: 0, y: -3, team: "O" },
        { id: "C", x: 0, y: 0, team: "O" },
        { id: "X", x: -10, y: 0, team: "O" },
        { id: "H", x: -5, y: 0, team: "O", color: "#F26522" }, // explicit orange
        { id: "B", x: 5, y: 0, team: "O" },                     // derives orange
      ],
      routes: [
        { from: "X", path: [[-10, 5]], route_kind: "Hitch" },
        { from: "H", path: [[-2, 6]], route_kind: "Drag" },
        { from: "B", path: [[10, 5]], route_kind: "Out" },
      ],
    });
    const result = validateDiagrams({
      text: `${fence}\n@X hitches, @H drags, @B runs the out.`,
      variant: "flag_5v5",
      lastPlaceDefense: null,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.find((e) => /color clash/i.test(e))).toBeDefined();
  });

  it("ACCEPTS a clash resolved by recoloring one of the players to an unused palette color", () => {
    // H and S would both derive yellow (slot family clash); recolor
    // H to green so the two are distinct.
    const fence = makeFence({
      title: "Test",
      variant: "flag_5v5",
      players: [
        { id: "Q", x: 0, y: -3, team: "O" },
        { id: "C", x: 0, y: 0, team: "O" },
        { id: "X", x: -10, y: 0, team: "O" },
        { id: "H", x: -5, y: 0, team: "O", color: "#22C55E" }, // recolored to green
        { id: "S", x: 6, y: 0, team: "O" },                    // stays yellow
      ],
      routes: [
        { from: "X", path: [[-10, 5]], route_kind: "Hitch" },
        { from: "H", path: [[-2, 6]], route_kind: "Drag" },
        { from: "S", path: [[10, 5]], route_kind: "Out" },
      ],
    });
    const result = validateDiagrams({
      text: `${fence}\n@X hitches, @H drags, @S runs the out.`,
      variant: "flag_5v5",
      lastPlaceDefense: null,
    });
    if (!result.ok) {
      expect(result.errors.find((e) => /color clash/i.test(e))).toBeUndefined();
    }
  });

  it("does NOT flag the QB / C / linemen (their colors are exempt)", () => {
    // Multiple linemen all share gray — that's by design, not a clash.
    // H and B are now distinct hues (yellow vs purple) under the new
    // convention, so this play is fully clean.
    const fence = makeFence({
      title: "I-Form Iso",
      variant: "tackle_11",
      players: [
        { id: "Q", x: 0, y: -3, team: "O" },
        { id: "LT", x: -3, y: 0, team: "O" },
        { id: "LG", x: -1.5, y: 0, team: "O" },
        { id: "C", x: 0, y: 0, team: "O" },
        { id: "RG", x: 1.5, y: 0, team: "O" },
        { id: "RT", x: 3, y: 0, team: "O" },
        { id: "X", x: -12, y: 0, team: "O" },
        { id: "Y", x: 5, y: 0, team: "O" },
        { id: "Z", x: 12, y: 0, team: "O" },
        { id: "H", x: 0, y: -5, team: "O" },
        { id: "B", x: 0, y: -7, team: "O" },
      ],
      routes: [
        { from: "Y", path: [[5, 5]], route_kind: "Hitch" },
      ],
    });
    const result = validateDiagrams({
      text: `${fence}\n@H lead-blocks for @B.`,
      variant: "tackle_11",
      lastPlaceDefense: null,
    });
    // Linemen sharing gray must not trigger the gate. Under the new
    // role-keyed convention H (yellow slot) + B (purple back) do NOT
    // clash, so the only sharing on this play is the lineman gray —
    // which is exempt. There should be no color-clash error at all.
    if (!result.ok) {
      const clashErrors = result.errors.filter((e) => /color clash/i.test(e));
      const linemanClash = clashErrors.find((e) => /LT|LG|RG|RT/.test(e));
      expect(linemanClash).toBeUndefined();
    }
  });

  it("REJECTS HB (B, orange) + FB (orange) on the same play — both backs share orange under 2026-05-04 convention", () => {
    // I-form / 21 personnel has both a halfback and a fullback. After
    // the 2026-05-04 color move (B: purple → orange so @C can claim
    // purple), HB and FB now share orange and the gate fires. Coaches
    // who need both on the field must relabel one or call set_player_color
    // — which is exactly what the gate's suggestion text says.
    const fence = makeFence({
      title: "I-Form Iso",
      variant: "tackle_11",
      players: [
        { id: "Q", x: 0, y: -3, team: "O" },
        { id: "LT", x: -3, y: 0, team: "O" },
        { id: "LG", x: -1.5, y: 0, team: "O" },
        { id: "C", x: 0, y: 0, team: "O" },
        { id: "RG", x: 1.5, y: 0, team: "O" },
        { id: "RT", x: 3, y: 0, team: "O" },
        { id: "X", x: -12, y: 0, team: "O" },
        { id: "Y", x: 4, y: 0, team: "O" },
        { id: "Z", x: 12, y: 0, team: "O" },
        { id: "FB", x: 0, y: -4, team: "O", role: "RB" },
        { id: "B", x: 0, y: -7, team: "O", role: "RB" },
      ],
      routes: [
        { from: "Y", path: [[4, 5]], route_kind: "Hitch" },
      ],
    });
    const result = validateDiagrams({
      text: `${fence}\n@FB lead-blocks for @B on the iso.`,
      variant: "tackle_11",
      lastPlaceDefense: null,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.find((e) => /color clash/i.test(e) && /B|FB/.test(e))).toBeDefined();
  });
});
