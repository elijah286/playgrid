// Single source of truth for the player letter color shown on top of a fill.
// The rule: text is BLACK on every fill EXCEPT a black-or-near-black one,
// where it switches to WHITE so the letter remains visible. This intentionally
// ignores any per-player `labelColor` override stored on the document — the
// override field has been a source of inconsistency (some plays end up with
// white letters on yellow, others black on red) and the picker UI has been
// removed for now. If we re-introduce per-player overrides later, change the
// call sites to take that override and fall through to this default.

const DARK_FILL_LUMINANCE_THRESHOLD = 0.20;

export const LABEL_COLOR_BLACK = "#1C1C1E";
export const LABEL_COLOR_WHITE = "#FFFFFF";

function parseHex(input: string | null | undefined): { r: number; g: number; b: number } | null {
  if (!input) return null;
  const m = input.trim().match(/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (!m) return null;
  const hex = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1];
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  };
}

export function deriveLabelColor(fill: string | null | undefined): string {
  const rgb = parseHex(fill);
  if (!rgb) return LABEL_COLOR_BLACK;
  const lum = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  return lum < DARK_FILL_LUMINANCE_THRESHOLD ? LABEL_COLOR_WHITE : LABEL_COLOR_BLACK;
}
