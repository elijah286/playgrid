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
