/**
 * Scheme catalog — man-coverage roster integrity (Layer 1).
 *
 * Per AGENTS.md Rule 1, this is the failing-test-first reproduction of a
 * 2026-05-28 bug: the flag_6v6 man schemes `f6-cover-1` and `f6-cover-0`
 * manned phantom receivers "Y" and "S" that DO NOT EXIST on the 6v6
 * offensive roster {QB, C, X, H, Z, B} (asserted by conceptMatch.test.ts,
 * produced by conceptSkeleton.ts, and used by the flag_6v6 reactor
 * patterns). When compose_defense overlays such a scheme onto a real 6v6
 * play, the man line points at a receiver that isn't on the field, so the
 * defender renders no man line or mis-resolves.
 *
 * These checks mirror the defender-roster cross-check in
 * defensiveReactors.test.ts (reactor defender ∈ alignment) and load.ts
 * (reactor defender ∈ scheme), one layer over: every man-coverage TARGET
 * must be a real offensive receiver for the scheme's variant.
 */

import { describe, expect, it } from "vitest";
import { SCHEMES } from "./schemes";

// The 6v6 offensive roster is {QB, C, X, H, Z, B}: one slot @H, a back
// @B, and the eligible center @C, alongside the two outside WRs @X/@Z.
// There is NO @Y and NO @S in 6v6 (conceptSkeleton's strong-right
// alignment: outsideWR=@Z, backsideWR=@X, slot=@H, back=@B). Man coverage
// never targets the QB, so the legal man-target set is the five eligible
// receivers.
const ROSTER_6V6 = new Set(["X", "Z", "H", "B", "C"]);

describe("SCHEMES — flag_6v6 man-coverage roster integrity", () => {
  const man6v6 = SCHEMES.filter(
    (s) => s.variants.includes("flag_6v6") && s.manCoverage === true,
  );

  it("includes the two stock 6v6 man schemes (f6-cover-1, f6-cover-0)", () => {
    const ids = new Set(man6v6.map((s) => s.id));
    expect(ids.has("f6-cover-1")).toBe(true);
    expect(ids.has("f6-cover-0")).toBe(true);
  });

  it("mans only receivers that exist on the 6v6 roster (no phantom @Y / @S)", () => {
    for (const scheme of man6v6) {
      for (const d of scheme.defenders) {
        if (d.assignment.kind !== "man") continue;
        const target = d.assignment.target;
        expect(
          target,
          `${scheme.id}: defender "${d.id}" has a man assignment with no target`,
        ).toBeDefined();
        expect(
          ROSTER_6V6.has(target as string),
          `${scheme.id}: defender "${d.id}" mans "${target}", which is not on the 6v6 roster {${[...ROSTER_6V6].join(", ")}}`,
        ).toBe(true);
      }
    }
  });

  it("f6-cover-0 (pure man, no deep help) mans all five eligible receivers exactly once", () => {
    // Cover 0 has no safety help, so every eligible receiver must be
    // manned — and no two defenders may double a receiver while leaving
    // another uncovered. (f6-cover-1 is man-FREE: @C is intentionally the
    // free receiver under the FS, so it is NOT held to this completeness
    // check.) This pins the @S→@C fix: the SS already mans @B, so the
    // freed NB must take the center, not double the back.
    const cover0 = SCHEMES.find((s) => s.id === "f6-cover-0");
    expect(cover0).toBeDefined();
    if (!cover0) return;
    const manTargets = cover0.defenders.flatMap((d) =>
      d.assignment.kind === "man" ? [d.assignment.target] : [],
    );
    expect(new Set(manTargets)).toEqual(ROSTER_6V6);
    expect(manTargets.length).toBe(ROSTER_6V6.size); // exactly once — no double-team
  });
});
