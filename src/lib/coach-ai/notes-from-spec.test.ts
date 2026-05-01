/**
 * Goldens for projectSpecToNotes — the spec → prose projection.
 *
 * The contract: same spec → same notes. Coaches see deterministic,
 * canonical narration that cannot drift from the rendered diagram.
 *
 * Each test asserts on key SUBSTRINGS rather than full string equality.
 * Style of phrasing can evolve; the structural facts (depth, side,
 * @Label references, modifier flags) cannot change without an
 * intentional code+test edit. This keeps the goldens robust to small
 * prose tweaks while still catching meaningful drift.
 */

import { describe, expect, it } from "vitest";
import { projectSpecToNotes } from "./notes-from-spec";
import { PLAY_SPEC_SCHEMA_VERSION, type PlaySpec } from "@/domain/play/spec";

function baseSpec(overrides: Partial<PlaySpec> = {}): PlaySpec {
  return {
    schemaVersion: PLAY_SPEC_SCHEMA_VERSION,
    variant: "flag_7v7",
    title: "Spread Slant/Post",
    playType: "offense",
    formation: { name: "Spread Doubles" },
    assignments: [],
    ...overrides,
  };
}

describe("projectSpecToNotes — opener", () => {
  it("opens with @Q reads ... for offense", () => {
    const notes = projectSpecToNotes(baseSpec({
      assignments: [{ player: "X", action: { kind: "route", family: "Slant" } }],
    }));
    expect(notes.split("\n")[0]).toMatch(/^@Q reads/);
  });

  it("includes the formation name in the opener", () => {
    const notes = projectSpecToNotes(baseSpec({
      formation: { name: "Trips Right" },
      assignments: [{ player: "X", action: { kind: "route", family: "Slant" } }],
    }));
    expect(notes).toMatch(/Trips Right/);
  });

  it("includes the defense in the opener when set", () => {
    const notes = projectSpecToNotes(baseSpec({
      defense: { front: "7v7 Zone", coverage: "Cover 3" },
      assignments: [{ player: "X", action: { kind: "route", family: "Slant" } }],
    }));
    expect(notes).toMatch(/Cover 3/);
  });

  it("uses defense-style opener for defensive plays", () => {
    const notes = projectSpecToNotes(baseSpec({
      playType: "defense",
      defense: { front: "7v7 Zone", coverage: "Cover 3" },
    }));
    expect(notes).toMatch(/^Defense in/);
  });
});

describe("projectSpecToNotes — route bullets", () => {
  it("emits one bullet per route assignment", () => {
    const notes = projectSpecToNotes(baseSpec({
      assignments: [
        { player: "X", action: { kind: "route", family: "Slant" } },
        { player: "Z", action: { kind: "route", family: "Post" } },
        { player: "H", action: { kind: "route", family: "Hitch" } },
      ],
    }));
    const bulletLines = notes.split("\n").filter((l) => l.startsWith("- "));
    expect(bulletLines).toHaveLength(3);
  });

  it("references each player by @Label", () => {
    const notes = projectSpecToNotes(baseSpec({
      assignments: [
        { player: "X", action: { kind: "route", family: "Slant" } },
        { player: "Z", action: { kind: "route", family: "Post" } },
      ],
    }));
    expect(notes).toMatch(/@X:/);
    expect(notes).toMatch(/@Z:/);
  });

  it("includes the route family name in lower-case", () => {
    const notes = projectSpecToNotes(baseSpec({
      assignments: [{ player: "X", action: { kind: "route", family: "Slant" } }],
    }));
    expect(notes).toMatch(/slant/);
  });

  it("includes a depth and side for inside routes", () => {
    const notes = projectSpecToNotes(baseSpec({
      assignments: [{ player: "X", action: { kind: "route", family: "Slant" } }],
    }));
    // Slant constraint range is [3, 7] → midpoint 5.
    expect(notes).toMatch(/5-yard slant inside/);
  });

  it("includes a depth and 'to the sideline' for outside routes", () => {
    const notes = projectSpecToNotes(baseSpec({
      assignments: [{ player: "Z", action: { kind: "route", family: "Out" } }],
    }));
    expect(notes).toMatch(/out to the sideline/);
  });

  it("does not append a side for vertical routes (Go is vertical, not 'inside')", () => {
    const notes = projectSpecToNotes(baseSpec({
      assignments: [{ player: "X", action: { kind: "route", family: "Go" } }],
    }));
    expect(notes).not.toMatch(/go inside/);
    expect(notes).not.toMatch(/go to the sideline/);
  });

  it("honors a custom depthYds when provided", () => {
    const notes = projectSpecToNotes(baseSpec({
      assignments: [{ player: "X", action: { kind: "route", family: "Slant", depthYds: 6 } }],
    }));
    expect(notes).toMatch(/6-yard slant/);
  });

  it("emits the catalog coaching cue", () => {
    const notes = projectSpecToNotes(baseSpec({
      assignments: [{ player: "X", action: { kind: "route", family: "Slant" } }],
    }));
    // The catalog cue for slant: "sharp break at the inside hip..."
    expect(notes.toLowerCase()).toMatch(/sharp break/);
  });

  it("flags hot routes in the bullet", () => {
    const notes = projectSpecToNotes(baseSpec({
      assignments: [{ player: "X", action: { kind: "route", family: "Slant", modifiers: ["hot"] } }],
    }));
    expect(notes).toMatch(/hot vs blitz/);
  });

  it("flags option routes in the bullet", () => {
    const notes = projectSpecToNotes(baseSpec({
      assignments: [{ player: "X", action: { kind: "route", family: "Hitch", modifiers: ["option"] } }],
    }));
    expect(notes).toMatch(/option route/);
  });
});

