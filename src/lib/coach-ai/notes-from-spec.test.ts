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
  it("covers every route assignment in the notes (progression OR bullet)", () => {
    // 2026-05-26 — multi-route specs now emit a numbered Progression
    // block instead of per-assignment bullets (the two used to
    // duplicate). The invariant the test pins is still the same:
    // every route is represented somewhere in the output.
    const notes = projectSpecToNotes(baseSpec({
      assignments: [
        { player: "X", action: { kind: "route", family: "Slant" } },
        { player: "Z", action: { kind: "route", family: "Post" } },
        { player: "H", action: { kind: "route", family: "Hitch" } },
      ],
    }));
    // Progression items look like "1. **@X 5-yd slant** — ...".
    // Bullets look like "- @X: ...". Either counts as coverage.
    const routeLines = notes
      .split("\n")
      .filter(
        (l) => /^\d+\.\s/.test(l) || l.startsWith("- "),
      );
    expect(routeLines.length).toBeGreaterThanOrEqual(3);
    for (const id of ["X", "Z", "H"]) {
      expect(notes).toMatch(new RegExp(`@${id}\\b`));
    }
  });

  it("references each player by @Label", () => {
    const notes = projectSpecToNotes(baseSpec({
      assignments: [
        { player: "X", action: { kind: "route", family: "Slant" } },
        { player: "Z", action: { kind: "route", family: "Post" } },
      ],
    }));
    // Multi-route specs now emit a Progression block — @X / @Z appear
    // in those numbered lines instead of the per-assignment bullets,
    // so match the word boundary rather than the legacy "@X:" form.
    expect(notes).toMatch(/@X\b/);
    expect(notes).toMatch(/@Z\b/);
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
    // @LT only exists in tackle_11's OL — use a tackle spec so the
    // assignment isn't filtered out as a ghost player.
    const notes = projectSpecToNotes(baseSpec({
      variant: "tackle_11",
      assignments: [{ player: "LT", action: { kind: "block" } }],
    }));
    expect(notes).toMatch(/@LT: pass protect/);
  });

  it("narrates targeted blocks", () => {
    // @S exists in flag_7v7 Spread Doubles; the original test used @F
    // (fullback) which doesn't render in this formation and got
    // filtered out by the 2026-05-26 ghost-player guard.
    const notes = projectSpecToNotes(baseSpec({
      assignments: [{ player: "S", action: { kind: "block", target: "edge" } }],
    }));
    expect(notes).toMatch(/@S:.*edge/);
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
    // @Y doesn't render in flag_7v7 Spread Doubles (roster uses @H
    // and @S for the slots). Switched to @S so the assignment
    // survives the 2026-05-26 ghost-player filter.
    const notes = projectSpecToNotes(baseSpec({
      assignments: [{
        player: "S",
        action: { kind: "custom", description: "leak out late as a 6th protector" },
      }],
    }));
    expect(notes).toMatch(/@S: leak out late/);
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

  it("hedges only the low-confidence read in a mixed-confidence spec", () => {
    // 2026-05-26: multi-route specs emit a Progression block (route
    // bullets are suppressed). Confidence now lives on the
    // progression line — low-confidence reads get an `(unconfirmed)`
    // prefix; high-confidence reads don't.
    const notes = projectSpecToNotes(baseSpec({
      assignments: [
        { player: "X", action: { kind: "route", family: "Slant" }, confidence: "high" },
        { player: "Z", action: { kind: "route", family: "Post" }, confidence: "low" },
      ],
    }));
    const xLine = notes
      .split("\n")
      .find((l) => /^\d+\.\s/.test(l) && l.includes("@X"));
    const zLine = notes
      .split("\n")
      .find((l) => /^\d+\.\s/.test(l) && l.includes("@Z"));
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

describe("projectSpecToNotes — ballPath narration (step 6)", () => {
  it("renders a 'Ball flow' section with one bullet per handoff step", () => {
    const spec = baseSpec({
      variant: "tackle_11",
      title: "Jet Reverse",
      formation: { name: "Trips Right" },
      assignments: [
        { player: "QB", action: { kind: "block" } },
        { player: "B",  action: { kind: "carry", waypoints: [[0, -4], [3, -3]] } },
        { player: "X",  action: { kind: "carry", waypoints: [[3, -3], [-14, 8]] } },
      ],
      ballPath: [
        { from: "QB", to: "B", atPoint: [0, -4] },
        { from: "B",  to: "X", atPoint: [3, -3] },
      ],
    });
    const notes = projectSpecToNotes(spec);
    expect(notes).toContain("**Ball flow:**");
    expect(notes).toContain("Snap: @QB hands to @B");
    expect(notes).toContain("Then: @B hands to @X");
  });

  it("uses football landmarks (yards behind LOS, side-of-center) instead of raw coordinates", () => {
    const spec = baseSpec({
      variant: "tackle_11",
      formation: { name: "Trips Right" },
      assignments: [],
      ballPath: [
        { from: "QB", to: "B", atPoint: [0, -4] },
        { from: "B",  to: "X", atPoint: [3, -3] },
      ],
    });
    const notes = projectSpecToNotes(spec);
    // Critical: no raw coord pairs appear in the notes.
    expect(notes).not.toMatch(/\(\s*-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?\s*\)/);
    expect(notes).not.toMatch(/\[\s*-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?\s*\]/);
    // And the landmark phrasing is present.
    expect(notes).toContain("behind the LOS");
  });

  it("falls back to 'in the backfield' when atPoint is omitted", () => {
    const spec = baseSpec({
      formation: { name: "Spread Doubles" },
      ballPath: [{ from: "QB", to: "B" }],
    });
    const notes = projectSpecToNotes(spec);
    expect(notes).toContain("in the backfield");
  });

  it("does NOT emit the Ball flow section when ballPath is missing or empty (most plays)", () => {
    const spec = baseSpec({
      assignments: [
        { player: "X", action: { kind: "route", family: "Slant" } },
      ],
    });
    const notes = projectSpecToNotes(spec);
    expect(notes).not.toContain("**Ball flow:**");
  });
});

describe("projectSpecToNotes — run-play OL narration (2026-05-25 regression)", () => {
  // Surfaced 2026-05-25 production: a Dive Right run play (Inside Zone)
  // showed all 5 OL bullets as "pass protect", which is the projector's
  // default for `kind: "block"` when `action.target` is unset. On a
  // RUN play, OL should be doing run blocks — the prose has to switch
  // perspective based on play type.
  //
  // The fix is a play-type context flag (`isRunPlay` = "any assignment
  // has kind:'carry'") plumbed from projectOffenseSpec → narrateBlock.
  // When isRunPlay is true, the default block phrasing switches to a
  // run-block description ("down block" / "drive block" / "seal the
  // playside gap") instead of "pass protect".
  //
  // This pairs with the parser fix (specParser.test.ts) that makes
  // `route_kind: "carry"` produce `kind: "carry"` instead of falling
  // through to the unrecognized-route custom action. Without the parser
  // fix, hasCarry stays false and this whole branch never fires;
  // without the projector fix, even a correct spec produces wrong OL
  // notes for run plays.

  it("OL on a RUN play do not say 'pass protect' (use a run-block phrasing)", () => {
    const spec = baseSpec({
      variant: "tackle_11",
      formation: { name: "I-Formation" },
      assignments: [
        { player: "LT", action: { kind: "block" } },
        { player: "LG", action: { kind: "block" } },
        { player: "C", action: { kind: "block" } },
        { player: "RG", action: { kind: "block" } },
        { player: "RT", action: { kind: "block" } },
        { player: "B", action: { kind: "carry", runType: "inside_zone" } },
      ],
    });
    const notes = projectSpecToNotes(spec);
    // Each OL bullet must NOT say "pass protect" — they're run-blocking.
    expect(notes).not.toMatch(/@LT: pass protect/);
    expect(notes).not.toMatch(/@LG: pass protect/);
    expect(notes).not.toMatch(/@C: pass protect/);
    expect(notes).not.toMatch(/@RG: pass protect/);
    expect(notes).not.toMatch(/@RT: pass protect/);
    // Must use a run-block phrasing — at least one of these terms.
    expect(notes).toMatch(/run[-\s]?block|down[-\s]?block|drive[-\s]?block|seal|combo|reach/i);
  });

  it("OL on a PASS play still say 'pass protect' (preserves the original behavior)", () => {
    const spec = baseSpec({
      variant: "tackle_11",
      formation: { name: "Empty" },
      assignments: [
        { player: "LT", action: { kind: "block" } },
        { player: "X", action: { kind: "route", family: "Slant" } },
      ],
    });
    const notes = projectSpecToNotes(spec);
    // No carry in the spec → still a pass-pro default for OL.
    expect(notes).toMatch(/@LT: pass protect/);
  });

  it("the run-play opener fires when any assignment has kind:'carry'", () => {
    // Pairs with whenToUseForOffense — hasCarry=true should produce a
    // run-flavored "Use when" line, not the pass-play fallback ("Best
    // on early downs to attack the called coverage with a balanced
    // progression"). The user's screenshot shows that exact fallback —
    // proof that hasCarry was falsely computing to false because the
    // spec had `kind: "custom"` carriers (parser bug, see specParser
    // tests), or because some other code path is bypassing the spec.
    // This test pins the projector's behavior given a CORRECT spec.
    const spec = baseSpec({
      variant: "tackle_11",
      formation: { name: "I-Formation" },
      assignments: [
        { player: "B", action: { kind: "carry", runType: "inside_zone" } },
      ],
    });
    const notes = projectSpecToNotes(spec);
    // The pass-play default opener phrase must NOT appear.
    expect(notes).not.toMatch(
      /Best on early downs to attack the called coverage with a balanced progression/,
    );
    // A run-flavored opener should appear.
    expect(notes).toMatch(/[Gg]round call|[Rr]un[-\s]?(pass|game)|[Ee]arly[-\s]?down call/);
  });
});

describe("projectSpecToNotes — QB progression block (Item 1, 2026-05-25)", () => {
  // The user's broader notes-quality requirement: pass plays need to
  // teach the QB's read in order, not just dump per-player bullets
  // sorted by spec.assignments order. The new **Progression:** block
  // walks the route assignments in standard read order:
  //   1. Deep clear (Go / Post / Seam / Corner ≥ 14yd) — pulls the
  //      deep safety so the rest of the concept opens up.
  //   2. Intermediate over the middle (Dig / In / Drive 10–14yd) —
  //      the high element of the high-low.
  //   3. Intermediate outside / hot (Curl / Hitch / Out / Slant
  //      4–13yd) — rhythm throws into the void left by the deep route.
  //   4. Checkdown (Flat / Drag / Bubble / Sit / Arrow) — outlet when
  //      pressure shows or no read is open.
  //
  // Concept-specific overrides land here too — Mesh's progression is
  // under-drag → over-drag → corner → checkdown regardless of generic
  // depth scoring. Catalog-known concepts cycle through their own
  // progression order; non-concept plays fall back to the generic
  // depth-based walker.

  it("emits a Progression block on multi-route pass plays", () => {
    const notes = projectSpecToNotes(baseSpec({
      variant: "flag_7v7",
      defense: { front: "7v7 Zone", coverage: "Cover 3" },
      assignments: [
        { player: "B", action: { kind: "route", family: "Flat" } },
        { player: "Z", action: { kind: "route", family: "Go", depthYds: 18 } },
        { player: "X", action: { kind: "route", family: "Dig", depthYds: 12 } },
        { player: "H", action: { kind: "route", family: "Curl", depthYds: 8 } },
      ],
    }));
    // The block header must appear so coaches can find the read order.
    expect(notes).toMatch(/\*\*Progression:\*\*|\*\*@Q progression/i);
  });

  it("orders the progression deep → intermediate → checkdown by route family", () => {
    // Random spec order, deterministic progression order.
    const notes = projectSpecToNotes(baseSpec({
      variant: "flag_7v7",
      assignments: [
        { player: "B", action: { kind: "route", family: "Flat" } },          // checkdown (last)
        { player: "H", action: { kind: "route", family: "Curl", depthYds: 8 } }, // intermediate
        { player: "Z", action: { kind: "route", family: "Go", depthYds: 18 } }, // deep (first)
        { player: "X", action: { kind: "route", family: "Dig", depthYds: 12 } }, // intermediate-over-middle
      ],
    }));

    // Find the indices of each player's mention in the progression block.
    // The progression appears as a numbered list; we assert the deep
    // route (@Z) shows up before the checkdown (@B) in the rendered
    // notes string.
    const zIdx = notes.indexOf("@Z");
    const bIdx = notes.indexOf("@B");
    expect(zIdx).toBeGreaterThan(-1);
    expect(bIdx).toBeGreaterThan(-1);
    expect(zIdx).toBeLessThan(bIdx);
  });

  it("does NOT emit a Progression block on single-route demos", () => {
    // Rule 9a (one-route demo) — no progression to teach.
    const notes = projectSpecToNotes(baseSpec({
      assignments: [
        { player: "X", action: { kind: "route", family: "Slant" } },
      ],
    }));
    expect(notes).not.toMatch(/\*\*Progression:\*\*/);
  });

  it("does NOT emit a Progression block on run-only plays", () => {
    const notes = projectSpecToNotes(baseSpec({
      variant: "tackle_11",
      formation: { name: "I-Formation" },
      assignments: [
        { player: "B", action: { kind: "carry", runType: "inside_zone" } },
      ],
    }));
    expect(notes).not.toMatch(/\*\*Progression:\*\*/);
  });

  it("honors an explicit spec.progression order over the depth heuristic", () => {
    // The coach set a custom read order on a wristband card. The deep Go
    // (@Z) would lead the depth-based walker, but the explicit
    // progression puts the Flat (@B) first — that order must win.
    const notes = projectSpecToNotes(baseSpec({
      variant: "flag_7v7",
      progression: ["B", "H", "Z"],
      assignments: [
        { player: "Z", action: { kind: "route", family: "Go", depthYds: 18 } },
        { player: "H", action: { kind: "route", family: "Curl", depthYds: 8 } },
        { player: "B", action: { kind: "route", family: "Flat" } },
      ],
    }));
    const bIdx = notes.indexOf("@B");
    const hIdx = notes.indexOf("@H");
    const zIdx = notes.indexOf("@Z");
    expect(bIdx).toBeGreaterThan(-1);
    expect(bIdx).toBeLessThan(hIdx);
    expect(hIdx).toBeLessThan(zIdx);
  });

  it("uses concept-specific order for Mesh (under-drag → over-drag → high → checkdown)", () => {
    // Mesh's read is structural, not depth-driven: under-drag (rub
    // setup) first, over-drag (the throwing window) second, deep clear
    // third, checkdown last. Without a concept-specific override the
    // generic walker would put the deep route first.
    const notes = projectSpecToNotes(baseSpec({
      variant: "flag_7v7",
      title: "Mesh",
      assignments: [
        { player: "H", action: { kind: "route", family: "Drag", depthYds: 5 } },  // under-drag (canonical)
        { player: "S", action: { kind: "route", family: "Drag", depthYds: 6 } },  // over-drag (1yd above)
        { player: "Z", action: { kind: "route", family: "Sit", depthYds: 12 } },  // high
        { player: "B", action: { kind: "route", family: "Flat" } },               // checkdown
      ],
    }));
    // The under-drag (H at 5yd) should appear before the over-drag
    // (S at 6yd) in the progression block — Mesh reads under-first.
    const hIdx = notes.indexOf("@H");
    const sIdx = notes.indexOf("@S");
    const bIdx = notes.indexOf("@B");
    expect(hIdx).toBeGreaterThan(-1);
    expect(sIdx).toBeGreaterThan(-1);
    expect(hIdx).toBeLessThan(sIdx);
    expect(sIdx).toBeLessThan(bIdx);
  });
});

describe("projectSpecToNotes — coverage-aware route cues (Item 2, 2026-05-25)", () => {
  // Per-route bullets need defensive-read context: a Slant vs Cover 1
  // teaches differently than a Slant vs Cover 3. The route-cue
  // dictionary now has coverage-specific overrides — when the spec has
  // `defense.coverage` set, the cue is picked from the coverage map
  // first, falling back to the generic flat cue when no coverage
  // override exists.
  //
  // Catalog is intentionally small at first — 6-8 high-value matchups
  // covering the routes coaches install most. Adding entries here is
  // safe (purely additive) and a follow-up PR can expand.

  it("Slant vs Cover 1 names the man-coverage teaching cue", () => {
    const notes = projectSpecToNotes(baseSpec({
      defense: { front: "7v7 Zone", coverage: "Cover 1" },
      assignments: [
        { player: "X", action: { kind: "route", family: "Slant" } },
      ],
    }));
    // Must mention something about the man-coverage technique — press,
    // leverage, rub, or trail-tech / inside-hip. The exact wording is
    // a tuning knob; the structural test is "the cue changed when
    // coverage changed."
    expect(notes).toMatch(/press|rub|trail|inside hip|leverage|man/i);
  });

  it("Slant vs Cover 3 names the zone-coverage teaching cue", () => {
    const notes = projectSpecToNotes(baseSpec({
      defense: { front: "7v7 Zone", coverage: "Cover 3" },
      assignments: [
        { player: "X", action: { kind: "route", family: "Slant" } },
      ],
    }));
    // Zone-specific cue → must reference the zone window OR the
    // curl/flat defender OR "sit" / "settle".
    expect(notes).toMatch(/sit|settle|window|curl[\/-]flat|zone|soft spot/i);
  });

  it("Hitch vs Cover 2 names the soft-spot teaching cue", () => {
    const notes = projectSpecToNotes(baseSpec({
      defense: { front: "7v7 Zone", coverage: "Cover 2" },
      assignments: [
        { player: "Z", action: { kind: "route", family: "Hitch" } },
      ],
    }));
    expect(notes).toMatch(/soft spot|sit|between|corner|flat defender/i);
  });

  it("Out vs Cover 3 names the sideline-leverage cue", () => {
    const notes = projectSpecToNotes(baseSpec({
      defense: { front: "7v7 Zone", coverage: "Cover 3" },
      assignments: [
        { player: "X", action: { kind: "route", family: "Out", depthYds: 10 } },
      ],
    }));
    expect(notes).toMatch(/sideline|beat the flat|leverage/i);
  });

  it("falls back to the generic cue when no defense is set", () => {
    // No coverage → flat cue applies. Pinning the regression direction
    // (the new lookup must not break the existing no-defense path).
    const notes = projectSpecToNotes(baseSpec({
      assignments: [
        { player: "X", action: { kind: "route", family: "Slant" } },
      ],
    }));
    expect(notes).toMatch(/@X:.*slant/i);
    // The flat / generic cue still ends the bullet — pinning the
    // regression direction.
    expect(notes).toMatch(/sharp break at the inside hip/);
  });

  it("falls back to the generic cue when the coverage isn't in the override map", () => {
    // A coverage label the override map doesn't list yet → fall back
    // to the generic family cue. Purely additive design — adding a
    // new override never silently breaks a play.
    const notes = projectSpecToNotes(baseSpec({
      defense: { front: "Quarters", coverage: "Quarters" },
      assignments: [
        { player: "X", action: { kind: "route", family: "Slant" } },
      ],
    }));
    expect(notes).toMatch(/@X:.*slant/i);
    expect(notes).toMatch(/sharp break|inside hip/);
  });
});

describe("projectSpecToNotes — defender shift narration (Item 4, 2026-05-25)", () => {
  // Defender bullets need to teach HOW defenders shift as the play
  // develops, not just describe their static role. Three enhancements:
  //
  //   1. Coverage-aware zone-drop cues — Cover 2 corner squats in the
  //      flat (the cloud); Cover 3 corner takes the deep third. Same
  //      "zone_drop" action, different teaching cue.
  //   2. read_and_react narration includes the trigger phase (on
  //      release / on break / at snap) so coaches see WHEN the
  //      defender reacts, not just THAT they react.
  //   3. Defenders with `custom_path` (drawn post-snap movement) get
  //      a movement-naming sentence that explains the rotation
  //      direction.

  it("Cover 2 corner zone-drop cue mentions the cloud / squat / flat", async () => {
    const { PLAY_SPEC_SCHEMA_VERSION } = await import("@/domain/play/spec");
    const { projectSpecToNotes } = await import("./notes-from-spec");
    const spec = {
      schemaVersion: PLAY_SPEC_SCHEMA_VERSION,
      variant: "flag_7v7" as const,
      formation: { name: "Spread Doubles" },
      defense: { front: "7v7 Zone" as const, coverage: "Cover 2" as const },
      assignments: [
        { player: "X", action: { kind: "route" as const, family: "Slant" } },
      ],
    };
    const notes = projectSpecToNotes(spec);
    const cbLine = notes.split("\n").find((l) => l.startsWith("- @CB") || l.match(/^- @\w*CB/));
    expect(cbLine, "CB line missing").toBeDefined();
    // Cover 2 CB squats in the cloud — must mention cloud, squat,
    // flat, or jam.
    expect(cbLine).toMatch(/cloud|squat|jam|flat|sink|reroute/i);
  });

  it("Cover 3 corner zone-drop cue mentions the deep third / over-the-top", async () => {
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
    const cbLine = notes.split("\n").find((l) => l.startsWith("- @CB") || l.match(/^- @\w*CB/));
    expect(cbLine, "CB line missing").toBeDefined();
    // Cover 3 CB takes the deep third — must mention deep third,
    // over the top, or back-pedal.
    expect(cbLine).toMatch(/deep third|over the top|back[-\s]?pedal|cushion/i);
  });

  it("read_and_react narration names the trigger phase (on release / break / snap)", async () => {
    const { PLAY_SPEC_SCHEMA_VERSION } = await import("@/domain/play/spec");
    const { projectSpecToNotes } = await import("./notes-from-spec");
    const spec = {
      schemaVersion: PLAY_SPEC_SCHEMA_VERSION,
      variant: "tackle_11" as const,
      formation: { name: "Spread Doubles" },
      defense: { front: "4-3 Over" as const, coverage: "Cover 3" as const },
      assignments: [],
      defenderAssignments: [
        {
          defender: "ML",
          action: {
            kind: "read_and_react" as const,
            trigger: { player: "S", on: "release" as const },
            behavior: "carry_vertical" as const,
          },
        },
      ],
    };
    const notes = projectSpecToNotes(spec);
    const mlLine = notes.split("\n").find((l) => l.includes("@ML"));
    expect(mlLine, "ML line missing").toBeDefined();
    // The narration should name the trigger phase — "on release" / "at
    // the snap" / "at the break" — so coaches see WHEN the defender
    // reads. Without the phase, the cue is just "react when @S
    // declares" which doesn't teach the timing.
    expect(mlLine).toMatch(/on release|on the release|@S.{0,40}release/i);
  });

  it("preserves the standard zone-drop cue when no coverage override exists", async () => {
    // Quarters / unknown coverage → still get the standard "stay in
    // the void, eyes on the QB" so the bullet isn't empty. Additive
    // design — adding a coverage entry never breaks any other coverage.
    const { PLAY_SPEC_SCHEMA_VERSION } = await import("@/domain/play/spec");
    const { projectSpecToNotes } = await import("./notes-from-spec");
    const spec = {
      schemaVersion: PLAY_SPEC_SCHEMA_VERSION,
      variant: "flag_7v7" as const,
      formation: { name: "Spread Doubles" },
      defense: { front: "7v7 Zone" as const, coverage: "Cover 6" as const },
      assignments: [],
    };
    const notes = projectSpecToNotes(spec);
    expect(notes).toMatch(/stay in the void|eyes on the QB|zone/i);
  });
});
