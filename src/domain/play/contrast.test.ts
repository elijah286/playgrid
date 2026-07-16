/**
 * Pins the ink-rescue rule that keeps routes visible on light fields.
 *
 * The bug being defended against (reported by a coach, Jul 2026): a printed
 * playsheet uses a white field, the QB's fill is #FFFFFF, routes inherit their
 * carrier's fill — so the QB's route was drawn white-on-white and vanished.
 *
 * The two edges below are the whole design. The green field must come out
 * BYTE-IDENTICAL (or we have repainted the editor for every existing coach),
 * and the light fields must be rescued. Every default in the palette is
 * asserted in both directions so a future palette edit that closes the gap
 * fails here rather than in front of a coach.
 */

import { describe, expect, it } from "vitest";
import {
  MIN_FIELD_INK_DISTANCE,
  colorDistance,
  distanceToField,
  inkVanishesOnField,
  resolveContrastingInk,
} from "./contrast";

/** Every default route ink, mirrored from factory.ts styleForRole. */
const PALETTE = {
  QB: "#FFFFFF",
  C: "#A855F7",
  OTHER: "#94A3B8",
  RB: "#F26522",
  TE: "#22C55E",
  X: "#EF4444",
  Z: "#3B82F6",
  slot: "#FACC15",
} as const;

const QB_COMPANION = "#0f172a"; // factory.ts:278 QB style.stroke

describe("colorDistance", () => {
  it("is zero for identical colors", () => {
    expect(colorDistance("#FFFFFF", "#FFFFFF")).toBe(0);
  });

  it("is symmetric", () => {
    const a = colorDistance("#A855F7", "#2D8B4E");
    const b = colorDistance("#2D8B4E", "#A855F7");
    expect(a).toBeCloseTo(b!, 10);
  });

  it("normalizes shorthand and case", () => {
    expect(colorDistance("#fff", "#FFFFFF")).toBe(0);
    expect(colorDistance("#a855f7", "#A855F7")).toBe(0);
  });

  it("returns null for unparseable input rather than guessing", () => {
    expect(colorDistance("rgba(0,0,0,0.5)", "#FFFFFF")).toBeNull();
    expect(colorDistance("", "#FFFFFF")).toBeNull();
    expect(colorDistance("#FFFFFF", "not-a-color")).toBeNull();
  });

  it("separates hue at equal lightness — the case WCAG contrast misses", () => {
    // Purple C on the green field scores 1.08:1 by WCAG (nominally invisible)
    // but is obviously distinct to the eye. Perceptual distance sees that.
    expect(colorDistance("#A855F7", "#2D8B4E")!).toBeGreaterThan(100);
  });
});

describe("the green field is never touched", () => {
  // If any of these trip, we have started recoloring the editor canvas.
  it.each(Object.entries(PALETTE))("%s (%s) survives on green", (_role, fill) => {
    expect(inkVanishesOnField(fill, "green")).toBe(false);
    expect(resolveContrastingInk(fill, QB_COMPANION, "green")).toBe(fill);
  });

  it("green is the default when no background is given", () => {
    expect(resolveContrastingInk(PALETTE.QB, QB_COMPANION, undefined)).toBe(PALETTE.QB);
    expect(resolveContrastingInk(PALETTE.QB, QB_COMPANION, null)).toBe(PALETTE.QB);
  });

  it("keeps a safety margin below the closest green ink", () => {
    // The green TE is the tightest at ~31.6. Keep real headroom under it.
    const tightest = Math.min(
      ...Object.values(PALETTE).map((f) => distanceToField(f, "green")!),
    );
    expect(tightest).toBeGreaterThan(MIN_FIELD_INK_DISTANCE + 5);
  });
});

describe("white field — the reported bug", () => {
  it("the QB's white route is rescued to its own marker-ring color", () => {
    expect(inkVanishesOnField(PALETTE.QB, "white")).toBe(true);
    expect(resolveContrastingInk(PALETTE.QB, QB_COMPANION, "white")).toBe(QB_COMPANION);
  });

  it("the QB is the ONLY ink rescued on white", () => {
    for (const [role, fill] of Object.entries(PALETTE)) {
      if (role === "QB") continue;
      expect(inkVanishesOnField(fill, "white"), `${role} ${fill}`).toBe(false);
    }
  });
});

describe("gray field — why a light-gray background alone would not have fixed it", () => {
  it("a white route still vanishes on the gray field", () => {
    // dE 8.7. This is why simply exposing the existing gray background as a
    // print option would NOT have addressed the coach's report.
    expect(inkVanishesOnField(PALETTE.QB, "gray")).toBe(true);
  });

  it("gray linemen also vanish on the gray field, and are rescued too", () => {
    // dE 20.8 — a gray background trades the QB bug for a lineman bug unless
    // the rescue runs.
    expect(inkVanishesOnField(PALETTE.OTHER, "gray")).toBe(true);
    expect(resolveContrastingInk(PALETTE.OTHER, "#0f172a", "gray")).toBe("#0f172a");
  });

  it("saturated inks are untouched on gray", () => {
    for (const role of ["C", "RB", "TE", "X", "Z", "slot"] as const) {
      expect(inkVanishesOnField(PALETTE[role], "gray"), role).toBe(false);
    }
  });
});

describe("black field", () => {
  it("needs no rescue — the palette is built for dark fields", () => {
    for (const [role, fill] of Object.entries(PALETTE)) {
      expect(inkVanishesOnField(fill, "black"), `${role} ${fill}`).toBe(false);
    }
  });

  it("falls back to white when the companion ALSO vanishes", () => {
    // The near-black companion #0f172a is dE 14.5 from the black field, so it
    // is not a usable rescue there. Without the fallback this would swap one
    // invisible ink for another.
    expect(inkVanishesOnField(QB_COMPANION, "black")).toBe(true);
    expect(resolveContrastingInk("#141414", QB_COMPANION, "black")).toBe("#FFFFFF");
  });
});

describe("resolveContrastingInk — robustness", () => {
  it("leaves unparseable ink alone rather than swapping it", () => {
    expect(resolveContrastingInk("url(#grad)", QB_COMPANION, "white")).toBe("url(#grad)");
  });

  it("rescues without a companion", () => {
    expect(resolveContrastingInk(PALETTE.QB, null, "white")).toBe("#0f172a");
    expect(resolveContrastingInk(PALETTE.QB, undefined, "white")).toBe("#0f172a");
  });

  it("skips an unparseable companion and uses a fallback", () => {
    expect(resolveContrastingInk(PALETTE.QB, "rgba(0,0,0,1)", "white")).toBe("#0f172a");
  });

  it("is deterministic and pure", () => {
    const once = resolveContrastingInk(PALETTE.QB, QB_COMPANION, "white");
    const twice = resolveContrastingInk(PALETTE.QB, QB_COMPANION, "white");
    expect(once).toBe(twice);
  });

  it("is idempotent — re-running on a rescued ink is a no-op", () => {
    const rescued = resolveContrastingInk(PALETTE.QB, QB_COMPANION, "white");
    expect(resolveContrastingInk(rescued, QB_COMPANION, "white")).toBe(rescued);
  });

  it("treats an unknown background as green (matches resolveFieldTheme)", () => {
    const bg = "chartreuse" as never;
    expect(resolveContrastingInk(PALETTE.QB, QB_COMPANION, bg)).toBe(PALETTE.QB);
  });
});
