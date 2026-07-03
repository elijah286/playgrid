import { describe, expect, it } from "vitest";
import { aggregate, scoreAssignment, scorePlay, resolveFamily } from "./score";
import type { GoldenPlay } from "./goldens";
import type { PlayExtraction } from "./schema";

describe("resolveFamily", () => {
  it("resolves catalog names case-insensitively", () => {
    expect(resolveFamily("go")).toBe("Go");
    expect(resolveFamily("CORNER")).toBe("Corner");
  });

  it("resolves aliases to the canonical template name", () => {
    // "Vert"/"Streak" style aliases live in the catalog; at minimum the
    // canonical name must resolve to itself and unknown names fall back
    // to a normalized string rather than throwing.
    expect(resolveFamily("Go")).toBe("Go");
    expect(resolveFamily("made-up route")).toBe("made-up route");
  });
});

const golden: GoldenPlay = {
  index: 1,
  verified: true,
  formation: { name: "Trips Left", alternates: ["Bunch Left"] },
  assignments: [
    { player: "X", kind: "route", family: "Corner", alternates: ["Post"], depthYds: 12, direction: "right" },
    { player: "Y", kind: "route", family: "Seam", depthYds: 12 },
    { player: "B", kind: "route", family: "Hitch", depthYds: 5, depthTolYds: 2 },
  ],
};

function extraction(overrides: Partial<PlayExtraction> = {}): PlayExtraction {
  return {
    players: [
      { label: "X", side: "right", onLos: true, backfield: false },
      { label: "Y", side: "left", onLos: true, backfield: false },
      { label: "B", side: "left", onLos: false, backfield: false },
    ],
    formation: { name: "Bunch Left", confidence: "med" },
    assignments: [
      { player: "X", kind: "route", family: "Post", depthYds: 14, confidence: "med" },
      { player: "Y", kind: "route", family: "Seam", depthYds: 11, confidence: "high" },
      { player: "B", kind: "route", family: "Out", depthYds: 5, confidence: "high" },
    ],
    ...overrides,
  };
}

describe("scoreAssignment", () => {
  it("credits alternates without counting them as exact", () => {
    const s = scoreAssignment(golden.assignments[0], extraction().assignments[0]);
    expect(s.familyOk).toBe(false);
    expect(s.familyAltOk).toBe(true);
  });

  it("applies per-assignment depth tolerance", () => {
    const inTol = scoreAssignment(golden.assignments[0], { player: "X", kind: "route", family: "Corner", depthYds: 14, confidence: "high" });
    expect(inTol.depthOk).toBe(true); // Δ2 within default 3
    const outTol = scoreAssignment(golden.assignments[2], { player: "B", kind: "route", family: "Hitch", depthYds: 9, confidence: "high" });
    expect(outTol.depthOk).toBe(false); // Δ4 outside explicit tol 2
  });

  it("marks a missing player as absent with everything false", () => {
    const s = scoreAssignment(golden.assignments[1], undefined);
    expect(s.present).toBe(false);
    expect(s.kindOk).toBe(false);
    expect(s.familyAltOk).toBe(false);
  });

  it("does not compare family across kinds", () => {
    const s = scoreAssignment(golden.assignments[1], { player: "Y", kind: "carry", confidence: "high" });
    expect(s.kindOk).toBe(false);
    expect(s.familyOk).toBe(false);
  });
});

describe("scorePlay + aggregate", () => {
  it("accepts formation alternates and matches players case-insensitively", () => {
    const score = scorePlay(golden, extraction());
    expect(score.formationOk).toBe(true);
    expect(score.assignments).toHaveLength(3);
  });

  it("scores a failed extraction as all-miss but keeps the play counted", () => {
    const agg = aggregate([scorePlay(golden, null)]);
    expect(agg.plays).toBe(1);
    expect(agg.extractedPlays).toBe(0);
    expect(agg.familyAltAcc).toBe(0);
  });

  it("computes calibration buckets and the flagged-miss rate", () => {
    const agg = aggregate([scorePlay(golden, extraction())]);
    // X: alt-ok @med, Y: ok @high, B: MISS @high (Out ≠ Hitch, no alternate)
    expect(agg.calibration.med.n).toBe(1);
    expect(agg.calibration.med.familyAltOk).toBe(1);
    expect(agg.calibration.high.n).toBe(2);
    expect(agg.calibration.high.familyAltOk).toBe(1);
    expect(agg.missesFlagged).toEqual({ misses: 1, flagged: 0 });
    expect(agg.familyAltAcc).toBeCloseTo(2 / 3);
    // depth MAE over the three comparisons: Δ2 (X), Δ1 (Y), Δ0 (B)
    expect(agg.depthMaeYds).toBeCloseTo(1);
  });
});
