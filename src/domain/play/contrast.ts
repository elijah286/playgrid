/**
 * Keeps play ink visible against whatever field it lands on.
 *
 * The problem this solves: the default player palette in factory.ts is tuned
 * "for high contrast on a green field" — the QB is #FFFFFF. Routes inherit
 * their carrier's fill (see resolveRouteStroke), so the QB's route is drawn
 * white. On the green editor canvas that reads fine. On a white field — which
 * is what every printed playsheet uses — it is white-on-white and disappears
 * completely. A coach reported exactly this: the QB circle is visible (markers
 * already get an outline rescue in print/templates.ts) but its route is not.
 *
 * Why perceptual distance and not WCAG contrast: WCAG contrast is a
 * LUMINANCE-only ratio, built for text legibility. It is the wrong instrument
 * here. Measured against the green field, the purple C scores 1.08:1, the red X
 * 1.14:1 and the blue Z 1.16:1 — nominally "invisible", yet all four read
 * perfectly on screen because they differ from the field in HUE, not lightness.
 * Any WCAG threshold high enough to catch white-on-white would also repaint
 * purple, red, blue and orange on the green field and wreck the editor.
 *
 * So we ask the question that actually matters — "is this ink nearly the same
 * COLOR as the field?" — via CIELAB dE76. That metric separates the real cases
 * cleanly (worst-case distance to either field gradient stop):
 *
 *              green   white   gray
 *   QB  white   68.7     0.0    8.7   <- must be rescued on white + gray
 *   OL  gray    55.4    35.8   20.8   <- must be rescued on gray
 *   others     >=31.6  >=79.5 >=70.0  <- must never be touched
 *
 * MIN_FIELD_INK_DISTANCE sits in the gap between 20.8 and 31.6, so the green
 * field is left byte-identical while white and gray get fixed. dE76 (rather
 * than dE2000) is deliberate: we are thresholding far-apart colors, not
 * matching near-identical ones, and dE76 is trivially auditable.
 */

import { resolveFieldTheme, type FieldBackground } from "./fieldTheme";

/**
 * Minimum CIELAB dE76 between an ink and the field before we swap the ink.
 *
 * Load-bearing: raising this above ~31 starts recoloring inks on the green
 * field (the green TE sits at 31.6); lowering it below ~21 stops rescuing the
 * gray linemen on the gray field. contrast.test.ts pins both edges.
 */
export const MIN_FIELD_INK_DISTANCE = 25;

/** Last-resort inks, tried in order when a carrier has no usable companion. */
const FALLBACK_INKS = ["#0f172a", "#FFFFFF"] as const;

type Rgb = { r: number; g: number; b: number };

function parseHex(input: string | null | undefined): Rgb | null {
  if (!input) return null;
  const m = input.trim().match(/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (!m) return null;
  const hex =
    m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1];
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  };
}

/** sRGB channel -> linear light. */
function toLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** sRGB hex -> CIELAB (D65). */
function toLab(rgb: Rgb): [number, number, number] {
  const r = toLinear(rgb.r / 255);
  const g = toLinear(rgb.g / 255);
  const b = toLinear(rgb.b / 255);
  // Linear sRGB -> XYZ, normalized by the D65 white point.
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [fx, fy, fz] = [f(x), f(y), f(z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/**
 * Perceptual distance between two colors (CIELAB dE76).
 * Returns null when either input is not a parseable hex — callers treat that
 * as "unknown, leave the ink alone" rather than guessing.
 */
export function colorDistance(a: string, b: string): number | null {
  const ra = parseHex(a);
  const rb = parseHex(b);
  if (!ra || !rb) return null;
  const la = toLab(ra);
  const lb = toLab(rb);
  return Math.hypot(la[0] - lb[0], la[1] - lb[1], la[2] - lb[2]);
}

/**
 * Distance from an ink to the WORST (nearest) stop of the field gradient.
 * The field is a two-stop gradient, so an ink is only safe if it clears both.
 * Returns null for unparseable ink.
 */
export function distanceToField(
  ink: string,
  bg: FieldBackground | null | undefined,
): number | null {
  const theme = resolveFieldTheme(bg);
  const dMain = colorDistance(ink, theme.bgMain);
  const dDark = colorDistance(ink, theme.bgDark);
  if (dMain == null || dDark == null) return null;
  return Math.min(dMain, dDark);
}

/** True when `ink` is too close in color to the field to be seen. */
export function inkVanishesOnField(
  ink: string,
  bg: FieldBackground | null | undefined,
): boolean {
  const d = distanceToField(ink, bg);
  if (d == null) return false; // unparseable -> don't touch it
  return d < MIN_FIELD_INK_DISTANCE;
}

/**
 * Pick an ink that stays visible on `bg`.
 *
 * Order of preference:
 *   1. `preferred` — the color the play actually asked for. Almost always wins;
 *      on the green field it wins for every default in the palette.
 *   2. `companion` — the carrier's own `style.stroke`. Every player already
 *      carries a dark partner to its fill (the QB is
 *      `{ fill: "#FFFFFF", stroke: "#0f172a" }`), and that stroke is the ring
 *      already drawn around the marker. Reusing it means a rescued route is
 *      drawn in the same color as its own player's outline, so the line still
 *      reads as belonging to that player — no invented palette.
 *   3. A fallback ink, whichever of near-black / white sits furthest from the
 *      field. Covers a carrier whose companion also vanishes (e.g. the
 *      near-black #0f172a stroke on the black field, dE 14.5).
 */
export function resolveContrastingInk(
  preferred: string,
  companion: string | null | undefined,
  bg: FieldBackground | null | undefined,
): string {
  if (!inkVanishesOnField(preferred, bg)) return preferred;

  // Note the asymmetry with `preferred` above: an unreadable `preferred` is
  // left alone (it is the play's own declared ink and may be a gradient ref or
  // rgba() we have no business rewriting), but an unreadable companion must be
  // REJECTED. distanceToField returns null for both "unparseable" and nothing
  // else, so require a real measurement here — otherwise a legacy rgba() or
  // CSS-var stroke would be handed straight back as the rescue and written
  // into a stroke attribute unvalidated.
  const companionDistance = companion ? distanceToField(companion, bg) : null;
  if (companionDistance != null && companionDistance >= MIN_FIELD_INK_DISTANCE) {
    return companion!;
  }

  let best = preferred;
  let bestDistance = -1;
  for (const ink of FALLBACK_INKS) {
    const d = distanceToField(ink, bg) ?? -1;
    if (d > bestDistance) {
      bestDistance = d;
      best = ink;
    }
  }
  return best;
}
