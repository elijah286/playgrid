/**
 * Goldens for lintNotesAgainstSpec — the notes ↔ spec consistency check.
 *
 * The lint is intentionally conservative:
 *   - PASS: notes paraphrase tactically without naming a family
 *   - PASS: notes name the SAME family as the spec
 *   - FAIL: notes name a DIFFERENT catalog family for that player
 *
 * False positives here would force Cal to use the exact catalog word in
 * every bullet, producing robotic prose. The structural goal is the
 * floor — words must not actively contradict the play — not the
 * ceiling.
 */

import { describe, expect, it } from "vitest";
import {
  lintNotesAgainstSpec,
  lintProseAgainstSpec,
  lintProseDepthAgainstSpec,
  lintNotesSideAwareness,
} from "./notes-lint";
import { projectSpecToNotes } from "./notes-from-spec";
import { generateConceptSkeleton } from "@/domain/play/conceptSkeleton";
import { PLAY_SPEC_SCHEMA_VERSION, type PlaySpec } from "@/domain/play/spec";

function specWithRoutes(routes: Record<string, string>): PlaySpec {
  return {
    schemaVersion: PLAY_SPEC_SCHEMA_VERSION,
    variant: "flag_7v7",
    title: "Test",
    playType: "offense",
    formation: { name: "Spread Doubles" },
    assignments: Object.entries(routes).map(([player, family]) => ({
      player,
      action: { kind: "route", family },
    })),
  };
}

describe("lintNotesAgainstSpec — passing cases", () => {
  it("passes when notes name the same family as the spec", () => {
    const result = lintNotesAgainstSpec(
      `@Q reads the safety: hit @X on the slant.
- @X: 5-yard slant inside, sharp break.`,
      specWithRoutes({ X: "Slant" }),
    );
    expect(result.ok).toBe(true);
  });

  it("passes when notes paraphrase tactically without naming a family", () => {
    const result = lintNotesAgainstSpec(
      `- @X: 5-yard inside cut, plant hard at the inside hip.`,
      specWithRoutes({ X: "Slant" }),
    );
    expect(result.ok).toBe(true);
  });

  it("passes when notes use a recognized alias of the assigned family", () => {
    // "Fly" is an alias of "Go" in the catalog.
    const result = lintNotesAgainstSpec(
      `- @X: take the fly route, ball over the top.`,
      specWithRoutes({ X: "Go" }),
    );
    expect(result.ok).toBe(true);
  });

  it("passes when the player isn't a route assignment in the spec", () => {
    // Spec assigns LT a block, not a route. Notes can describe LT freely.
    const result = lintNotesAgainstSpec(
      `- @LT: pull and lead through the hole.`,
      {
        schemaVersion: PLAY_SPEC_SCHEMA_VERSION,
        variant: "flag_7v7",
        title: "T",
        playType: "offense",
        formation: { name: "Spread" },
        assignments: [{ player: "LT", action: { kind: "block" } }],
      },
    );
    expect(result.ok).toBe(true);
  });

  it("does not false-positive on substring matches in unrelated words", () => {
    // "post" appears in "posture" and "support" — must NOT trigger when
    // those are the only matches.
    const result = lintNotesAgainstSpec(
      `- @X: maintain inside posture and support the slant route.`,
      specWithRoutes({ X: "Slant" }),
    );
    expect(result.ok).toBe(true);
  });

  it("ignores opener lines that don't follow @Label: shape", () => {
    // The opener mentions multiple players — not a per-player bullet.
    const result = lintNotesAgainstSpec(
      `@Q reads the high safety: post over the top, slant underneath.
- @X: 5-yard slant inside.
- @Z: 12-yard post.`,
      specWithRoutes({ X: "Slant", Z: "Post" }),
    );
    expect(result.ok).toBe(true);
  });

  it("passes empty notes", () => {
    const result = lintNotesAgainstSpec("", specWithRoutes({ X: "Slant" }));
    expect(result.ok).toBe(true);
  });

  it("passes when spec has no route assignments", () => {
    const result = lintNotesAgainstSpec(
      `- @LT: pass protect.`,
      {
        schemaVersion: PLAY_SPEC_SCHEMA_VERSION,
        variant: "flag_7v7",
        title: "T",
        playType: "offense",
        formation: { name: "Spread" },
        assignments: [{ player: "LT", action: { kind: "block" } }],
      },
    );
    expect(result.ok).toBe(true);
  });
});

