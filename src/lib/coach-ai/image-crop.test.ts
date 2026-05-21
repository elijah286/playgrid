/**
 * Tests for the per-play image cropping utility. Uses sharp to
 * synthesize a 4-quadrant test image (each quadrant a distinct
 * solid color), then asserts the cropping function pulls the
 * right colors out of each quadrant.
 *
 * Why solid-color quadrants: if cropPlaysFromSheet has the bbox
 * math wrong, the dominant color of the crop won't match the
 * expected quadrant — a precise signal of geometric drift that
 * doesn't depend on any specific image content.
 */

import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { cropPlaysFromSheet, validateBBox } from "./image-crop";

/**
 * Generate a 400x400 PNG with 4 colored quadrants:
 *   top-left = red, top-right = green
 *   bottom-left = blue, bottom-right = yellow
 *
 * Returned as base64 to mirror how Cal receives images.
 */
async function makeQuadrantImage(): Promise<string> {
  // sharp can compose multiple images on a background. Build
  // each quadrant as a 200x200 solid rectangle and overlay onto
  // a 400x400 canvas.
  const red = await sharp({
    create: { width: 200, height: 200, channels: 3, background: { r: 255, g: 0, b: 0 } },
  })
    .png()
    .toBuffer();
  const green = await sharp({
    create: { width: 200, height: 200, channels: 3, background: { r: 0, g: 255, b: 0 } },
  })
    .png()
    .toBuffer();
  const blue = await sharp({
    create: { width: 200, height: 200, channels: 3, background: { r: 0, g: 0, b: 255 } },
  })
    .png()
    .toBuffer();
  const yellow = await sharp({
    create: { width: 200, height: 200, channels: 3, background: { r: 255, g: 255, b: 0 } },
  })
    .png()
    .toBuffer();

  const composed = await sharp({
    create: { width: 400, height: 400, channels: 3, background: { r: 0, g: 0, b: 0 } },
  })
    .composite([
      { input: red, left: 0, top: 0 },
      { input: green, left: 200, top: 0 },
      { input: blue, left: 0, top: 200 },
      { input: yellow, left: 200, top: 200 },
    ])
    .png()
    .toBuffer();

  return composed.toString("base64");
}

/**
 * Read the dominant color of a base64-encoded crop. Used to
 * verify each cropped quadrant carries its expected color.
 *
 * We sample the center pixel; for a solid-color crop this is
 * sufficient and avoids averaging artifacts.
 */
async function dominantColor(base64: string): Promise<{ r: number; g: number; b: number }> {
  const buffer = Buffer.from(base64, "base64");
  const meta = await sharp(buffer).metadata();
  const { data, info } = await sharp(buffer)
    .raw()
    .toBuffer({ resolveWithObject: true });
  // Center pixel index in the raw RGB buffer.
  const cx = Math.floor((meta.width ?? info.width) / 2);
  const cy = Math.floor((meta.height ?? info.height) / 2);
  const stride = info.width * info.channels;
  const idx = cy * stride + cx * info.channels;
  return { r: data[idx], g: data[idx + 1], b: data[idx + 2] };
}