describe("projectSpecToNotes — non-route actions", () => {
  it("narrates blocks", () => {
    const notes = projectSpecToNotes(baseSpec({
      assignments: [{ player: "LT", action: { kind: "block" } }],
    }));
    expect(notes).toMatch(/@LT: pass protect/);
  });

  it("narrates targeted blocks", () => {
    const notes = projectSpecToNotes(baseSpec({
      assignments: [{ player: "F", action: { kind: "block", target: "edge" } }],
    }));
    expect(notes).toMatch(/@F:.*edge/);
  });

  it("narrates ballcarrier with run type", () => {
    const notes = projectSpecToNotes(baseSpec({
      assignments: [{ player: "B", action: { kind: "carry", runType: "inside_zone" } }],
    }));
    expect(notes).toMatch(/@B:.*inside zone/);
  });

  it("narrates motion to a player slot", () => {
    const notes = projectSpecToNotes(baseSpec({
      assignments: [{ player: "S", action: { kind: "motion", into: "Z" } }],
    }));
    expect(notes).toMatch(/@S:.*motion.*@Z/);
  });

  it("narrates custom actions verbatim from description", () => {
    const notes = projectSpecToNotes(baseSpec({
      assignments: [{
        player: "Y",
        action: { kind: "custom", description: "leak out late as a 6th protector" },
      }],
    }));
    expect(notes).toMatch(/@Y: leak out late/);
  });

  it("OMITS unspecified-action players (no fabricated bullet)", () => {
    const notes = projectSpecToNotes(baseSpec({
      assignments: [
        { player: "X", action: { kind: "route", family: "Slant" } },
        { player: "F", action: { kind: "unspecified" } },
      ],
    }));
    expect(notes).toMatch(/@X:/);
    expect(notes).not.toMatch(/@F:/);
  });
});

describe("projectSpecToNotes — confidence hedging", () => {
  it("prefixes (unconfirmed) on low-confidence assignments", () => {
    const notes = projectSpecToNotes(baseSpec({
      assignments: [
        { player: "X", action: { kind: "route", family: "Slant" }, confidence: "low" },
      ],
    }));
    expect(notes).toMatch(/- \(unconfirmed\) @X:/);
  });

  it("does NOT prefix (unconfirmed) on high-confidence assignments", () => {
    const notes = projectSpecToNotes(baseSpec({
      assignments: [
        { player: "X", action: { kind: "route", family: "Slant" }, confidence: "high" },
      ],
    }));
    expect(notes).not.toMatch(/\(unconfirmed\)/);
  });

  it("treats absent confidence as high (default)", () => {
    const notes = projectSpecToNotes(baseSpec({
      assignments: [
        { player: "X", action: { kind: "route", family: "Slant" } }, // no confidence field
      ],
    }));
    expect(notes).not.toMatch(/\(unconfirmed\)/);
  });

  it("hedges only the low-confidence bullet in a mixed-confidence spec", () => {
    const notes = projectSpecToNotes(baseSpec({
      assignments: [
        { player: "X", action: { kind: "route", family: "Slant" }, confidence: "high" },
        { player: "Z", action: { kind: "route", family: "Post" }, confidence: "low" },
      ],
    }));
    const xLine = notes.split("\n").find((l) => l.startsWith("- ") && l.includes("@X"));
    const zLine = notes.split("\n").find((l) => l.startsWith("- ") && l.includes("@Z"));
    expect(xLine).not.toMatch(/\(unconfirmed\)/);
    expect(zLine).toMatch(/\(unconfirmed\)/);
  });
});

describe("projectSpecToNotes — determinism", () => {
  it("produces identical output for the same spec across calls", () => {
    const spec = baseSpec({
      assignments: [
        { player: "X", action: { kind: "route", family: "Slant" } },
        { player: "Z", action: { kind: "route", family: "Post" } },
      ],
    });
    const a = projectSpecToNotes(spec);
    const b = projectSpecToNotes(spec);
    expect(a).toBe(b);
  });

  it("falls back to a summary line when no assignments emit content", () => {
    const notes = projectSpecToNotes(baseSpec({
      // empty + defensive opener also empty (no playType=offense) → summary
      playType: "special_teams",
      assignments: [],
    }));
    expect(notes.length).toBeGreaterThan(0);
    expect(notes).toMatch(/Spread Doubles/);
  });
});
