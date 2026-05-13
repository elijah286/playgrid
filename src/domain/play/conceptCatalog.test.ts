/**
 * Concept catalog meta-tests.
 *
 * Pins assertions about the SHAPE of the catalog itself (rather than
 * the matcher behavior, which lives in conceptMatch.test.ts). Today
 * that's the complexity-tag invariant: every entry MUST be tagged so
 * Cal's recommendation engine has a signal to filter by. Adding a new
 * concept without a complexity tag fails this test — that's the lock-
 * step enforcement (AGENTS.md Rule 3) for the new field.
 */

import { describe, expect, it } from "vitest";
import { CONCEPT_CATALOG, type ConceptComplexity } from "./conceptCatalog";

const VALID_COMPLEXITIES: ReadonlySet<ConceptComplexity> = new Set([
  "basic",
  "intermediate",
  "advanced",
]);

describe("CONCEPT_CATALOG — complexity invariants", () => {
  it("every concept has a complexity tag", () => {
    const untagged = CONCEPT_CATALOG.filter((c) => c.complexity === undefined);
    expect(
      untagged.map((c) => c.name),
      "every concept must declare a complexity (basic | intermediate | advanced) so Cal's recommendation engine can filter by team ceiling",
    ).toEqual([]);
  });

  it("every complexity value is one of the three valid tiers", () => {
    for (const c of CONCEPT_CATALOG) {
      expect(
        c.complexity && VALID_COMPLEXITIES.has(c.complexity),
        `Concept "${c.name}" has invalid complexity "${c.complexity}". Must be one of: basic, intermediate, advanced.`,
      ).toBe(true);
    }
  });

  it("includes at least one concept at every tier (sanity — recommendation engine needs spread)", () => {
    const tiers = new Set(CONCEPT_CATALOG.map((c) => c.complexity));
    expect(tiers.has("basic"), "catalog needs at least one basic concept").toBe(true);
    expect(tiers.has("intermediate"), "catalog needs at least one intermediate concept").toBe(true);
    expect(tiers.has("advanced"), "catalog needs at least one advanced concept").toBe(true);
  });
});
