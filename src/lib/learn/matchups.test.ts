import { describe, expect, it } from "vitest";
import { conceptMatchups } from "./matchups";

describe("conceptMatchups", () => {
  it("inverts the source for a passing concept (Mesh)", () => {
    const m = conceptMatchups("Mesh");
    expect(m.coverageGraded).toBe(true);
    expect(m.strong.map((s) => s.coverage)).toEqual(
      expect.arrayContaining(["Cover 0", "Cover 1", "Cover 4"]),
    );
    expect(m.contested.map((c) => c.coverage)).toEqual(
      expect.arrayContaining(["Cover 2", "Tampa 2", "Cover 3"]),
    );
    // Contested entries surface alternative beaters (for internal links),
    // never the concept itself.
    const c3 = m.contested.find((c) => c.coverage === "Cover 3");
    expect(c3?.alternatives.length).toBeGreaterThan(0);
    expect(c3?.alternatives).not.toContain("Mesh");
  });

  it("marks run concepts as not coverage-graded (Sweep)", () => {
    const m = conceptMatchups("Sweep");
    expect(m.coverageGraded).toBe(false);
    expect(m.strong).toEqual([]);
  });

  it("reflects the Tier-1 beater enrichment (Snag now beats Cover 3)", () => {
    const m = conceptMatchups("Snag");
    expect(m.strong.map((s) => s.coverage)).toContain("Cover 3");
  });
});
