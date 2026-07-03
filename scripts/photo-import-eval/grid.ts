/**
 * Deterministic grid cropping for printed play sheets.
 *
 * Playmaker X (and similar apps) export plays in a regular R×C grid, so
 * Phase 0 does not need the LLM layout-detection call the 2026-05
 * pipeline used — a content-region + grid split is enough, and it makes
 * the eval fully deterministic. Hand-drawn sheets (irregular layouts)
 * will reuse the old detection call in Phase 1; the cropper downstream
 * of either is the same `cropPlaysFromSheet`.
 */

import { expandBBox, type NormalizedBBox, type PlayLayoutEntry } from "@/lib/coach-ai/image-crop";

/** Fraction of the photo (0-1, from top-left) that contains the play
 *  grid — excludes the printed header, footer URL, and sleeve edges. */
export type ContentRegion = { top: number; bottom: number; left: number; right: number };

/** Tuned against the Bomb Squad sheet photo (header ≈ top 12.5%,
 *  footer URL ≈ bottom 3.5%). Override via --region or goldens.grid. */
export const DEFAULT_REGION: ContentRegion = { top: 0.125, bottom: 0.965, left: 0.045, right: 0.965 };

/** Margin applied around each cell (fraction of the cell, per side) so
 *  arrows that stray past panel borders survive the crop — same reason
 *  the old pipeline expanded LLM-detected bboxes. */
export const DEFAULT_CELL_MARGIN = 0.06;

export function gridLayout(
  rows: number,
  cols: number,
  region: ContentRegion = DEFAULT_REGION,
  marginPct: number = DEFAULT_CELL_MARGIN,
): PlayLayoutEntry[] {
  if (rows < 1 || cols < 1) throw new Error(`grid must be at least 1x1 (got ${rows}x${cols})`);
  if (
    region.top < 0 || region.left < 0 || region.bottom > 1 || region.right > 1 ||
    region.top >= region.bottom || region.left >= region.right
  ) {
    throw new Error(`invalid content region ${JSON.stringify(region)}`);
  }
  const regionW = region.right - region.left;
  const regionH = region.bottom - region.top;
  const entries: PlayLayoutEntry[] = [];
  let n = 1;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const raw: NormalizedBBox = {
        x: region.left + (c / cols) * regionW,
        y: region.top + (r / rows) * regionH,
        w: regionW / cols,
        h: regionH / rows,
      };
      entries.push({ label: `Play ${n++}`, bbox: expandBBox(raw, marginPct) });
    }
  }
  return entries;
}

export function parseRegionFlag(raw: string): ContentRegion {
  const parts = raw.split(",").map((p) => Number(p.trim()));
  if (parts.length !== 4 || parts.some((p) => !Number.isFinite(p))) {
    throw new Error(`--region expects "top,bottom,left,right" as four numbers in [0,1], got "${raw}"`);
  }
  return { top: parts[0], bottom: parts[1], left: parts[2], right: parts[3] };
}
