/**
 * Goldens for the offensive formation synthesizer.
 *
 * The contract this enforces:
 *   - Every recognized formation produces the variant's FULL offensive
 *     player count (tackle_11 → 11, flag_7v7 → 7, flag_5v5 → 5). A
 *     synthesizer that returns fewer players is a structural bug —
 *     plays saved from such output render misshapen thumbnails.
 *   - Player labels match canonical conventions (no duplicates, no
 *     stacked positions where they shouldn't stack).
 *
 * Regression case: Pro Set / Pro I / I-form previously returned 10
 * players for tackle_11 because placeReceivers treated the TE as one
 * of rec.right's slots, dropping Z. Coach Cal's first SFPA-saved
 * plays surfaced this as orange thumbnails in the playbook list.
 *
 * Adding a new formation? Add it to FORMATION_CASES and the count
 * assertion runs automatically via describe.each.
 */

import { describe, expect, it } from "vitest";
import { synthesizeOffense } from "./offensiveSynthesize";
import { sportProfileForVariant } from "./factory";

const FORMATION_CASES: Array<{
  variant: "tackle_11" | "flag_7v7" | "flag_6v6" | "flag_5v5";
  name: string;
  /** Exact player count expected (or omitted to use the variant's
   *  default offensive count from sportProfileForVariant). */
  expectedCount?: number;
  /** Player ids that MUST appear in the output. */
  mustHave?: string[];
}> = [
  // Pro Set family — historically broken (10 players) before the te+right fix.
  { variant: "tackle_11", name: "Pro Set", mustHave: ["X", "Y", "Z", "F", "B", "QB", "C"] },
  { variant: "tackle_11", name: "Pro I", mustHave: ["X", "Y", "Z", "F", "B", "QB", "C"] },
  { variant: "tackle_11", name: "I-Form", mustHave: ["X", "Y", "Z", "F", "B", "QB", "C"] },
  // Spread family — was always correct.
  { variant: "tackle_11", name: "Spread Doubles", mustHave: ["X", "Z", "QB", "C"] },
  // Trips Right uses 3 right-side WRs (Z + 2 slots), no TE — Y is
  // not required. The synthesizer picks H/S as the slot labels.
  { variant: "tackle_11", name: "Trips Right", mustHave: ["X", "Z", "QB", "C"] },
  { variant: "tackle_11", name: "Empty", mustHave: ["X", "Z", "QB", "C"] },
  // Same formations at flag dimensions (different player count).
  { variant: "flag_7v7", name: "Pro Set", mustHave: ["X", "Y", "Z"] },
  { variant: "flag_7v7", name: "Spread Doubles" },
  { variant: "flag_7v7", name: "Trips Right" },
  // flag_6v6 — center + QB + 4 skill. Spread Doubles trims to 1x2 + 1 back
  // (4 skill), Trips trims to 3x1 - 1 (the fit helper drops the weakside
  // slot). Required IDs are QB and C plus the two outside WRs (X, Z).
  { variant: "flag_6v6", name: "Spread Doubles", mustHave: ["QB", "C", "X", "Z"] },
  { variant: "flag_6v6", name: "Trips Right", mustHave: ["QB", "C", "Z"] },
  { variant: "flag_6v6", name: "Empty", mustHave: ["QB", "C", "X", "Z"] },
  // flag_5v5 canonical roster: {QB, C, X, Y, Z} — five distinct labels,
  // no tackle/7v7 carryover (B, H, S, F all get remapped to Y). The
  // synthesizer emits "QB" not "Q" for the QB id; the validator
  // accepts either as canonical.
  { variant: "flag_5v5", name: "Spread", mustHave: ["QB", "C", "X", "Y", "Z"] },
  { variant: "flag_5v5", name: "Spread Doubles", mustHave: ["QB", "C", "X", "Y", "Z"] },

  // Diamond family — added 2026-05-23 after a coach surfaced Cal hallucinating
  // a "Diamond Crossers" layout (synthesizer silently fell back to Spread
  // Doubles because Diamond wasn't in the parser). Diamond is a 4-point shape:
  // C short-middle on LOS, two receivers wide, one receiver deep middle behind
  // QB. Tight Diamond compresses the wide points inward for pick/rub plays.
  { variant: "flag_5v5", name: "Diamond", mustHave: ["QB", "C", "X", "Y", "Z"] },
  { variant: "flag_5v5", name: "Tight Diamond", mustHave: ["QB", "C", "X", "Y", "Z"] },
  { variant: "flag_6v6", name: "Diamond", mustHave: ["QB", "C", "X", "Z"] },
  { variant: "flag_6v6", name: "Tight Diamond", mustHave: ["QB", "C", "X", "Z"] },
  { variant: "flag_7v7", name: "Diamond", mustHave: ["QB", "C", "X", "Z"] },
  { variant: "flag_7v7", name: "Tight Diamond", mustHave: ["QB", "C", "X", "Z"] },

  // I-Formation (flag context) — receivers stacked in a single-file column
  // behind the QB. Distinct from tackle Pro-I (under-center, FB+HB stack):
  // in flag the QB is in shotgun and a couple of receivers line up directly
  // behind in a vertical column. Remaining receivers split wide.
  { variant: "flag_5v5", name: "I-Formation", mustHave: ["QB", "C", "X", "Y", "Z"] },
  { variant: "flag_6v6", name: "I-Formation", mustHave: ["QB", "C", "X", "Z"] },
  { variant: "flag_7v7", name: "I-Formation", mustHave: ["QB", "C", "X", "Z"] },
];

