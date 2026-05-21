/**
 * Server-side image cropping for the per-play vision pipeline.
 *
 * Coach Cal's image-upload flow (2026-05-21 round 13) splits a
 * full play sheet into N per-play crops before running pass-1.
 * Each crop fills the model's input frame, multiplying effective
 * resolution by 10-20x vs the whole-sheet approach — the model
 * can actually trace a 2yd lateral hook instead of confusing it
 * with a 10yd vertical.
 *
 * This module owns the geometric cropping step: take a base64
 * image + an array of bounding boxes (in 0-1 normalized
 * coordinates), return an array of base64 crops.
 *
 * Why normalized bboxes: the layout-detection LLM call returns
 * coordinates relative to the image dimensions (no need to know
 * the source's pixel size). Crops are computed via sharp, which
 * works on the actual decoded image regardless of input scale.
 */

import sharp from "sharp";

/**
 * Bounding box in NORMALIZED image coordinates.
 * - Origin (0, 0) is the top-left of the image.
 * - All values in [0, 1]; x + w and y + h must also be ≤ 1.
 * - (x, y) is the top-left corner of the box.
 * - (w, h) is the box's width and height.
 *
 * The layout-detection LLM call returns these directly; the
 * cropping step converts to pixel coords via the decoded image's
 * native dimensions.
 */
export type NormalizedBBox = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type PlayLayoutEntry = {
  /** The coach's literal play label (e.g. "Noah", "67"). Passed
   *  through to per-crop pass-1 so the model uses it as the
   *  fence title — saves one redundant identification step. */
  label: string;
  bbox: NormalizedBBox;
};

export type CroppedPlay = {
  label: string;
  /** Base64-encoded crop, ready to feed back into the LLM as a
   *  per-play image block. */
  base64: string;
  /** Media type of the crop. Always matches the source's media
   *  type unless re-encoding occurred (we don't re-encode). */
  mediaType: string;
  /** Pixel dimensions of the crop, for logging / debugging. */
  width: number;
  height: number;
};

/**
 * Validate a bbox: all components in [0, 1], no overrun.
 * Returns an error string when invalid, null when ok.
 */
export function validateBBox(bbox: NormalizedBBox): string | null {
  if (
    typeof bbox.x !== "number" ||
    typeof bbox.y !== "number" ||
    typeof bbox.w !== "number" ||
    typeof bbox.h !== "number"
  ) {
    return "bbox fields must be numbers";
  }
  if (bbox.x < 0 || bbox.y < 0 || bbox.w <= 0 || bbox.h <= 0) {
    return "bbox values must be ≥ 0 (w, h must be > 0)";
  }
  if (bbox.x + bbox.w > 1.000001 || bbox.y + bbox.h > 1.000001) {
    // Allow tiny floating-point overrun (the LLM might emit
    // 0.5 + 0.5 → 1.0000000004); clamp at crop time.
    return "bbox extends past image bounds (x+w > 1 or y+h > 1)";
  }
  return null;
}

/**
 * Crop a base64-encoded image into N per-play crops.
 *
 * @param base64 Base64-encoded image data (no `data:` URL prefix).
 * @param mediaType Media type of the source (e.g. "image/jpeg").
 * @param layout Array of {label, bbox} entries. Empty array
 *               returns []; invalid bboxes are skipped with a
 *               console warning (the whole call doesn't fail —
 *               we still want valid crops).
 * @returns Array of CroppedPlay, one per valid input entry.
 *
 * Error handling: if sharp throws (corrupt image, unsupported
 * format), the caller catches and falls back to the full-image
 * pipeline. Don't add try/catch here — the throw is information.
 */
export async function cropPlaysFromSheet(
  base64: string,
  mediaType: string,
  layout: ReadonlyArray<PlayLayoutEntry>,
): Promise<CroppedPlay[]> {
  if (layout.length === 0) return [];

  const sourceBuffer = Buffer.from(base64, "base64");
  // Read metadata once; the sharp instance is stateful so we re-
  // create per crop to avoid clone bookkeeping. Each .extract()
  // computes pixel coords from the SAME source dimensions.
  const metadata = await sharp(sourceBuffer).metadata();
  const sourceWidth = metadata.width;
  const sourceHeight = metadata.height;
  if (!sourceWidth || !sourceHeight) {
    throw new Error("could not read source image dimensions");
  }

  const crops: CroppedPlay[] = [];
  for (const entry of layout) {
    const validation = validateBBox(entry.bbox);
    if (validation) {
      // Skip individual invalid bboxes; the rest of the layout
      // still produces useful crops. Logged so the LLM-detection
      // miss is visible in server logs.
      console.warn(`[image-crop] skipping "${entry.label}": ${validation}`);
      continue;
    }

    // Convert normalized [0,1] → pixel coords. Clamp w/h so the
    // tiny float overrun mentioned above (0.5+0.5 = 1.0000000004)
    // doesn't trip sharp's bounds check.
    const left = Math.max(0, Math.floor(entry.bbox.x * sourceWidth));
    const top = Math.max(0, Math.floor(entry.bbox.y * sourceHeight));
    const rawWidth = Math.floor(entry.bbox.w * sourceWidth);
    const rawHeight = Math.floor(entry.bbox.h * sourceHeight);
    const width = Math.max(1, Math.min(rawWidth, sourceWidth - left));
    const height = Math.max(1, Math.min(rawHeight, sourceHeight - top));

    const croppedBuffer = await sharp(sourceBuffer)
      .extract({ left, top, width, height })
      .toBuffer();

    crops.push({
      label: entry.label,
      base64: croppedBuffer.toString("base64"),
      mediaType,
      width,
      height,
    });
  }

  return crops;
}
