/**
 * Coverage matchup profiles + evaluator goldens.
 *
 * Locks the grounded matchup verdicts the `evaluate_matchup` Cal tool projects:
 * a concept that beats a coverage reads "favors_offense"; one the coverage is
 * built to stop reads "contested" with the soft spots to attack; an unknown
 * coverage degrades to "unknown" instead of bluffing.
 */
import { describe, expect, it } from "vitest";
import {
  COVERAGE_PROFILES,
  findCoverageProfile,
  evaluateMatchup,
} from "./coverageProfiles";

describe("findCoverageProfile", () => {
  it("resolves canonical names and aliases", () => {
    expect(findCoverageProfile("Cover 3")?.coverage).toBe("Cover 3");
    expect(findCoverageProfile("cover3")?.coverage).toBe("Cover 3");
    expect(findCoverageProfile("c3")?.coverage).toBe("Cover 3");
    expect(findCoverageProfile("Tampa 2")?.coverage).toBe("Tampa 2");
    expect(findCoverageProfile("quarters")?.coverage).toBe("Cover 4");
  });

  it("loose-matches a descriptive coverage string", () => {
    expect(findCoverageProfile("base cover 3 sky")?.coverage).toBe("Cover 3");
  });

  it("returns null for an unknown coverage", () => {
    expect(findCoverageProfile("Cover 9 Robber Banana")).toBeNull();
  });
});

describe("evaluateMatchup — verdicts", () => {
  it("grades a beater as favoring the offense (Smash vs Cover 2)", () => {
    const e = evaluateMatchup({ coverageInput: "Cover 2", conceptName: "Smash" });
    expect(e.verdict).toBe("favors_offense");
    expect(e.grounded).toBe(true);
    expect(e.coverage).toBe("Cover 2");
    expect(e.headline).toMatch(/Smash/);
    // Smash shouldn't be suggested as its own alternative.
    expect(e.alternatives).not.toContain("Smash");
    // But other Cover 2 beaters should be offered.
    expect(e.alternatives.length).toBeGreaterThan(0);
  });

  it("grades Four Verticals as favoring the offense vs Cover 0 (no deep help)", () => {
    const e = evaluateMatchup({ coverageInput: "Cover 0", conceptName: "Four Verticals" });
    expect(e.verdict).toBe("favors_offense");
    expect(e.softSpots.join(" ")).toMatch(/deep/i);
  });

  it("grades a non-beater with a reactor read as contested (Mesh vs Tampa 2)", () => {
    const e = evaluateMatchup({
      coverageInput: "Tampa 2",
      conceptName: "Mesh",
      reactorRead: "Tampa 2 vs Mesh — wall off the crossing drags.",
      reactorCues: ["HL walls off the underneath drag."],
    });
    expect(e.verdict).toBe("contested");
    expect(e.reactorRead).toMatch(/wall off/i);
    expect(e.reactorCues.length).toBe(1);
    expect(e.headline).toMatch(/built-in answer|contested/i);
  });

  it("grades a non-beater without a reactor as contested and points at soft spots", () => {
    const e = evaluateMatchup({ coverageInput: "Cover 4", conceptName: "Four Verticals" });
    expect(e.verdict).toBe("contested");
    expect(e.softSpots.length).toBeGreaterThan(0);
    // Cover 4 is strong deep — that should be surfaced as a thing to avoid.
    expect(e.reasons.join(" ")).toMatch(/deep/i);
  });

  it("suggests alternatives drawn from the coverage's beaters", () => {
    const e = evaluateMatchup({ coverageInput: "Cover 3", conceptName: "Mesh" });
    // Cover 3 beaters include Curl-Flat / Slant-Flat / Smash / Flood.
    expect(e.alternatives).toEqual(
      expect.arrayContaining(["Curl-Flat", "Slant-Flat"]),
    );
  });

  it("degrades to 'unknown' for an unrecognized coverage (no bluffing)", () => {
    const e = evaluateMatchup({ coverageInput: "Cover 9 Banana", conceptName: "Mesh" });
    expect(e.verdict).toBe("unknown");
    expect(e.grounded).toBe(false);
    expect(e.alternatives).toEqual([]);
  });

  it("handles a missing concept by still surfacing soft spots + beaters", () => {
    const e = evaluateMatchup({ coverageInput: "Cover 3", conceptName: null });
    expect(e.verdict).toBe("unknown");
    expect(e.softSpots.length).toBeGreaterThan(0);
    expect(e.alternatives.length).toBeGreaterThan(0);
  });
});

describe("COVERAGE_PROFILES — catalog integrity", () => {
  it("every beater names a non-empty concept string", () => {
    for (const p of COVERAGE_PROFILES) {
      for (const b of p.beaters) expect(b.trim().length).toBeGreaterThan(0);
    }
  });

  it("no profile lists the same area as both soft and strong", () => {
    for (const p of COVERAGE_PROFILES) {
      const soft = new Set(p.softSpots.map((s) => s.toLowerCase()));
      for (const strong of p.strongSpots) {
        expect(soft.has(strong.toLowerCase())).toBe(false);
      }
    }
  });
});