describe("synthesizeOffense — variant-correct player counts", () => {
  it.each(FORMATION_CASES)(
    "$variant / $name → produces $variant's full player count",
    ({ variant, name, expectedCount }) => {
      const synth = synthesizeOffense(variant, name);
      expect(synth, `synthesizer returned null for ${variant}/${name}`).not.toBeNull();
      const expected =
        expectedCount ?? sportProfileForVariant(variant).offensePlayerCount;
      expect(
        synth!.players.length,
        `${variant}/${name}: expected ${expected} players, got ${synth!.players.length}`,
      ).toBe(expected);
    },
  );
});

describe("synthesizeOffense — required player labels", () => {
  it.each(FORMATION_CASES.filter((c) => c.mustHave && c.mustHave.length > 0))(
    "$variant / $name includes $mustHave",
    ({ variant, name, mustHave }) => {
      const synth = synthesizeOffense(variant, name);
      expect(synth).not.toBeNull();
      const ids = new Set(synth!.players.map((p) => p.id));
      for (const required of mustHave!) {
        expect(
          ids.has(required),
          `${variant}/${name} should include "${required}" but only has [${[...ids].join(", ")}]`,
        ).toBe(true);
      }
    },
  );
});

describe("synthesizeOffense — Pro Set regression (Z must be present)", () => {
  // Specific regression test for the te+right=1 → no-Z bug. This was
  // the root cause of the orange-thumbnail bug surfaced in production.
  // If this test ever fails again, plays saved through the SFPA path
  // will silently produce 10-player tackle formations.
  it("tackle_11 Pro Set has X (left WR), Y (TE), AND Z (right WR)", () => {
    const synth = synthesizeOffense("tackle_11", "Pro Set");
    expect(synth!.players.length).toBe(11);
    const z = synth!.players.find((p) => p.id === "Z");
    expect(z, "Z (right WR) missing — the te+right=1 bug has regressed").toBeDefined();
    expect(z!.x).toBeGreaterThan(10); // wide right
    expect(z!.y).toBe(0); // on the line
  });

  it("tackle_11 Pro I has Z on the right sideline", () => {
    const synth = synthesizeOffense("tackle_11", "Pro I");
    const z = synth!.players.find((p) => p.id === "Z");
    expect(z).toBeDefined();
    expect(z!.x).toBeGreaterThan(10);
  });
});