describe("cropPlaysFromSheet — geometric correctness", () => {
  it("crops each quadrant of a 4-color image into the right color", async () => {
    const sourceB64 = await makeQuadrantImage();
    const crops = await cropPlaysFromSheet(sourceB64, "image/png", [
      { label: "TL", bbox: { x: 0, y: 0, w: 0.5, h: 0.5 } },
      { label: "TR", bbox: { x: 0.5, y: 0, w: 0.5, h: 0.5 } },
      { label: "BL", bbox: { x: 0, y: 0.5, w: 0.5, h: 0.5 } },
      { label: "BR", bbox: { x: 0.5, y: 0.5, w: 0.5, h: 0.5 } },
    ]);

    expect(crops).toHaveLength(4);

    // Crop pixel size sanity: each quadrant is half the source's
    // 400x400, so 200x200. Confirms the bbox-to-pixel conversion
    // round-trips correctly.
    for (const c of crops) {
      expect(c.width).toBe(200);
      expect(c.height).toBe(200);
    }

    // Each crop should carry the expected dominant color.
    const tl = await dominantColor(crops[0].base64);
    const tr = await dominantColor(crops[1].base64);
    const bl = await dominantColor(crops[2].base64);
    const br = await dominantColor(crops[3].base64);

    expect(tl).toMatchObject({ r: 255, g: 0, b: 0 }); // red
    expect(tr).toMatchObject({ r: 0, g: 255, b: 0 }); // green
    expect(bl).toMatchObject({ r: 0, g: 0, b: 255 }); // blue
    expect(br).toMatchObject({ r: 255, g: 255, b: 0 }); // yellow
  });

  it("preserves labels and media type on each crop", async () => {
    const sourceB64 = await makeQuadrantImage();
    const crops = await cropPlaysFromSheet(sourceB64, "image/png", [
      { label: "Noah", bbox: { x: 0, y: 0, w: 0.5, h: 0.5 } },
      { label: "67", bbox: { x: 0.5, y: 0, w: 0.5, h: 0.5 } },
    ]);
    expect(crops.map((c) => c.label)).toEqual(["Noah", "67"]);
    for (const c of crops) {
      expect(c.mediaType).toBe("image/png");
      expect(c.base64.length).toBeGreaterThan(0);
    }
  });

  it("returns empty array when layout is empty", async () => {
    const sourceB64 = await makeQuadrantImage();
    const crops = await cropPlaysFromSheet(sourceB64, "image/png", []);
    expect(crops).toEqual([]);
  });

  it("skips invalid bboxes but still returns valid ones", async () => {
    const sourceB64 = await makeQuadrantImage();
    const crops = await cropPlaysFromSheet(sourceB64, "image/png", [
      { label: "Valid", bbox: { x: 0, y: 0, w: 0.5, h: 0.5 } },
      { label: "Negative-w", bbox: { x: 0, y: 0, w: -0.1, h: 0.5 } },
      { label: "Overrun", bbox: { x: 0.9, y: 0.9, w: 0.5, h: 0.5 } },
    ]);
    // Only the valid one survives; the two malformed bboxes are
    // skipped (validateBBox catches them) so the LLM-detection
    // can be partially wrong without aborting the whole turn.
    expect(crops).toHaveLength(1);
    expect(crops[0].label).toBe("Valid");
  });

  it("handles floating-point overrun (0.5 + 0.5 = 1.0000000004)", async () => {
    // The LLM-detection LLM call may return bboxes whose x+w is
    // 1.0000000004 due to FP arithmetic. validateBBox tolerates
    // this; the crop clamps at pixel level.
    const sourceB64 = await makeQuadrantImage();
    const crops = await cropPlaysFromSheet(sourceB64, "image/png", [
      { label: "OverrunByEpsilon", bbox: { x: 0.5, y: 0.5, w: 0.50000001, h: 0.50000001 } },
    ]);
    expect(crops).toHaveLength(1);
    // 200x200 bottom-right quadrant; tolerate 1px clamp slop.
    expect(crops[0].width).toBeGreaterThanOrEqual(199);
    expect(crops[0].height).toBeGreaterThanOrEqual(199);
  });
});

describe("validateBBox", () => {
  it("accepts well-formed bboxes", () => {
    expect(validateBBox({ x: 0, y: 0, w: 1, h: 1 })).toBeNull();
    expect(validateBBox({ x: 0.25, y: 0.25, w: 0.5, h: 0.5 })).toBeNull();
  });

  it("rejects negative coords", () => {
    expect(validateBBox({ x: -0.1, y: 0, w: 0.5, h: 0.5 })).not.toBeNull();
    expect(validateBBox({ x: 0, y: -0.1, w: 0.5, h: 0.5 })).not.toBeNull();
  });

  it("rejects zero or negative size", () => {
    expect(validateBBox({ x: 0, y: 0, w: 0, h: 0.5 })).not.toBeNull();
    expect(validateBBox({ x: 0, y: 0, w: 0.5, h: -0.1 })).not.toBeNull();
  });

  it("rejects bboxes that overrun the image (beyond FP tolerance)", () => {
    // x + w = 1.2 → clearly past 1.0, not a float-rounding case.
    expect(validateBBox({ x: 0.5, y: 0, w: 0.7, h: 0.5 })).not.toBeNull();
  });
});