describe("lintNotesAgainstSpec — failing cases (active contradictions)", () => {
  it("flags @X bullet saying 'post' when spec says Slant", () => {
    const result = lintNotesAgainstSpec(
      `- @X: 12-yard post route, break inside at the goalpost.`,
      specWithRoutes({ X: "Slant" }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].player).toBe("X");
    expect(result.issues[0].expectedFamily).toBe("Slant");
    expect(result.issues[0].notesFamily).toBe("Post");
  });

  it("flags @Z bullet saying 'corner' when spec says Post", () => {
    const result = lintNotesAgainstSpec(
      `- @Z: corner route to the back pylon.`,
      specWithRoutes({ Z: "Post" }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0].notesFamily).toBe("Corner");
    expect(result.issues[0].expectedFamily).toBe("Post");
  });

  it("flags multi-word family contradictions (skinny post vs slant)", () => {
    const result = lintNotesAgainstSpec(
      `- @X: skinny post inside the safety.`,
      specWithRoutes({ X: "Slant" }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0].notesFamily).toBe("Skinny Post");
  });

  it("flags only the bad bullet in a mixed notes block", () => {
    const result = lintNotesAgainstSpec(
      `@Q reads coverage and progresses through receivers.
- @X: 5-yard slant inside.
- @Z: corner route to the pylon.
- @H: hitch at 5 yards.`,
      specWithRoutes({ X: "Slant", Z: "Post", H: "Hitch" }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].player).toBe("Z");
  });

  it("flags alias contradictions (notes say 'fly', spec says Slant)", () => {
    const result = lintNotesAgainstSpec(
      `- @X: fly route deep down the sideline.`,
      specWithRoutes({ X: "Slant" }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    // "fly" is an alias of "Go" — should resolve to canonical name.
    expect(result.issues[0].notesFamily).toBe("Go");
  });
});

describe("lintNotesAgainstSpec — case insensitivity", () => {
  it("handles uppercase player labels in spec but lowercase in notes", () => {
    const result = lintNotesAgainstSpec(
      `- @x: 5-yard slant inside.`,
      specWithRoutes({ X: "Slant" }),
    );
    expect(result.ok).toBe(true);
  });

  it("handles uppercase route name in notes", () => {
    const result = lintNotesAgainstSpec(
      `- @X: 5-yard SLANT inside.`,
      specWithRoutes({ X: "Slant" }),
    );
    expect(result.ok).toBe(true);
  });
});

describe("lintProseAgainstSpec — chat-style prose (no bullets)", () => {
  // The chat-time variant of the lint. Catches contradictions in the
  // free-form prose Cal writes around a play diagram, where the
  // bullet-based notes lint can't help (no `- @X:` formatting).

  it("PASSES when prose mentions same family as spec", () => {
    const result = lintProseAgainstSpec(
      `Hit @X on the slant for the quick 5-yard pickup.`,
      specWithRoutes({ X: "Slant" }),
    );
    expect(result.ok).toBe(true);
  });

  it("PASSES when prose paraphrases without naming a family", () => {
    const result = lintProseAgainstSpec(
      `@X breaks inside at the inside hip — quick rhythm throw.`,
      specWithRoutes({ X: "Slant" }),
    );
    expect(result.ok).toBe(true);
  });

  it("FAILS when prose names a different family ('@X on the post' when X is on Slant)", () => {
    const result = lintProseAgainstSpec(
      `Hit @X on the post for the over-the-top throw.`,
      specWithRoutes({ X: "Slant" }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0].player).toBe("X");
    expect(result.issues[0].expectedFamily).toBe("Slant");
    expect(result.issues[0].notesFamily).toBe("Post");
  });

  it("FAILS when prose names a different family in a chat narrative", () => {
    // Production-style chat prose pattern (2026-05-02). Prose
    // describes @H as on a "shallow cross" but the spec assigns Go.
    // "Shallow Cross" is a registered alias of Drag, so the
    // contradiction surfaces (Drag ≠ Go).
    const result = lintProseAgainstSpec(
      `@H runs the shallow cross underneath as a middle-field outlet.`,
      specWithRoutes({ H: "Go" }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0].player).toBe("H");
    expect(result.issues[0].expectedFamily).toBe("Go");
    expect(result.issues[0].notesFamily).toBe("Drag");
  });

  it("handles multiple players in one sentence (each checked independently)", () => {
    const result = lintProseAgainstSpec(
      `If FS bites, hit @X on the post or @Z on the go.`,
      specWithRoutes({ X: "Post", Z: "Go" }),
    );
    expect(result.ok).toBe(true);
  });

  it("flags only the contradicting player when one is right and one is wrong", () => {
    const result = lintProseAgainstSpec(
      `If FS bites, hit @X on the slant or @Z on the go.`,
      specWithRoutes({ X: "Post", Z: "Go" }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].player).toBe("X");
  });

  it("dedupes when the same contradiction appears in multiple sentences", () => {
    const result = lintProseAgainstSpec(
      `Hit @X on the post for the deep shot. The post route from @X beats single-high.`,
      specWithRoutes({ X: "Slant" }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toHaveLength(1);
  });

  it("ignores @QB / @Q references (no route assignment)", () => {
    const result = lintProseAgainstSpec(
      `@QB reads the high safety: post over the top, slant underneath.`,
      specWithRoutes({ X: "Post" }),
    );
    expect(result.ok).toBe(true);
  });

  it("handles multi-paragraph prose", () => {
    const result = lintProseAgainstSpec(
      `Spread Doubles vs Cover 3 — beats the deep third.

@QB reads the FS: if middle, hit @X on the post.

Cover 3 splits the field into thirds. The post beats this.`,
      specWithRoutes({ X: "Post" }),
    );
    expect(result.ok).toBe(true);
  });

  it("returns ok when spec has no route assignments", () => {
    const result = lintProseAgainstSpec(
      `Pull and lead through the hole.`,
      specWithRoutes({}),
    );
    expect(result.ok).toBe(true);
  });
});

describe("lintProseDepthAgainstSpec — clause-level scoping (the screenshot regression)", () => {
  // Coach surfaced 2026-05-02 (Mesh play): Cal's prose said
  //   "@H runs the under-drag at 2 yards, @S runs the over-drag at
  //    2 yards as well (both shallow crossers), with @X settling at
  //    5 yards"
  // while the spec had H@2, S@6, X@8. The previous "any-depth-in-
  // sentence-passes" heuristic missed @S because "5 yards" (intended
  // for @X) was within tolerance of @S's expected 6yd. The fix:
  // split each sentence into clauses on commas/dashes/parens, so each
  // @-ref is bound to depths in its own clause.

  it("catches @S confabulation when an unrelated @X depth is in the same sentence", () => {
    const skel = generateConceptSkeleton("Mesh", { variant: "tackle_11" });
    if (!skel.ok) throw new Error("skeleton failed");
    const prose =
      "@H runs the under-drag at 2 yards, @S runs the over-drag at 2 yards as well " +
      "(both shallow crossers), with @X settling in the hole between safeties at 5 " +
      "yards for the intermediate void.";
    const result = lintProseDepthAgainstSpec(prose, skel.spec);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const sIssue = result.issues.find((i) => i.player === "S");
    expect(sIssue).toBeDefined();
    expect(sIssue?.proseDepthYds).toBe(2);
    // Mesh skeleton over-drag is 8yd (bumped from 6yd 2026-05-02 for
    // visual separation). The lint catches @S claim of "2 yards" vs
    // spec @ 8yd.
    expect(sIssue?.expectedDepthYds).toBe(8);
  });

  it("does NOT split intra-word hyphens (under-drag stays one clause)", () => {
    const skel = generateConceptSkeleton("Mesh", { variant: "tackle_11" });
    if (!skel.ok) throw new Error("skeleton failed");
    // Correct prose — H at 2yd matches spec; should pass.
    const result = lintProseDepthAgainstSpec(
      "@H runs the under-drag at 2 yards as the shallow cross.",
      skel.spec,
    );
    expect(result.ok).toBe(true);
  });

  it("preserves the existing 'any-depth-in-clause-passes' rule within a clause", () => {
    // Coaches sometimes mention multiple depths in one clause — e.g.
    // "@X runs a 12-yard dig settling at 10 yards". As long as ONE of
    // the depths matches expected (10 ≈ 10), the lint passes.
    const result = lintProseDepthAgainstSpec(
      "@X runs a 12-yard dig settling at 10 yards.",
      {
        schemaVersion: 4 as never,
        variant: "tackle_11" as const,
        title: "T",
        playType: "offense" as const,
        formation: { name: "Spread Doubles" },
        assignments: [
          { player: "X", action: { kind: "route", family: "Dig", depthYds: 10 } },
        ],
      },
    );
    expect(result.ok).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────
//  lintNotesSideAwareness
// ─────────────────────────────────────────────────────────────────────

function defenseSpec(overrides: Partial<PlaySpec> = {}): PlaySpec {
  return {
    schemaVersion: PLAY_SPEC_SCHEMA_VERSION,
    variant: "flag_7v7",
    title: "Tampa 2",
    playType: "defense",
    formation: { name: "Spread Doubles" },
    defense: { front: "7v7 Zone", coverage: "Cover 2" },
    assignments: [],
    ...overrides,
  };
}

function offenseSpec(overrides: Partial<PlaySpec> = {}): PlaySpec {
  return {
    schemaVersion: PLAY_SPEC_SCHEMA_VERSION,
    variant: "flag_7v7",
    title: "Spread Slant",
    playType: "offense",
    formation: { name: "Spread Doubles" },
    assignments: [{ player: "X", action: { kind: "route", family: "Slant" } }],
    ...overrides,
  };
}

describe("lintNotesSideAwareness — defense plays reject offense POV", () => {
  it("rejects '@Q reads' on a defense play", () => {
    const result = lintNotesSideAwareness(
      "@Q reads Tampa 2: hit @H on the bend if the hook squats.",
      defenseSpec(),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0].expectedSide).toBe("defense");
    expect(result.issues[0].match).toMatch(/@Q\s+reads/i);
  });

  it("rejects 'QB's primary read' framing on a defense play", () => {
    const result = lintNotesSideAwareness(
      "**Tampa 2 exploits:** the QB's primary read is the bend at 9 yards.",
      defenseSpec(),
    );
    expect(result.ok).toBe(false);
  });

  it("rejects 'hit @H' / 'throw to @X' offense throw verbs on a defense play", () => {
    const r1 = lintNotesSideAwareness(
      "Hit @H on the bend, then throw to @X on the drag.",
      defenseSpec(),
    );
    expect(r1.ok).toBe(false);
  });

  it("rejects 'exploits Tampa 2' attack-the-defense framing", () => {
    const result = lintNotesSideAwareness(
      "**Why it works:** the Bender exploits Tampa 2's vulnerable intermediate gap.",
      defenseSpec(),
    );
    expect(result.ok).toBe(false);
  });

  it("rejects 'soft spot' / 'void between' offensive-target framing", () => {
    const result = lintNotesSideAwareness(
      "Sit in the soft spot between the hooks and safeties.",
      defenseSpec(),
    );
    expect(result.ok).toBe(false);
  });

  it("rejects the canonical 2026-05-03 Tampa 2 regression case verbatim", () => {
    // Real notes Cal saved on a Tampa 2 defense play (per coach screenshot).
    const notes = [
      "**Tampa 2 exploits:** Call when facing Cover 2 single-high looks that rotate to Tampa 2. @H's bend at 9 yards sits in the SOFT GRASS between the 5-yard hooks and 12-yard safeties — the biggest vulnerability in Tampa 2.",
      "",
      "**@Q's primary read:** @H on the bend. If the Hook LB (HL or HR on H's side) commits to the flat, the bend is wide open. If the hook stays home, check @B on the flat (3 yards) — the hook can't cover both.",
      "",
      "**Why it works:** Tampa 2's middle linebacker plays 6 yards deep (deeper than most hooks) to carry seam routes, but this creates a vulnerable intermediate gap at 8-10 yards. The Bender exploits exactly that void. Force the Mike LB to choose: cover the bend or protect the seam.",
    ].join("\n");
    const result = lintNotesSideAwareness(notes, defenseSpec());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    // Multiple distinct violations should surface — confirms the lint
    // is catching structural pattern matches, not a one-off keyword.
    expect(result.issues.length).toBeGreaterThanOrEqual(2);
  });

  it("passes legitimate defense-perspective notes", () => {
    const notes = [
      "Run **Tampa 2** — best on 3rd-and-long vs trips. Defenders read pre-snap formation and motion before the snap.",
      "",
      "**Assignments:**",
      "- @M: drops into deep middle — open the hips, carry any vertical seam.",
      "- @HL: drops into hook — eyes on #2, wall off any crosser.",
      "- @CB1: drops into flat — squeeze the #1 vertical, sink under any out-cut.",
    ].join("\n");
    const result = lintNotesSideAwareness(notes, defenseSpec());
    expect(result.ok).toBe(true);
  });

  it("passes the deterministic projectSpecToNotes output for a defense play", () => {
    // Round-trip safety check — whatever projectSpecToNotes emits for
    // a defense play must pass the side-awareness lint by construction,
    // otherwise the from_spec=true path would fail its own gate.
    const spec = defenseSpec();
    const projected = projectSpecToNotes(spec);
    const result = lintNotesSideAwareness(projected, spec);
    expect(result.ok).toBe(true);
  });
});

describe("lintNotesSideAwareness — offense plays pass offense POV", () => {
  it("passes the canonical offense opener", () => {
    const result = lintNotesSideAwareness(
      "@Q reads the safety: hit @X on the slant inside if the corner stays outside.",
      offenseSpec(),
    );
    expect(result.ok).toBe(true);
  });

  it("passes 'throw to @X' on an offense play", () => {
    const result = lintNotesSideAwareness(
      "Hit @X on the slant; if covered, throw to @H on the flat.",
      offenseSpec(),
    );
    expect(result.ok).toBe(true);
  });

  it("passes 'exploits Cover 3' framing on an offense play (it's offense attacking defense — that's correct)", () => {
    const result = lintNotesSideAwareness(
      "Why it works: the slant-flat combo exploits Cover 3's hard corners.",
      offenseSpec(),
    );
    expect(result.ok).toBe(true);
  });

  it("rejects defense-action lead on an offense play", () => {
    const result = lintNotesSideAwareness(
      "Run **Cover 3** — defenders read pre-snap formation. Defenders drop into hooks.",
      offenseSpec(),
    );
    expect(result.ok).toBe(false);
  });
});

describe("lintNotesSideAwareness — edge cases", () => {
  it("passes empty notes", () => {
    const result = lintNotesSideAwareness("", defenseSpec());
    expect(result.ok).toBe(true);
  });

  it("passes when playType is unset (defaults to offense)", () => {
    const result = lintNotesSideAwareness(
      "@Q reads the safety: hit @X on the slant.",
      { ...offenseSpec(), playType: undefined },
    );
    expect(result.ok).toBe(true);
  });

  it("passes special_teams plays (no enforcement yet)", () => {
    const result = lintNotesSideAwareness(
      "@Q reads the rush: hit @X on the swing.",
      { ...offenseSpec(), playType: "special_teams" },
    );
    expect(result.ok).toBe(true);
  });
});
