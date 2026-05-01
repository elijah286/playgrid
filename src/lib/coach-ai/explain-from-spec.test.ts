/**
 * Goldens for explainSpec — the spec → structured explanation projection.
 *
 * The contract: given a saved PlaySpec, the explanation includes the
 * formation, defense (when set), per-player assignments, and a
 * confidence summary. Output is structurally derived (no LLM synthesis)
 * so it cannot fabricate or contradict the spec.
 *
 * Tests assert on key SUBSTRINGS rather than full string equality so
 * phrasing can evolve. Structural facts (presence of headings, the
 * @Label references, the depth + side, confidence flags) are what
 * matter.
 */

import { describe, expect, it } from "vitest";
import { explainSpec } from "./explain-from-spec";
import { PLAY_SPEC_SCHEMA_VERSION, type PlaySpec } from "@/domain/play/spec";

function baseSpec(overrides: Partial<PlaySpec> = {}): PlaySpec {
  return {
    schemaVersion: PLAY_SPEC_SCHEMA_VERSION,
    variant: "flag_7v7",
    title: "Spread Slant/Post",
    playType: "offense",
    formation: { name: "Spread Doubles", confidence: "high" },
    assignments: [
      { player: "X", action: { kind: "route", family: "Slant" }, confidence: "high" },
      { player: "Z", action: { kind: "route", family: "Post" }, confidence: "high" },
    ],
    ...overrides,
  };
}

describe("explainSpec — structure", () => {
  it("opens with the play title as a heading", () => {
    const out = explainSpec(baseSpec());
    expect(out).toMatch(/^## Spread Slant\/Post/);
  });

  it("includes a Formation section", () => {
    const out = explainSpec(baseSpec());
    expect(out).toMatch(/\*\*Formation\*\*: Spread Doubles/);
  });

  it("includes a Defense section when defense is set", () => {
    const out = explainSpec(baseSpec({
      defense: { front: "7v7 Zone", coverage: "Cover 3", confidence: "high" },
    }));
    expect(out).toMatch(/\*\*Defense\*\*: 7v7 Zone — Cover 3/);
  });

  it("omits the Defense section when defense is not set", () => {
    const out = explainSpec(baseSpec());
    expect(out).not.toMatch(/\*\*Defense\*\*/);
  });

  it("includes one bullet per route assignment under Assignments", () => {
    const out = explainSpec(baseSpec());
    expect(out).toMatch(/\*\*Assignments\*\*:/);
    const bullets = out.split("\n").filter((l) => l.startsWith("- @"));
    expect(bullets).toHaveLength(2);
  });

  it("includes Confidence floor + counts", () => {
    const out = explainSpec(baseSpec());
    expect(out).toMatch(/\*\*Confidence\*\*: high/);
    expect(out).toMatch(/high: \d+, med: \d+, low: \d+/);
  });
});

describe("explainSpec — assignment narration", () => {
  it("describes route assignments with depth + side from the catalog", () => {
    const out = explainSpec(baseSpec());
    // Slant: catalog range [3, 7], breaks inside.
    expect(out).toMatch(/@X: slant route — 3-7 yards \(catalog range\), breaks inside/);
  });

  it("uses depthYds when explicitly set on the assignment", () => {
    const out = explainSpec(baseSpec({
      assignments: [{ player: "X", action: { kind: "route", family: "Slant", depthYds: 6 } }],
    }));
    expect(out).toMatch(/@X: slant route — 6 yards/);
  });

  it("describes blocks", () => {
    const out = explainSpec(baseSpec({
      assignments: [{ player: "LT", action: { kind: "block" } }],
    }));
    expect(out).toMatch(/@LT: pass protect/);
  });

  it("describes targeted blocks", () => {
    const out = explainSpec(baseSpec({
      assignments: [{ player: "F", action: { kind: "block", target: "edge" } }],
    }));
    expect(out).toMatch(/@F: pass protect — edge/);
  });

  it("describes ballcarriers with run type", () => {
    const out = explainSpec(baseSpec({
      assignments: [{ player: "B", action: { kind: "carry", runType: "inside_zone" } }],
    }));
    expect(out).toMatch(/@B: ballcarrier — inside zone/);
  });

  it("describes custom actions verbatim from description", () => {
    const out = explainSpec(baseSpec({
      assignments: [{
        player: "Y",
        action: { kind: "custom", description: "leak out late as 6th protector" },
      }],
    }));
    expect(out).toMatch(/@Y: custom shape — "leak out late as 6th protector"/);
  });

  it("OMITS unspecified-action players (no fabricated bullet)", () => {
    const out = explainSpec(baseSpec({
      assignments: [
        { player: "X", action: { kind: "route", family: "Slant" }, confidence: "high" },
        { player: "F", action: { kind: "unspecified" }, confidence: "low" },
      ],
    }));
    expect(out).toMatch(/@X:/);
    expect(out).not.toMatch(/@F:/);
  });

  it("flags off-catalog route families instead of fabricating geometry", () => {
    const out = explainSpec(baseSpec({
      assignments: [{ player: "X", action: { kind: "route", family: "Uppercut" } }],
    }));
    expect(out).toMatch(/@X: Uppercut route \(off-catalog — geometry undefined\)/);
  });
});

describe("explainSpec — confidence", () => {
  it("flags low-confidence formation in the section header", () => {
    const out = explainSpec(baseSpec({
      formation: { name: "Spread Doubles", confidence: "low" },
    }));
    expect(out).toMatch(/Formation.*low confidence/);
  });

  it("flags low-confidence assignments inline", () => {
    const out = explainSpec(baseSpec({
      assignments: [
        { player: "X", action: { kind: "custom", description: "freelance" }, confidence: "low" },
      ],
    }));
    expect(out).toMatch(/@X:.*low confidence/);
  });

  it("reports overall confidence floor as 'low' when any element is low", () => {
    const out = explainSpec(baseSpec({
      assignments: [
        { player: "X", action: { kind: "route", family: "Slant" }, confidence: "high" },
        { player: "F", action: { kind: "custom", description: "freelance" }, confidence: "low" },
      ],
    }));
    expect(out).toMatch(/\*\*Confidence\*\*: low/);
  });

  it("lists low-confidence elements in the confidence section", () => {
    const out = explainSpec(baseSpec({
      defense: { front: "unknown", coverage: "unknown", confidence: "low" },
    }));
    expect(out).toMatch(/Low-confidence elements:.*defense unknown\/unknown/);
  });

  it("does not list low-conf elements when there are none", () => {
    const out = explainSpec(baseSpec());
    expect(out).not.toMatch(/Low-confidence elements:/);
  });
});

describe("explainSpec — determinism", () => {
  it("produces identical output across two calls for the same spec", () => {
    const spec = baseSpec({
      defense: { front: "7v7 Zone", coverage: "Cover 3" },
    });
    expect(explainSpec(spec)).toBe(explainSpec(spec));
  });
});
