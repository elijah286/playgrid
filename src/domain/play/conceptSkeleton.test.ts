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
import { coachDiagramToPlayDocument } from "@/features/coach-ai/coachDiagramConverter";

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

describe("generateConceptSkeleton — Flood: slot is Out, RB flat goes to flood side", () => {
  // 2026-05-02 coach feedback regressions, pinned together because
  // they share a root cause (slot family + RB direction):
  //   1. Flood's slot used to be Curl 5; coach surfaced that real
  //      Flood is OUT at the second level (8yd). Pin Out + depth.
  //   2. Flood Left used to render B's flat going RIGHT because
  //      B's natural backfield x≈+2 in Spread Doubles. The skeleton
  //      now sets `direction: "left"` so the flat goes flood-side
  //      regardless of backfield position.

  it("slot runs an Out at the second level (depth 8yd)", () => {
    const result = generateConceptSkeleton("Flood", { variant: "tackle_11", strength: "right" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const slotAssignment = result.spec.assignments.find(
      (a) => a.player === "S" && a.action.kind === "route",
    );
    expect(slotAssignment).toBeDefined();
    if (!slotAssignment || slotAssignment.action.kind !== "route") return;
    expect(slotAssignment.action.family).toBe("Out");
    expect(slotAssignment.action.depthYds).toBe(8);
  });

  it("Flood Left: RB's Flat carries direction='left' so it renders to the flood side", () => {
    const result = generateConceptSkeleton("Flood", { variant: "tackle_11", strength: "left" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const bAssignment = result.spec.assignments.find(
      (a) => a.player === "B" && a.action.kind === "route",
    );
    expect(bAssignment).toBeDefined();
    if (!bAssignment || bAssignment.action.kind !== "route") return;
    expect(bAssignment.action.family).toBe("Flat");
    expect(bAssignment.action.direction).toBe("left");
  });

  it("Flood Right: RB's Flat carries direction='right'", () => {
    const result = generateConceptSkeleton("Flood", { variant: "tackle_11", strength: "right" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const bAssignment = result.spec.assignments.find(
      (a) => a.player === "B" && a.action.kind === "route",
    );
    if (!bAssignment || bAssignment.action.kind !== "route") return;
    expect(bAssignment.action.direction).toBe("right");
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

describe("generateConceptSkeleton — every skeleton survives the overlap resolver (real end-to-end check)", () => {
  // The unit-level "no overlapping (x, y)" check in the next describe
  // block isn't sufficient — the production overlap resolver uses a
  // normalized-distance THRESHOLD (≈ 0.0672), not exact equality. A
  // slot at x=6 next to RT at x=4 (different y) has unique (x, y) but
  // is still within the resolver's threshold and triggers the same
  // failure that surfaced 2026-05-02. This test runs the full
  // coachDiagramToPlayDocument pipeline (which is what the chat embed
  // uses) and asserts it doesn't throw the overlap-resolver error.
  for (const concept of CONCEPT_CATALOG) {
    const sides: Array<"left" | "right" | undefined> = ["left", "right", undefined];
    for (const strength of sides) {
      const label = strength ? `${concept.name} (${strength})` : concept.name;
      it(`${label} in tackle_11 passes the overlap resolver end-to-end`, () => {
        const result = generateConceptSkeleton(concept.name, { variant: "tackle_11", strength });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const { diagram } = playSpecToCoachDiagram(result.spec);
        // Wrap in the chat-fence shape coachDiagramToPlayDocument expects.
        const fenceShape = {
          title: result.spec.title ?? result.concept,
          variant: "tackle_11" as const,
          focus: "O" as const,
          ...diagram,
        };
        expect(
          () => coachDiagramToPlayDocument(fenceShape),
          `${label}: overlap resolver threw — geometry isn't safe`,
        ).not.toThrow();
      });
    }
  }
});

describe("generateConceptSkeleton — Flood Right tackle_11 doesn't trigger the overlap resolver (S vs H regression)", () => {
  // Reproduces the exact scenario the coach hit 2026-05-02: a Flood
  // Right play in tackle_11 that failed with "Overlap resolver failed
  // to converge ... 'S' and 'H' overlap (Δ 3.56 yds)". Root cause was
  // the synthesizer placing the inner slot at x=4 (RT's column).
  // Now: with the synthesizer clamp (|x| >= 6 for slots), the rendered
  // diagram should have S and H at distinct, non-OL-overlapping
  // positions.
  it("rendered Flood Right (Spread Doubles): S and H end up on OPPOSITE sides at distinct, OL-clear positions", () => {
    // 2026-05-02: Flood now uses Spread Doubles (not Trips), so H ends
    // up on the LEFT (backside drag) and S on the RIGHT (strong-side
    // curl). The diagram is structurally clean: S and H are on
    // opposite sides → can't overlap each other; both clear of the OL.
    const result = generateConceptSkeleton("Flood", { variant: "tackle_11", strength: "right" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { diagram } = playSpecToCoachDiagram(result.spec);
    const s = diagram.players.find((p) => p.id === "S");
    const h = diagram.players.find((p) => p.id === "H");
    expect(s, "Flood Right: S not in rendered formation").toBeDefined();
    expect(h, "Flood Right: H not in rendered formation").toBeDefined();
    // Strong-side slot (S) on the right; backside slot (H) on the left.
    expect(s!.x).toBeGreaterThan(0);
    expect(h!.x).toBeLessThan(0);
    // Both clear of the OL row.
    expect(Math.abs(s!.x)).toBeGreaterThanOrEqual(7);
    expect(Math.abs(h!.x)).toBeGreaterThanOrEqual(7);
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
