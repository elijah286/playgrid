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

  it("every concept has at least one required assignment", () => {
    for (const c of CONCEPT_CATALOG) {
      expect(c.required.length, `${c.name} has no required assignments`).toBeGreaterThan(0);
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

  it("Mesh: two drags pass", () => {
    const result = assertConcept(
      buildSpec([
        { player: "X", action: { kind: "route", family: "Drag", depthYds: 3 } },
        { player: "Z", action: { kind: "route", family: "Drag", depthYds: 3 } },
      ]),
      "Mesh",
    );
    expect(result.ok).toBe(true);
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

describe("assertConcept — unknown concept", () => {
  it("fails gracefully when the concept name doesn't exist", () => {
    const result = assertConcept(buildSpec([]), "Made-Up Concept");
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