describe("synthesizeOffense — distinct LETTERS per slot (no H + H2 numeric suffixes)", () => {
  // Per the KB (rag_documents:conventions/offense_labels for tackle_11):
  // "Tackle 11 — Offensive personnel labels (X / Y / Z / H / F / T / Q)".
  // Distinct letters per role, NEVER numeric suffixes. A coach surfaced
  // 2026-05-02 that the synthesizer was producing H + H2 for spread
  // doubles 2x2 — two slot receivers both labeled H + a downstream
  // dedup pass appending "2".

  it("Spread Doubles 2x2: produces X H Z S (no H + H2 duplication)", () => {
    const synth = synthesizeOffense("tackle_11", "Spread Doubles");
    const ids = (synth?.players ?? []).map((p) => p.id);
    // No two players share the SAME letter (no "H + H2" pattern).
    const unique = new Set(ids);
    expect(unique.size, `duplicate label in [${ids.join(", ")}]`).toBe(ids.length);
    // No numeric-suffix labels — those mean the dedup pass had to fire.
    for (const id of ids) {
      expect(id, `numeric-suffix label "${id}" indicates the synthesizer produced a duplicate`)
        .not.toMatch(/\d$/);
    }
    // Both slot receivers present, distinct letters — H + S (not H + H2).
    expect(ids).toContain("H");
    expect(ids).toContain("S");
  });

  it("Empty (5-wide): all 5 receivers get distinct letters", () => {
    const synth = synthesizeOffense("tackle_11", "Empty");
    const skill = (synth?.players ?? []).filter(
      (p) => !["LT", "LG", "C", "RG", "RT", "QB"].includes(p.id),
    ).map((p) => p.id);
    const unique = new Set(skill);
    expect(unique.size, `duplicate among 5-wide receivers [${skill.join(", ")}]`).toBe(skill.length);
    for (const id of skill) {
      expect(id).not.toMatch(/\d$/);
    }
  });

  it("Trips Right preserves the conventional Z H S labels", () => {
    const synth = synthesizeOffense("tackle_11", "Trips Right");
    const ids = (synth?.players ?? []).map((p) => p.id);
    expect(ids).toContain("X");
    expect(ids).toContain("Z");
    expect(ids).toContain("H");
    expect(ids).toContain("S");
  });
});

describe("synthesizeOffense — slots clear the OL row in tackle_11 (regression: 'S' overlapped RT at x=4)", () => {
  // 2026-05-02 production failure: Flood Right (Trips formation) hit
  // the overlap resolver because the synthesizer placed the inner-most
  // slot at x=4 — exactly RT's column. Slot at (4, -1) and RT at (4, 0)
  // were 1yd apart vertically and the resolver couldn't separate them
  // when other players were also clustered. Fix: clamp inner slots to
  // |x| >= 7 so they sit OUTSIDE the OL row (x=[-4, +4]) by 2yd.

  it("Trips Right: every slot's |x| >= 7 (clear of the OL row)", () => {
    const synth = synthesizeOffense("tackle_11", "Trips Right");
    expect(synth).not.toBeNull();
    // Inner slots are off-the-line (y < 0). Outermost WRs (y === 0) and
    // OL/QB/RB are excluded from the clamp.
    const slots = (synth?.players ?? []).filter((p) => p.y !== 0 && p.y !== -5 && !["LT","LG","C","RG","RT","QB"].includes(p.id));
    for (const slot of slots) {
      expect(
        Math.abs(slot.x),
        `Slot @${slot.id} at x=${slot.x} is too close to the OL (must be |x| >= 7)`,
      ).toBeGreaterThanOrEqual(7);
    }
  });

  it("Trips Left: every slot's |x| >= 7 (clear of the OL row)", () => {
    const synth = synthesizeOffense("tackle_11", "Trips Left");
    expect(synth).not.toBeNull();
    const slots = (synth?.players ?? []).filter((p) => p.y !== 0 && p.y !== -5 && !["LT","LG","C","RG","RT","QB"].includes(p.id));
    for (const slot of slots) {
      expect(
        Math.abs(slot.x),
        `Slot @${slot.id} at x=${slot.x} is too close to the OL`,
      ).toBeGreaterThanOrEqual(7);
    }
  });

  it("Empty (5-wide): the inner-most slot still clears the OL", () => {
    const synth = synthesizeOffense("tackle_11", "Empty");
    expect(synth).not.toBeNull();
    const slots = (synth?.players ?? []).filter((p) => p.y < 0 && !["LT","LG","C","RG","RT","QB"].includes(p.id));
    for (const slot of slots) {
      expect(Math.abs(slot.x)).toBeGreaterThanOrEqual(7);
    }
  });
});

