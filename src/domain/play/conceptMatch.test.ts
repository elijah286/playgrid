/**
 * Concept catalog + matcher goldens.
 *
 * Pins the structural contract of the concept layer (third tier of
 * SFPA — see conceptCatalog.ts header). Every entry that ships in
 * CONCEPT_CATALOG must:
 *   - have well-formed required-assignment depth ranges
 *   - be detectable when a spec satisfies its pattern
 *   - reject specs that name the concept but don't satisfy it,
 *     specifically catching the depth-violation case (curl at 10yd
 *     in a "curl-flat" — the very bug 2026-05-02 that motivated
 *     building this layer)
 */

import { describe, expect, it } from "vitest";
import {
  PLAY_SPEC_SCHEMA_VERSION,
  type PlaySpec,
  type PlayerAssignment,
} from "./spec";
import { CONCEPT_CATALOG } from "./conceptCatalog";
import {
  assertConcept,
  detectConcept,
  parseConceptsFromText,
} from "./conceptMatch";

function buildSpec(assignments: PlayerAssignment[]): PlaySpec {
  return {
    schemaVersion: PLAY_SPEC_SCHEMA_VERSION,
    variant: "flag_7v7",
    title: "Test",
    playType: "offense",
    formation: { name: "Spread Doubles" },
    assignments,
  };
}

describe("CONCEPT_CATALOG — module-load invariants", () => {
  it("loads with at least one entry", () => {
    expect(CONCEPT_CATALOG.length).toBeGreaterThan(0);
  });

  it("every concept declares at least one structural piece (route requirement OR structural rule)", () => {
    // Pass concepts express their pattern via `required` (route slots).
    // Run / RPO / reverse concepts may instead express it via the
    // `structural` field. A concept with NEITHER would match any spec
    // and is therefore catalog-rot.
    for (const c of CONCEPT_CATALOG) {
      const hasRoutes = c.required.length > 0;
      const hasStructural =
        c.structural !== undefined &&
        (c.structural.requiresCarry !== undefined ||
          c.structural.requiresRpoRead === true ||
          (typeof c.structural.requiresBallPathSteps === "number" && c.structural.requiresBallPathSteps > 0));
      expect(
        hasRoutes || hasStructural,
        `${c.name} has neither route requirements nor structural rules — it would match every spec`,
      ).toBe(true);
    }
  });

  it("every required-assignment depth range is well-formed (min ≤ max)", () => {
    for (const c of CONCEPT_CATALOG) {
      for (const req of c.required) {
        expect(req.depthRangeYds.min).toBeLessThanOrEqual(req.depthRangeYds.max);
      }
    }
  });
});

