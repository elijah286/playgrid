/**
 * Image plumbing for photo import — thin wrappers over the proven
 * crop pipeline from the 2026-05 vision work (`image-crop.ts`), which
 * was never the part that failed.
 *
 * Photos are processed IN-FLIGHT only: nothing here (or anywhere in the
 * import pipeline) persists the coach's photo. The base64 lives on the
 * request, is cropped, sent to the model, and dropped.
 */

import sharp from "sharp";
import {
  cropPlaysFromSheet,
  expandBBox,
  validateBBox,
  type CroppedPlay,
  type NormalizedBBox,
} from "@/lib/coach-ai/image-crop";

/** Margin applied around detected panel bboxes so arrowheads that stray
 *  past the panel border survive the crop (same rationale + value as
 *  the original pipeline). */
export const PANEL_MARGIN_PCT = 0.06;

export const WHOLE_IMAGE_BBOX: NormalizedBBox = { x: 0, y: 0, w: 1, h: 1 };

/** ~10 MB of raw image, base64-encoded. Client-side downscaling keeps
 *  real payloads far below this; the guard is for hostile input. */
export const MAX_IMAGE_BASE64_CHARS = 14_000_000;

export function isSupportedMediaType(mediaType: string): boolean {
  return mediaType === "image/jpeg" || mediaType === "image/png" || mediaType === "image/webp";
}

/** Crop one panel out of the sheet at full resolution. `bbox` is the
 *  raw detected box — margin expansion happens here so every caller
 *  gets the same forgiveness. */
export async function cropPanel(
  base64: string,
  mediaType: string,
  bbox: NormalizedBBox,
  label: string,
): Promise<CroppedPlay | null> {
  const expanded = expandBBox(bbox, PANEL_MARGIN_PCT);
  if (validateBBox(expanded)) return null;
  const crops = await cropPlaysFromSheet(base64, mediaType, [{ label, bbox: expanded }]);
  return crops[0] ?? null;
}

/** Small JPEG preview for the panel picker grid. */
export async function thumbnailBase64(cropBase64: string, width = 360): Promise<string> {
  const buf = await sharp(Buffer.from(cropBase64, "base64"))
    .resize({ width, withoutEnlargement: true })
    .jpeg({ quality: 70 })
    .toBuffer();
  return buf.toString("base64");
}