describe("synthesizeOffense — flag_5v5 canonical roster {Q, C, X, Y, Z}", () => {
  // Surfaced 2026-05-04: the synthesizer reused tackle/7v7 helpers for
  // flag_5v5 and emitted "B" (back) instead of canonical "Y". Combined
  // with Cal hand-authoring tackle_11 skeletons in 5v5 chats, plays
  // saved with H/B labels that don't exist in 5v5 leagues. The
  // synthesizer now remaps any non-canonical label to Y in flag_5v5,
  // so place_offense's output matches the validator and the league
  // convention.
  const NON_CANONICAL_5V5 = ["B", "H", "S", "F"] as const;

  it("Spread Doubles 5v5: produces exactly {QB, C, X, Y, Z}", () => {
    const synth = synthesizeOffense("flag_5v5", "Spread Doubles");
    expect(synth).not.toBeNull();
    const ids = (synth?.players ?? []).map((p) => p.id);
    // QB id is "QB" (the synthesizer's full label); validator accepts
    // either Q or QB as canonical, but the synthesizer always emits QB.
    expect(ids).toContain("QB");
    expect(ids).toContain("C");
    expect(ids).toContain("X");
    expect(ids).toContain("Y");
    expect(ids).toContain("Z");
    expect(ids).toHaveLength(5);
    for (const bad of NON_CANONICAL_5V5) {
      expect(ids, `flag_5v5 emitted non-canonical label "${bad}"`).not.toContain(bad);
    }
  });

  it("Trips 5v5: every label is in the canonical set (suffix-tolerant)", () => {
    // Trips can't really fit in 5v5 (3 receivers + back > 3 skill slots),
    // but whatever the synthesizer emits MUST use canonical labels.
    // Y2 is allowed (the validator's roster gate strips suffixes); a
    // bare H/B/S/F is not.
    const synth = synthesizeOffense("flag_5v5", "Trips Right");
    expect(synth).not.toBeNull();
    const allowed = new Set(["Q", "QB", "C", "X", "Y", "Z"]);
    for (const p of synth?.players ?? []) {
      const stripped = p.id.replace(/\d+$/, "");
      expect(
        allowed.has(stripped),
        `flag_5v5 Trips Right produced non-canonical label "${p.id}"`,
      ).toBe(true);
    }
  });
});

describe("synthesizeOffense — Diamond geometry (4-point shape)", () => {
  // Surfaced 2026-05-23: a coach asked Cal for a "Diamond" formation in
  // flag_5v5 and got Spread Doubles instead (synthesizer fell back). The
  // shape contract: C on LOS short-middle, X wide-left on LOS, Z wide-
  // right on LOS, Y deep-middle behind QB. Tight Diamond pulls X/Z inward
  // for picks/rubs. The geometric assertions below pin this shape so
  // future refactors don't silently flatten it back to Spread Doubles.

  it("flag_5v5 Diamond: C short-middle, X/Z wide on LOS, Y behind QB", () => {
    const synth = synthesizeOffense("flag_5v5", "Diamond");
    expect(synth, "Diamond returned null — parser doesn't recognize it").not.toBeNull();
    const byId = new Map(synth!.players.map((p) => [p.id, p]));
    // C on LOS at center
    expect(byId.get("C")?.y).toBe(0);
    expect(byId.get("C")?.x).toBe(0);
    // Wide receivers on LOS, split apart
    const x = byId.get("X");
    const z = byId.get("Z");
    expect(x, "X (wide left) missing").toBeDefined();
    expect(z, "Z (wide right) missing").toBeDefined();
    expect(x!.y).toBe(0);
    expect(z!.y).toBe(0);
    expect(x!.x).toBeLessThan(-5); // wide left
    expect(z!.x).toBeGreaterThan(5); // wide right
    // Y deep behind QB (y more negative than QB at -5)
    const y = byId.get("Y");
    expect(y, "Y (deep back) missing").toBeDefined();
    expect(y!.y).toBeLessThan(-5);
    expect(Math.abs(y!.x)).toBeLessThan(2); // centered
  });

  it("flag_5v5 Tight Diamond: wide receivers compressed inward", () => {
    const wide = synthesizeOffense("flag_5v5", "Diamond")!;
    const tight = synthesizeOffense("flag_5v5", "Tight Diamond")!;
    const wideX = wide.players.find((p) => p.id === "X")!.x;
    const tightX = tight.players.find((p) => p.id === "X")!.x;
    // Tight has SMALLER absolute x (closer to center)
    expect(
      Math.abs(tightX),
      `Tight X at x=${tightX} should be inside wide X at x=${wideX}`,
    ).toBeLessThan(Math.abs(wideX));
  });

  it("flag_7v7 Diamond: still has 4-point shape (C + X + Z + deep middle)", () => {
    const synth = synthesizeOffense("flag_7v7", "Diamond")!;
    expect(synth.players.length).toBe(7);
    const byId = new Map(synth.players.map((p) => [p.id, p]));
    expect(byId.get("C")?.y).toBe(0);
    expect(byId.get("X")!.x).toBeLessThan(-5);
    expect(byId.get("Z")!.x).toBeGreaterThan(5);
    // At least one receiver deep behind QB
    const deep = synth.players.find((p) => p.y < -5 && Math.abs(p.x) < 2 && p.id !== "QB");
    expect(deep, "Diamond requires a deep-middle receiver behind QB").toBeDefined();
  });
});