describe("assertConcept — Curl-Flat (the production motivating case)", () => {
  // 2026-05-02: a coach reported that Cal saved a play titled
  // "Spread Doubles — Post / Curl / Flat" with a Curl at 10-12 yds.
  // The catalog Curl is 8-13 — a valid family — but the curl-flat
  // CONCEPT requires a 4-7yd curl. This test pins that the concept
  // assertion catches the case the family-only check could not.

  it("PASSES with a 5-yard curl + flat (canonical curl-flat)", () => {
    const result = assertConcept(
      buildSpec([
        { player: "X", action: { kind: "route", family: "Curl", depthYds: 5 } },
        { player: "B", action: { kind: "route", family: "Flat", depthYds: 2 } },
      ]),
      "Curl-Flat",
    );
    expect(result.ok).toBe(true);
  });

  it("FAILS with a 10-yard curl + flat (the production bug)", () => {
    const result = assertConcept(
      buildSpec([
        { player: "X", action: { kind: "route", family: "Curl", depthYds: 10 } },
        { player: "B", action: { kind: "route", family: "Flat", depthYds: 2 } },
      ]),
      "Curl-Flat",
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    // The violation should specifically point at the depth mismatch, not
    // a missing-family. Curl is present, just at the wrong depth.
    const depthViolation = result.violations.find((v) => v.reason === "depth_outside_concept_range");
    expect(depthViolation).toBeDefined();
    expect(depthViolation?.player).toBe("X");
    expect(depthViolation?.actualDepthYds).toBe(10);
  });

  it("FAILS when the flat is missing entirely", () => {
    const result = assertConcept(
      buildSpec([
        { player: "X", action: { kind: "route", family: "Curl", depthYds: 5 } },
      ]),
      "Curl-Flat",
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const missingViolation = result.violations.find((v) => v.reason === "no_spec_assignment_with_family");
    expect(missingViolation).toBeDefined();
  });

  it("matches Curl/Flat alias", () => {
    const result = assertConcept(
      buildSpec([
        { player: "X", action: { kind: "route", family: "Curl", depthYds: 5 } },
        { player: "B", action: { kind: "route", family: "Flat" } },
      ]),
      "Curl/Flat",
    );
    expect(result.ok).toBe(true);
  });
});

describe("assertConcept — Smash, Stick, Snag, Four Verts, Mesh", () => {
  it("Smash: 5yd hitch + 13yd corner passes", () => {
    const result = assertConcept(
      buildSpec([
        { player: "X", action: { kind: "route", family: "Hitch", depthYds: 5 } },
        { player: "Y", action: { kind: "route", family: "Corner", depthYds: 13 } },
      ]),
      "Smash",
    );
    expect(result.ok).toBe(true);
  });

  it("Stick: 6yd sit + 2yd flat passes", () => {
    const result = assertConcept(
      buildSpec([
        { player: "Y", action: { kind: "route", family: "Sit", depthYds: 6 } },
        { player: "B", action: { kind: "route", family: "Flat", depthYds: 2 } },
      ]),
      "Stick",
    );
    expect(result.ok).toBe(true);
  });

  it("Four Verts: two go routes + two seams passes", () => {
    const result = assertConcept(
      buildSpec([
        { player: "X", action: { kind: "route", family: "Go", depthYds: 18 } },
        { player: "Z", action: { kind: "route", family: "Go", depthYds: 18 } },
        { player: "H", action: { kind: "route", family: "Seam", depthYds: 18 } },
        { player: "Y", action: { kind: "route", family: "Seam", depthYds: 18 } },
      ]),
      "Four Verticals",
    );
    expect(result.ok).toBe(true);
  });

  it("Mesh: two DIFFERENTIATED drags pass (canonical 5yd + 6yd, 1yd separation)", () => {
    // Updated 2026-05-26 from prior 2/8 visual-workaround depths back
    // to canonical Air Raid 5/6. Slot ranges are [4, 5.5] (under) and
    // [5.5, 7] (over) — non-overlapping enforces ≥0yd separation
    // (5.5/5.5 = boundary, all other pairs differ). Depths 5 + 6 hit
    // one slot each cleanly.
    const result = assertConcept(
      buildSpec([
        { player: "X", action: { kind: "route", family: "Drag", depthYds: 5 } },
        { player: "Z", action: { kind: "route", family: "Drag", depthYds: 6 } },
      ]),
      "Mesh",
    );
    expect(result.ok).toBe(true);
  });

  it("Mesh: REJECTS two drags at the same depth in the under range (collision)", () => {
    // Two drags at 4yd both fit the [4, 5.5] under-slot but neither
    // fits the [5.5, 7] over-slot → fail. Same-depth rejection
    // preserved via non-overlapping ranges.
    const result = assertConcept(
      buildSpec([
        { player: "X", action: { kind: "route", family: "Drag", depthYds: 4 } },
        { player: "Z", action: { kind: "route", family: "Drag", depthYds: 4 } },
      ]),
      "Mesh",
    );
    expect(result.ok).toBe(false);
  });

  it("Mesh: REJECTS two drags at the same depth in the over range (collision)", () => {
    // 6/6 — both fit over-slot, neither fits under-slot. Fail.
    const result = assertConcept(
      buildSpec([
        { player: "H", action: { kind: "route", family: "Drag", depthYds: 6 } },
        { player: "S", action: { kind: "route", family: "Drag", depthYds: 6 } },
      ]),
      "Mesh",
    );
    expect(result.ok).toBe(false);
  });

  it("Mesh: REJECTS two drags both crammed at LOS (1yd, 2yd) — below canonical", () => {
    // Both depths are below the under-slot floor of 4yd. Was once
    // accepted as "under-drag at 2yd" in the rendering-workaround
    // era; now rejected because the canonical mesh is at 5-6yd.
    const result = assertConcept(
      buildSpec([
        { player: "X", action: { kind: "route", family: "Drag", depthYds: 1 } },
        { player: "Z", action: { kind: "route", family: "Drag", depthYds: 2 } },
      ]),
      "Mesh",
    );
    expect(result.ok).toBe(false);
  });

  it("Snag: spot + corner + flat passes", () => {
    const result = assertConcept(
      buildSpec([
        { player: "Y", action: { kind: "route", family: "Spot", depthYds: 5 } },
        { player: "X", action: { kind: "route", family: "Corner", depthYds: 13 } },
        { player: "B", action: { kind: "route", family: "Flat", depthYds: 2 } },
      ]),
      "Snag",
    );
    expect(result.ok).toBe(true);
  });
});

describe("assertConcept — Phase 7b additions (Flood, Drive, Levels, Y-Cross, Dagger)", () => {
  // These were the unenforced concepts that surfaced 2026-05-02 when a
  // coach asked for a "Flood concept play" and Cal authored random
  // routes scattered around the formation. Each entry below adds a
  // permanent gate so the same prompt can't ship as a wrong play.

  it("Flood: corner + out + flat passes", () => {
    // 2026-05-02 catalog change: slot's mid route is OUT at the
    // second level (7-10yd), not Curl. Pinned via this test.
    const result = assertConcept(
      buildSpec([
        { player: "Z", action: { kind: "route", family: "Corner", depthYds: 14 } },
        { player: "S", action: { kind: "route", family: "Out",    depthYds: 8  } },
        { player: "B", action: { kind: "route", family: "Flat",   depthYds: 2  } },
      ]),
      "Flood",
    );
    expect(result.ok).toBe(true);
  });

  it("Flood: matches alias 'Sail'", () => {
    const result = assertConcept(
      buildSpec([
        { player: "Z", action: { kind: "route", family: "Corner", depthYds: 14 } },
        { player: "S", action: { kind: "route", family: "Out",    depthYds: 8  } },
        { player: "B", action: { kind: "route", family: "Flat",   depthYds: 2  } },
      ]),
      "Sail",
    );
    expect(result.ok).toBe(true);
  });

  it("Flood: REJECTS when the slot Out is missing (only 2 of 3 stretches)", () => {
    const result = assertConcept(
      buildSpec([
        { player: "Z", action: { kind: "route", family: "Corner", depthYds: 14 } },
        { player: "B", action: { kind: "route", family: "Flat",   depthYds: 2  } },
      ]),
      "Flood",
    );
    expect(result.ok).toBe(false);
  });

  it("Drive: drag under + dig over passes", () => {
    const result = assertConcept(
      buildSpec([
        { player: "H", action: { kind: "route", family: "Drag", depthYds: 3  } },
        { player: "X", action: { kind: "route", family: "Dig",  depthYds: 12 } },
      ]),
      "Drive",
    );
    expect(result.ok).toBe(true);
  });

  it("Drive: REJECTS when both routes are at the same depth (no high-low)", () => {
    // Drag at 4 fits the under slot, but a Dig at 4yd is way outside
    // the family's [10, 16] range — fails as soon as the family is
    // checked.
    const result = assertConcept(
      buildSpec([
        { player: "H", action: { kind: "route", family: "Drag", depthYds: 4 } },
        { player: "X", action: { kind: "route", family: "Drag", depthYds: 4 } },
      ]),
      "Drive",
    );
    expect(result.ok).toBe(false);
  });

  it("Levels: low In + high Dig passes", () => {
    const result = assertConcept(
      buildSpec([
        { player: "H", action: { kind: "route", family: "In",  depthYds: 7  } },
        { player: "X", action: { kind: "route", family: "Dig", depthYds: 12 } },
      ]),
      "Levels",
    );
    expect(result.ok).toBe(true);
  });

  it("Y-Cross: dig + post + flat passes", () => {
    const result = assertConcept(
      buildSpec([
        { player: "Y", action: { kind: "route", family: "Dig",  depthYds: 15 } },
        { player: "X", action: { kind: "route", family: "Post", depthYds: 14 } },
        { player: "B", action: { kind: "route", family: "Flat", depthYds: 2  } },
      ]),
      "Y-Cross",
    );
    expect(result.ok).toBe(true);
  });

  it("Dagger: seam clear + deep dig passes", () => {
    const result = assertConcept(
      buildSpec([
        { player: "H", action: { kind: "route", family: "Seam", depthYds: 18 } },
        { player: "X", action: { kind: "route", family: "Dig",  depthYds: 15 } },
      ]),
      "Dagger",
    );
    expect(result.ok).toBe(true);
  });

  it("Dagger: REJECTS when the dig is too shallow (e.g. 8yd dig)", () => {
    // The whole point of Dagger is the dig in the void BEHIND the LBs
    // — a shallow dig falls outside the deep-dig requirement [14, 16].
    const result = assertConcept(
      buildSpec([
        { player: "H", action: { kind: "route", family: "Seam", depthYds: 18 } },
        { player: "X", action: { kind: "route", family: "In",   depthYds: 8  } },
      ]),
      "Dagger",
    );
    expect(result.ok).toBe(false);
  });
});

describe("parseConceptsFromText — finds Phase 7b additions", () => {
  it("detects 'Flood' in prose", () => {
    expect(parseConceptsFromText("Run a Flood right vs Cover 3.")).toContain("Flood");
  });
  it("detects alias 'Sail'", () => {
    expect(parseConceptsFromText("Sail concept to the field.")).toContain("Flood");
  });
  it("detects 'Drive'", () => {
    expect(parseConceptsFromText("Drive concept attacks the middle.")).toContain("Drive");
  });
  it("detects 'Levels'", () => {
    expect(parseConceptsFromText("Levels is a high-low LB read.")).toContain("Levels");
  });
  it("detects 'Y-Cross'", () => {
    expect(parseConceptsFromText("Y-Cross from a 12 personnel set.")).toContain("Y-Cross");
  });
  it("detects 'Dagger'", () => {
    expect(parseConceptsFromText("Dagger off play-action.")).toContain("Dagger");
  });
});

describe("assertConcept — unknown concept", () => {
  it("fails gracefully when the concept name doesn't exist", () => {
    const result = assertConcept(buildSpec([]), "Made-Up Concept");
    expect(result.ok).toBe(false);
  });
});

describe("assertConcept — variant-aware lenient match for 6v6", () => {
  // 6v6 has a 6-player offensive roster (no @S, no @Y) so the
  // catalog skeletons can't produce the canonical N-route pattern
  // for every concept. The 2026-05-25 lenient-match rule accepts
  // partial 6v6 adaptations: ≥1 required slot satisfied → ok, with
  // structural requirements still strict.

  function buildSpec6v6(assignments: PlayerAssignment[]): PlaySpec {
    return {
      schemaVersion: PLAY_SPEC_SCHEMA_VERSION,
      variant: "flag_6v6",
      title: "Test 6v6",
      playType: "offense",
      formation: { name: "Spread Doubles" },
      assignments,
    };
  }

  it("accepts a 1-Drag adaptation of Mesh in 6v6 (canonical needs 2 Drags)", () => {
    // 6v6 Mesh: catalog produces @H Drag + @X Curl + @Z Go + @B Flat.
    // Only one Drag — canonical Mesh requires two. Lenient: ok.
    // 2026-05-26: depth bumped to canonical 5yd (was 2yd from the
    // visual-workaround era).
    const result = assertConcept(
      buildSpec6v6([
        { player: "H", action: { kind: "route", family: "Drag", depthYds: 5 } },
        { player: "X", action: { kind: "route", family: "Curl", depthYds: 12 } },
        { player: "Z", action: { kind: "route", family: "Go" } },
        { player: "B", action: { kind: "route", family: "Flat" } },
      ]),
      "Mesh",
    );
    expect(result.ok).toBe(true);
  });

  it("REJECTS a 6v6 'Mesh' with zero Drags (lenient is ≥1, not 0)", () => {
    // No drag at all → still rejected. Lenient ≠ permissive.
    const result = assertConcept(
      buildSpec6v6([
        { player: "X", action: { kind: "route", family: "Curl", depthYds: 8 } },
        { player: "Z", action: { kind: "route", family: "Go" } },
      ]),
      "Mesh",
    );
    expect(result.ok).toBe(false);
  });

  it("accepts a Corner-only 6v6 Snag (canonical needs Spot + Corner + Flat)", () => {
    // 6v6 Snag: catalog produces @Z Corner + @B Flat + @X Go + @H Drag.
    // No Spot. Lenient: ok (Corner + Flat are the defining stretch).
    const result = assertConcept(
      buildSpec6v6([
        { player: "Z", action: { kind: "route", family: "Corner", depthYds: 13 } },
        { player: "B", action: { kind: "route", family: "Flat" } },
        { player: "X", action: { kind: "route", family: "Go" } },
        { player: "H", action: { kind: "route", family: "Drag" } },
      ]),
      "Snag",
    );
    expect(result.ok).toBe(true);
  });

  it("accepts 3-vertical Four Verticals in 6v6 (canonical needs 4 verts)", () => {
    // 6v6 only has 3 outside skill players (X, Z, H) — can't produce
    // a true 4-vert. Catalog gives 2 Go + 1 Seam + 1 Flat. Lenient: ok.
    const result = assertConcept(
      buildSpec6v6([
        { player: "X", action: { kind: "route", family: "Go" } },
        { player: "Z", action: { kind: "route", family: "Go" } },
        { player: "H", action: { kind: "route", family: "Seam", depthYds: 17 } },
        { player: "B", action: { kind: "route", family: "Flat" } },
      ]),
      "Four Verticals",
    );
    expect(result.ok).toBe(true);
  });

  it("still REJECTS 7v7 plays that miss canonical slots (strict mode preserved)", () => {
    // Same shape as the 6v6 Mesh adaptation, but in flag_7v7 the
    // strict rule applies — needs both Drags.
    const result = assertConcept(
      buildSpec([
        { player: "H", action: { kind: "route", family: "Drag", depthYds: 2 } },
        { player: "X", action: { kind: "route", family: "Curl", depthYds: 12 } },
      ]),
      "Mesh",
    );
    expect(result.ok).toBe(false);
  });

  it("does NOT relax structural requirements in 6v6 (Flea Flicker still needs returns-to-origin ballPath)", () => {
    // A 6v6 play that names "Flea Flicker" but has no ballPath
    // must still fail — structural requirements are variant-neutral.
    const result = assertConcept(
      {
        schemaVersion: PLAY_SPEC_SCHEMA_VERSION,
        variant: "flag_6v6",
        title: "Test 6v6 Flea",
        playType: "offense",
        formation: { name: "Spread Doubles" },
        assignments: [
          { player: "X", action: { kind: "route", family: "Go" } },
        ],
      },
      "Flea Flicker",
    );
    expect(result.ok).toBe(false);
  });
});

describe("detectConcept — finds matching concept in spec", () => {
  it("detects Curl-Flat from a satisfying spec", () => {
    const result = detectConcept(buildSpec([
      { player: "X", action: { kind: "route", family: "Curl", depthYds: 5 } },
      { player: "B", action: { kind: "route", family: "Flat" } },
    ]));
    expect(result?.ok).toBe(true);
    if (!result || !result.ok) return;
    expect(result.concept.name).toBe("Curl-Flat");
  });

  it("returns null when no concept matches", () => {
    const result = detectConcept(buildSpec([
      { player: "X", action: { kind: "route", family: "Slant" } },
    ]));
    expect(result).toBeNull();
  });
});

describe("parseConceptsFromText — finds concept names in chat prose", () => {
  it("finds 'Curl-Flat' written explicitly", () => {
    expect(parseConceptsFromText("This is a curl-flat concept.")).toContain("Curl-Flat");
  });

  it("finds aliases ('Curl/Flat')", () => {
    expect(parseConceptsFromText("Run the Curl/Flat vs press.")).toContain("Curl-Flat");
  });

  it("finds multi-word concepts ('Four Verticals')", () => {
    expect(parseConceptsFromText("Four Verticals beats Cover 2.")).toContain("Four Verticals");
  });

  it("does NOT match substrings (smashing != smash)", () => {
    // "smash" is a real concept but "smashing" should not trigger it
    // because of word-boundary matching.
    expect(parseConceptsFromText("They were smashing the ball.")).not.toContain("Smash");
  });

  it("returns empty when no concept is named", () => {
    expect(parseConceptsFromText("Just a slant route.")).toEqual([]);
  });
});
