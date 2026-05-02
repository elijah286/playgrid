/**
 * Shared render-time geometry constants.
 *
 * Every renderer that draws a play field on a 16-ish:9 SVG viewBox
 * needs the same conversion from "field width in yards" to "viewBox
 * width units". Until now this calculation was duplicated in four
 * places (editor, game-mode, formation editor, chat embed) — each
 * with the same magic numbers (25, 0.75) and same one-line formula.
 * Drift between them produced the "chat looks subtly different from
 * the editor" bug surfaced 2026-05-01.
 *
 * This module is now the single source of truth. The four callers
 * import `fieldAspectFor()` (or `VIEWPORT_LENGTH_YDS` if they need
 * the underlying constant for, e.g., yard-line spacing).
 */

import type { PlayDocument } from "./types";

/**
 * The on-screen field always shows a 25-yard window of length. This is
 * the standard "play view" — long enough to see a deep route from a
 * backfield handoff, short enough to keep the OL row readable.
 */
export const VIEWPORT_LENGTH_YDS = 25;

/**
 * Multiplier applied to the viewport length when computing aspect.
 * Empirically chosen so the field renders wider than tall by default
 * (so a coach can see a Spread formation without the receivers feeling
 * cramped against the sidelines).
 */
const ASPECT_LENGTH_MULTIPLIER = 0.75;

/**
 * Width-to-height ratio of the rendered field for a given variant.
 *
 *   tackle_11  → ~2.83:1   (53yd width / 18.75)
 *   flag_7v7   → 1.6:1     (30yd width / 18.75)  — exactly 16:10
 *   flag_5v5   → ~1.33:1   (25yd width / 18.75)
 *
 * Defensive: returns a 16:10 fallback if the doc's sportProfile is
 * missing or has a non-finite width (post-schema-validation this
 * should never happen, but we guard so a corrupted DB row never
 * collapses the SVG to a NaN viewBox — matches the same pattern
 * resolveFieldTheme uses on its bg lookup).
 */
export function fieldAspectFor(doc: PlayDocument): number {
  const widthYds = doc.sportProfile?.fieldWidthYds;
  if (typeof widthYds !== "number" || !Number.isFinite(widthYds) || widthYds <= 0) {
    return 16 / 10;
  }
  return widthYds / (VIEWPORT_LENGTH_YDS * ASPECT_LENGTH_MULTIPLIER);
}

/**
 * Same calculation but for callers that have a raw width in yards
 * rather than a full PlayDocument (e.g. the editor's "expand to full
 * field width" toggle, which compares a candidate width against the
 * narrow cap).
 */
export function fieldAspectForWidth(widthYds: number): number {
  if (!Number.isFinite(widthYds) || widthYds <= 0) return 16 / 10;
  return widthYds / (VIEWPORT_LENGTH_YDS * ASPECT_LENGTH_MULTIPLIER);
}

/**
 * The "narrow" aspect cap matches flag_7v7's natural aspect (1.6:1).
 * The editor's "full field" toggle uses this as the upper bound when
 * the user has the toggle OFF — keeps a tackle play from rendering at
 * a 2.83:1 width that would compress the OL too much in a side panel.
 */
export const NARROW_FIELD_ASPECT = fieldAspectForWidth(30);