describe("synthesizeOffense — I-Formation in flag (stack column behind QB)", () => {
  // Surfaced 2026-05-23: user wants I-Formation in flag to mean "receivers
  // stacked in a single-file column behind the QB" (NOT the tackle Pro-I
  // shape of FB + HB under center). The parser must read the variant to
  // pick the right interpretation. Tackle I-Form behavior is unchanged
  // and pinned by the existing FORMATION_CASES entry above.

  it("flag_5v5 I-Formation: at least one receiver stacked behind QB on the centerline", () => {
    const synth = synthesizeOffense("flag_5v5", "I-Formation")!;
    expect(synth.players.length).toBe(5);
    // QB at (0, -5). Stacked receivers should be at x≈0, y < -5 (deeper).
    const stacked = synth.players.filter(
      (p) => p.id !== "QB" && p.id !== "C" && Math.abs(p.x) < 2 && p.y < -5,
    );
    expect(
      stacked.length,
      `I-Formation should have at least 1 receiver stacked behind QB on centerline; got [${synth.players.map((p) => `${p.id}@(${p.x},${p.y})`).join(", ")}]`,
    ).toBeGreaterThanOrEqual(1);
  });

  it("flag_7v7 I-Formation: 2+ receivers in the I-stack column", () => {
    const synth = synthesizeOffense("flag_7v7", "I-Formation")!;
    expect(synth.players.length).toBe(7);
    const stacked = synth.players.filter(
      (p) => p.id !== "QB" && p.id !== "C" && Math.abs(p.x) < 2 && p.y < -5,
    );
    expect(stacked.length).toBeGreaterThanOrEqual(2);
  });

  it("tackle_11 I-Form is unchanged (Pro-I shape, NOT flag stack column)", () => {
    // Regression guard: don't accidentally change tackle Pro-I when adding
    // the flag-context I-form path.
    const synth = synthesizeOffense("tackle_11", "I-Form")!;
    expect(synth.players.length).toBe(11);
    // Pro-I has FB (F) at -3 and HB (B) at -6 — not a flag stack column.
    expect(synth.players.find((p) => p.id === "F")).toBeDefined();
    expect(synth.players.find((p) => p.id === "B")).toBeDefined();
  });
});

describe("synthesizeOffense — no overlapping player positions", () => {
  it.each(FORMATION_CASES)(
    "$variant / $name has no two players at the same (x, y)",
    ({ variant, name }) => {
      const synth = synthesizeOffense(variant, name);
      expect(synth).not.toBeNull();
      const seen = new Map<string, string>();
      for (const p of synth!.players) {
        const key = `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
        const prior = seen.get(key);
        expect(
          prior,
          `${variant}/${name}: "${prior}" and "${p.id}" overlap at (${p.x}, ${p.y})`,
        ).toBeUndefined();
        seen.set(key, p.id);
      }
    },
  );
});
