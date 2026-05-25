#!/usr/bin/env node
/**
 * Generate the source PNGs that @capacitor/assets consumes to produce
 * iOS/Android app icons + splash screens, plus the iOS-18 dark + tinted
 * AppIcon variants (which @capacitor/assets v3.0.5 does not emit).
 *
 * Inputs:  public/brand/xogridmaker_monogram.svg (the X-O mark)
 * Outputs:
 *   assets/icon-only.png         1024x1024  white bg, monogram centered
 *   assets/icon-foreground.png   1024x1024  transparent, monogram only
 *   assets/icon-background.png   1024x1024  solid white (Android adaptive)
 *   assets/splash.png            2732x2732  white bg, monogram centered
 *   assets/splash-dark.png       2732x2732  dark surface bg, monogram centered
 *   ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x-dark.png
 *                                1024x1024  transparent bg, brand colors
 *                                (iOS paints a dark glass base behind)
 *   ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x-tinted.png
 *                                1024x1024  transparent bg, all-white XO
 *                                (iOS applies wallpaper tint to the mask)
 *
 * After running this, run `npx capacitor-assets generate` (or
 * `npm run cap:assets`) to fan out the icon-* and splash-* PNGs into ios/
 * and android/. The dark/tinted variants are written directly to the
 * AppIcon.appiconset above and do not need capacitor-assets.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const monogramPath = resolve(root, "public/brand/xogridmaker_monogram.svg");
const outDir = resolve(root, "assets");
const appIconDir = resolve(
  root,
  "ios/App/App/Assets.xcassets/AppIcon.appiconset",
);

const LIGHT_BG = "#FFFFFF";
const DARK_BG = "#111318"; // matches --color-surface-dark from globals.css

async function loadMonogramSvg() {
  return readFile(monogramPath, "utf-8");
}

/** Render the monogram into a square PNG of the given size, centered with
 *  padding so it doesn't kiss the edges. Background is either a solid color
 *  or transparent. `svgOverride` lets callers swap colors (e.g. the tinted
 *  variant uses an all-white monogram). When `solid` is true, the monogram
 *  is omitted entirely — used for Android's adaptive-icon background layer,
 *  which must be a flat color so it doesn't double-stamp with the foreground. */
async function renderSquare({ size, padding, background, svgOverride, solid }) {
  const base = sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background:
        background === "transparent"
          ? { r: 0, g: 0, b: 0, alpha: 0 }
          : background,
    },
  });

  if (solid) {
    return base.png().toBuffer();
  }

  const svg = svgOverride ?? (await loadMonogramSvg());
  const inner = Math.round(size - padding * 2);
  const monogram = await sharp(Buffer.from(svg))
    .resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  return base.composite([{ input: monogram, gravity: "center" }]).png().toBuffer();
}

async function main() {
  await mkdir(outDir, { recursive: true });

  const tasks = [
    { file: "icon-only.png", size: 1024, padding: 160, background: LIGHT_BG },
    { file: "icon-foreground.png", size: 1024, padding: 220, background: "transparent" },
    { file: "icon-background.png", size: 1024, background: LIGHT_BG, solid: true },
    { file: "splash.png", size: 2732, padding: 900, background: LIGHT_BG },
    { file: "splash-dark.png", size: 2732, padding: 900, background: DARK_BG },
  ];

  for (const t of tasks) {
    const buf = await renderSquare(t);
    await writeFile(resolve(outDir, t.file), buf);
    console.log(`✓ ${t.file} (${t.size}x${t.size})`);
  }

  // iOS 18+ dark + tinted AppIcon variants. Same XO geometry and scale as
  // the light icon (padding 160 mirrors icon-only.png) so the mark sits in
  // the same spot when the system swaps appearances.
  const monogramSvg = await loadMonogramSvg();
  // For tinted, the system applies a wallpaper-derived tint to the alpha
  // mask, so we collapse both brand colors to white. Anything non-white
  // would shift the luminance and produce an off-tint result.
  const tintedSvg = monogramSvg
    .replaceAll("#1769FF", "#FFFFFF")
    .replaceAll("#95CC1F", "#FFFFFF");

  const iosVariants = [
    {
      file: "AppIcon-512@2x-dark.png",
      svgOverride: monogramSvg,
    },
    {
      file: "AppIcon-512@2x-tinted.png",
      svgOverride: tintedSvg,
    },
  ];

  for (const v of iosVariants) {
    const buf = await renderSquare({
      size: 1024,
      padding: 160,
      background: "transparent",
      svgOverride: v.svgOverride,
    });
    await writeFile(resolve(appIconDir, v.file), buf);
    console.log(`✓ ios/.../${v.file} (1024x1024)`);
  }

  console.log("\nNext: npm run cap:assets");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
