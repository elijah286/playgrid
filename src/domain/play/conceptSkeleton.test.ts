/**
 * Concept skeleton generator tests.
 *
 * Two layers of assertions:
 *   1. STRUCTURAL: every CONCEPT_CATALOG entry has a skeleton builder
 *      (so we can't ship a new concept without skeleton coverage).
 *   2. ROUND-TRIP: every generated skeleton SATISFIES its own concept
 *      via assertConcept. If the catalog tightens a concept (e.g. Mesh
 *      slot ranges shift), the skeleton must still pass — otherwise
 *      the skeleton is stale and Cal would author a play that fails
 *      its own concept validator.
 */

import { describe, expect, it } from "vitest";
import { generateConceptSkeleton } from "./conceptSkeleton";
import { CONCEPT_CATALOG, findConcept } from "./conceptCatalog";
import { assertConcept } from "./conceptMatch";
import { playSpecToCoachDiagram } from "./specRenderer";

describe("generateConceptSkeleton — every catalog concept has a builder", () => {
  for (const concept of CONCEPT_CATALOG) {
    it(`${concept.name}: builder exists and returns ok`, () => {
      const result = generateConceptSkeleton(concept.name, { variant: "tackle_11" });
      expect(result.ok, result.ok ? undefined : result.error).toBe(true);
    });
  }
});

describe("generateConceptSkeleton — every skeleton SATISFIES its own concept (round-trip)", () => {
  for (const concept of CONCEPT_CATALOG) {
    it(`${concept.name}: skeleton spec passes assertConcept("${concept.name}")`, () => {
      const result = generateConceptSkeleton(concept.name, { variant: "tackle_11" });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const matchResult = assertConcept(result.spec, concept.name);
      expect(
        matchResult.ok,
        matchResult.ok
          ? undefined
          : `Skeleton for "${concept.name}" failed its own concept validator: ${JSON.stringify(matchResult.violations)}`,
      ).toBe(true);
    });
  }
});

