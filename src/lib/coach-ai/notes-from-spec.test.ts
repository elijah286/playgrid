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
  it("opens with a when-to-use line for offense, then the @Q-reads opener", () => {
    // Coaches scanning the play card / playsheet need "WHEN do I call
    // this?" in the first sentence. Surfaced 2026-05-04: prior projector
    // jumped straight to "@Q reads ..." (mechanics, not situation). Now
    // line 1 is "**Use when:** ..." (or the concept name+description if
    // a concept matched), and the @Q read line follows.
    const notes = projectSpecToNotes(baseSpec({
      assignments: [{ player: "X", action: { kind: "route", family: "Slant" } }],
    }));
    const lines = notes.split("\n");
    expect(lines[0]).toMatch(/^\*\*Use when:\*\*/);
    expect(lines[1]).toMatch(/^@Q reads/);
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

  it("uses defense-style opener for defensive plays, after the when-to-call line", () => {
    const notes = projectSpecToNotes(baseSpec({
      playType: "defense",
      defense: { front: "7v7 Zone", coverage: "Cover 3" },
    }));
    // Line 1 is the situational when-to-call cue; line 2 is the
    // primary-key opener ("Run **<defense>** — defenders read..."). Same
    // first-3-sentences density as offense, with situation up top.
    const lines = notes.split("\n");
    expect(lines[0]).toMatch(/^\*\*Use when:\*\*/);
    expect(lines[1]).toMatch(/^Run \*\*[^*]+\*\* — defenders read pre-snap formation/);
  });

  it("derives a feature-based when-to-use line for non-concept plays", () => {
    // Quick-game profile (all routes ≤ 6yd) → "Quick-game answer ...".
    const quick = projectSpecToNotes(baseSpec({
      assignments: [
        { player: "X", action: { kind: "route", family: "Slant" } },
        { player: "Z", action: { kind: "route", family: "Hitch" } },
      ],
    }));
    expect(quick).toMatch(/Quick-game answer/);

    // Shot-play profile (any route ≥ 14yd) → "Shot play ...".
    const shot = projectSpecToNotes(baseSpec({
      assignments: [
        { player: "X", action: { kind: "route", family: "Go", depthYds: 18 } },
        { player: "Z", action: { kind: "route", family: "Slant" } },
      ],
    }));
    expect(shot).toMatch(/Shot play/);

    // Ground call (carry only) → "Ground call ...".
    const run = projectSpecToNotes(baseSpec({
      assignments: [{ player: "B", action: { kind: "carry", runType: "inside_zone" } }],
    }));
    expect(run).toMatch(/Ground call/);
  });

  it("uses the concept description as the when-to-use lead when a concept is detected", () => {
    // Concept descriptions already encode the situational stress (what
    // coverage they beat, the high-low/triangle structure). When matched,
    // the lead is "**ConceptName** — description" instead of the generic
    // "**Use when:** ..." fallback.
    const notes = projectSpecToNotes(baseSpec({
      assignments: [
        { player: "X", action: { kind: "route", family: "Curl", depthYds: 5 } },
        { player: "H", action: { kind: "route", family: "Flat", depthYds: 2 } },
      ],
    }));
    const lines = notes.split("\n");
    expect(lines[0]).toMatch(/^\*\*Curl-Flat\*\* —/);
    // No duplicate "Use when:" line when concept is the lead.
    expect(notes).not.toMatch(/\*\*Use when:\*\*/);
  });

  it("does not narrate defense plays from the offense's perspective", () => {
    // Surfaced 2026-05-03: Cal saved a Tampa 2 defense play with notes
    // like "@Q reads Tampa 2; hit @H on the bend at 9 yards…" — the
    // notes were written as if the play was an offense-attack call. The
    // projection must NEVER emit @Q-read prose on a defense play.
    const notes = projectSpecToNotes(baseSpec({
      playType: "defense",
      defense: { front: "7v7 Zone", coverage: "Cover 3" },
      assignments: [
        // Even if Cal accidentally drops offense assignments on a
        // defense spec, the projection suppresses them.
        { player: "X", action: { kind: "route", family: "Slant" } },
      ],
    }));
    expect(notes).not.toMatch(/@Q reads/);
    expect(notes).not.toMatch(/@X:/); // offense assignment bullet suppressed
    expect(notes).not.toMatch(/the throw/i);
    expect(notes).not.toMatch(/exploits/i);
  });

  it("emits an Assignments header on defense plays (not Defense:)", () => {
    // On a defense play the defenders ARE the play, so the per-defender
    // bullets sit under "Assignments:" not "Defense:". The latter reads
    // as "the opposing defense" which is offensive POV.
    const notes = projectSpecToNotes(baseSpec({
      playType: "defense",
      defense: { front: "7v7 Zone", coverage: "Cover 3" },
    }));
    expect(notes).not.toMatch(/\*\*Defense:\*\*/);
    if (notes.includes("- @")) {
      // Only check the header if defender bullets actually rendered
      // (depends on the catalog having an alignment for this combo).
      expect(notes).toMatch(/\*\*Assignments:\*\*/);
    }
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

describe("projectSpecToNotes — defender bullets (Phase D6)", () => {
  it("emits per-defender bullets when defense is set", async () => {
    const { PLAY_SPEC_SCHEMA_VERSION } = await import("@/domain/play/spec");
    const { projectSpecToNotes } = await import("./notes-from-spec");
    const spec = {
      schemaVersion: PLAY_SPEC_SCHEMA_VERSION,
      variant: "flag_7v7" as const,
      formation: { name: "Spread Doubles" },
      defense: { front: "7v7 Zone" as const, coverage: "Cover 3" as const },
      assignments: [
        { player: "X", action: { kind: "route" as const, family: "Slant" } },
      ],
    };
    const notes = projectSpecToNotes(spec);
    expect(notes).toContain("**Defense:**");
    // Cover 3 has 3 deep defenders + 4 underneath = 7 defender bullets.
    const defLines = notes.split("\n").filter((l) => l.match(/^- @(CB|FS|FL|FR|HL|HR)/));
    expect(defLines.length, defLines.join(" | ")).toBeGreaterThanOrEqual(6);
  });

  it("describes Cover 1 FS as a deep-middle zone defender (the screenshot bug regression)", async () => {
    const { PLAY_SPEC_SCHEMA_VERSION } = await import("@/domain/play/spec");
    const { projectSpecToNotes } = await import("./notes-from-spec");
    const spec = {
      schemaVersion: PLAY_SPEC_SCHEMA_VERSION,
      variant: "flag_7v7" as const,
      formation: { name: "Spread Doubles" },
      defense: { front: "7v7 Man" as const, coverage: "Cover 1" as const },
      assignments: [
        { player: "X", action: { kind: "route" as const, family: "Slant" } },
      ],
    };
    const notes = projectSpecToNotes(spec);
    const fsLine = notes.split("\n").find((l) => l.startsWith("- @FS"));
    expect(fsLine, "FS line missing in Cover 1 notes").toBeDefined();
    expect(fsLine).toMatch(/drops into.*[Dd]eep middle/);
  });

  it("describes Cover 1 corners as man defenders, not zones", async () => {
    const { PLAY_SPEC_SCHEMA_VERSION } = await import("@/domain/play/spec");
    const { projectSpecToNotes } = await import("./notes-from-spec");
    const spec = {
      schemaVersion: PLAY_SPEC_SCHEMA_VERSION,
      variant: "flag_7v7" as const,
      formation: { name: "Spread Doubles" },
      defense: { front: "7v7 Man" as const, coverage: "Cover 1" as const },
      assignments: [
        { player: "X", action: { kind: "route" as const, family: "Slant" } },
      ],
    };
    const notes = projectSpecToNotes(spec);
    const cbLine = notes.split("\n").find((l) => l.startsWith("- @CB"));
    expect(cbLine, "CB line missing").toBeDefined();
    expect(cbLine).toMatch(/man on/);
  });

  it("override deviation surfaces in the bullet (ML zone → blitz)", async () => {
    const { PLAY_SPEC_SCHEMA_VERSION } = await import("@/domain/play/spec");
    const { projectSpecToNotes } = await import("./notes-from-spec");
    const spec = {
      schemaVersion: PLAY_SPEC_SCHEMA_VERSION,
      variant: "tackle_11" as const,
      formation: { name: "Spread Doubles" },
      defense: { front: "4-3 Over" as const, coverage: "Cover 3" as const },
      assignments: [
        { player: "X", action: { kind: "route" as const, family: "Slant" } },
      ],
      defenderAssignments: [
        { defender: "ML", action: { kind: "blitz" as const, gap: "A" as const } },
      ],
    };
    const notes = projectSpecToNotes(spec);
    const mlLine = notes.split("\n").find((l) => l.startsWith("- @ML"));
    expect(mlLine).toBeDefined();
    expect(mlLine).toMatch(/blitz.*A/);
  });

  it("(unconfirmed) hedge surfaces for low-confidence defender overrides", async () => {
    const { PLAY_SPEC_SCHEMA_VERSION } = await import("@/domain/play/spec");
    const { projectSpecToNotes } = await import("./notes-from-spec");
    const spec = {
      schemaVersion: PLAY_SPEC_SCHEMA_VERSION,
      variant: "flag_7v7" as const,
      formation: { name: "Spread Doubles" },
      defense: { front: "7v7 Zone" as const, coverage: "Cover 3" as const },
      assignments: [],
      defenderAssignments: [
        { defender: "FS", action: { kind: "blitz" as const, gap: "A" as const }, confidence: "low" as const },
      ],
    };
    const notes = projectSpecToNotes(spec);
    const fsLine = notes.split("\n").find((l) => l.includes("@FS"));
    expect(fsLine).toMatch(/\(unconfirmed\)/);
  });
});
