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
  variant: "tackle_11" | "flag_7v7" | "flag_5v5";
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
  { variant: "flag_5v5", name: "Spread" },
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
