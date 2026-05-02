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
import { lintNotesAgainstSpec, lintProseAgainstSpec } from "./notes-lint";
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