describe("generateConceptSkeleton — alias resolution", () => {
  it("resolves 'Sail' → Flood skeleton", () => {
    const result = generateConceptSkeleton("Sail", { variant: "tackle_11" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.concept).toBe("Flood");
  });
  it("resolves 'Mesh Concept' → Mesh skeleton", () => {
    const result = generateConceptSkeleton("Mesh Concept", { variant: "tackle_11" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.concept).toBe("Mesh");
  });
  it("rejects an unknown concept and lists available", () => {
    const result = generateConceptSkeleton("Made-Up Concept", { variant: "tackle_11" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.availableConcepts.length).toBeGreaterThan(0);
    expect(result.error).toContain("Unknown concept");
  });
});

describe("generateConceptSkeleton — strength side", () => {
  it("Flood Right: Z+S+B all on the right side", () => {
    const result = generateConceptSkeleton("Flood", { variant: "tackle_11", strength: "right" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const cornerAssignment = result.spec.assignments.find(
      (a) => a.action.kind === "route" && a.action.family === "Corner",
    );
    expect(cornerAssignment?.player).toBe("Z");
  });
  it("Flood Left: X+H+B all on the left side", () => {
    const result = generateConceptSkeleton("Flood", { variant: "tackle_11", strength: "left" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const cornerAssignment = result.spec.assignments.find(
      (a) => a.action.kind === "route" && a.action.family === "Corner",
    );
    expect(cornerAssignment?.player).toBe("X");
  });
});

describe("generateConceptSkeleton — Mesh: differentiated drag depths", () => {
  it("the two drags have different depthYds (one under, one over)", () => {
    const result = generateConceptSkeleton("Mesh", { variant: "tackle_11" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const drags = result.spec.assignments.filter(
      (a) => a.action.kind === "route" && a.action.family === "Drag",
    );
    expect(drags).toHaveLength(2);
    const depths = drags.map((d) => (d.action.kind === "route" ? d.action.depthYds : undefined));
    expect(new Set(depths).size).toBe(2); // must be DIFFERENT depths
  });
});

describe("generateConceptSkeleton — Flood Right tackle_11 doesn't trigger the overlap resolver (S vs H regression)", () => {
  // Reproduces the exact scenario the coach hit 2026-05-02: a Flood
  // Right play in tackle_11 that failed with "Overlap resolver failed
  // to converge ... 'S' and 'H' overlap (Δ 3.56 yds)". Root cause was
  // the synthesizer placing the inner slot at x=4 (RT's column).
  // Now: with the synthesizer clamp (|x| >= 6 for slots), the rendered
  // diagram should have S and H at distinct, non-OL-overlapping
  // positions.
  it("rendered Flood Right has S and H at non-overlapping x positions, both clear of the OL row", () => {
    const result = generateConceptSkeleton("Flood", { variant: "tackle_11", strength: "right" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { diagram } = playSpecToCoachDiagram(result.spec);
    const s = diagram.players.find((p) => p.id === "S");
    const h = diagram.players.find((p) => p.id === "H");
    expect(s, "Flood Right: S not in rendered formation").toBeDefined();
    expect(h, "Flood Right: H not in rendered formation").toBeDefined();
    // Distinct x positions.
    expect(s!.x).not.toBe(h!.x);
    // Both clear of the OL row (|x| >= 6 in tackle_11).
    expect(Math.abs(s!.x)).toBeGreaterThanOrEqual(6);
    expect(Math.abs(h!.x)).toBeGreaterThanOrEqual(6);
    // Both on the same (right) side per Flood semantics.
    expect(s!.x).toBeGreaterThan(0);
    expect(h!.x).toBeGreaterThan(0);
  });
});

describe("generateConceptSkeleton — every skeleton RENDERS without overlap or fallback (regression for S+H stacking)", () => {
  // Every skeleton must produce a CoachDiagram where (a) the synthesizer
  // recognized the formation (no formation_fallback warning), and (b) no
  // two offensive players occupy the same (x, y). This locks in the
  // "Cal hand-authored S+H at the same position" failure mode (2026-05-02)
  // — the skeleton tool now feeds Cal a rendered diagram, so as long as
  // every skeleton renders cleanly, that bug class is impossible.
  for (const concept of CONCEPT_CATALOG) {
    it(`${concept.name}: renders to a CoachDiagram with NO overlapping players and NO formation_fallback`, () => {
      const result = generateConceptSkeleton(concept.name, { variant: "tackle_11" });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const { diagram, warnings } = playSpecToCoachDiagram(result.spec);
      expect(
        warnings.find((w) => w.code === "formation_fallback"),
        `${concept.name}: formation_fallback fired — synthesizer didn't recognize "${result.spec.formation.name}". Use a parsed name.`,
      ).toBeUndefined();
      // No two offensive players at exactly the same (x, y).
      const offense = diagram.players.filter((p) => p.team !== "D");
      const positions = new Set<string>();
      const collisions: string[] = [];
      for (const p of offense) {
        const key = `${p.x},${p.y}`;
        if (positions.has(key)) collisions.push(`@${p.id} at (${p.x}, ${p.y})`);
        positions.add(key);
      }
      expect(
        collisions,
        `${concept.name}: players overlap at the same (x, y): ${collisions.join(", ")}`,
      ).toEqual([]);
    });
  }
});

describe("generateConceptSkeleton — concept catalog smoke (every concept's skeleton is well-formed)", () => {
  for (const concept of CONCEPT_CATALOG) {
    it(`${concept.name}: spec has a formation, a non-empty assignments list, and a notes string`, () => {
      const result = generateConceptSkeleton(concept.name, { variant: "tackle_11" });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.spec.formation.name).toBeTruthy();
      expect(result.spec.assignments.length).toBeGreaterThan(0);
      expect(result.notes.length).toBeGreaterThan(20);
      // Concept reference round-trips through findConcept.
      expect(findConcept(result.concept)).not.toBeNull();
    });
  }
});
