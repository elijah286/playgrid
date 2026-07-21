#!/usr/bin/env node
/**
 * Generate the source PNGs that @capacitor/assets consumes to produce
 * iOS/Android app icons + splash screens, plus the iOS-18 dark + tinted
 * AppIcon variants (which @capacitor/assets v3.0.5 does not emit).
 *
 * Inputs:  public/brand/xogridmaker_monogram.svg (the X-O mark, icons)
 *          Inter (system font) rendered live for the splash wordmark, matching
 *          the launch animation — requires Inter installed (assertInterFont)
 * Outputs:
 *   assets/icon-only.png         1024x1024  white bg, monogram centered
 *   assets/icon-foreground.png   1024x1024  transparent, monogram only
 *   assets/icon-background.png   1024x1024  solid white (Android adaptive)
 *   assets/splash.png            2732x2732  light ground + blooms, wordmark
 *   assets/splash-dark.png       2732x2732  dark ground + blooms, wordmark
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

const SPLASH_LIGHT_BG = "#FAFAF8";
const SPLASH_DARK_BG = "#0F1115"; // matches the launch overlay's dark ground
// Trimmed wordmark width as a fraction of the square. The splash is shown
// scaleAspectFill, so on a portrait phone only the centre ~46% of the width
// survives the crop; 0.36 fills most of that band while keeping safe margins
// on the tallest phones. NOTE: this is the tight *ink* width — the wordmark is
// trimmed to its glyph bounds, not a padded SVG — so it is smaller than the
// raw fraction suggests.
const WORDMARK_FRAC = 0.36;

// The wordmark drawn in the app's own font — Inter, italic (librsvg
// synthesises the oblique), weight 800 — the exact treatment the launch
// animation uses, with the x and o in brand blue/green and "gridmaker" tinted
// for the ground. We render live text rather than the brand's
// xogridmaker_wordmark.svg (a DejaVu/Arial export with hard-coded letter gaps)
// so the spacing matches the animation. assertInterFont() guards the render.
function wordmarkInterSvg(gridColor) {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="3200" height="760" viewBox="0 0 3200 760">` +
    `<text x="60" y="470" font-family="Inter, sans-serif" font-style="italic" font-weight="800" font-size="300">` +
    `<tspan fill="#1769FF">x</tspan><tspan fill="#95CC1F">o</tspan><tspan fill="${gridColor}">gridmaker</tspan>` +
    `</text></svg>`
  );
}

// Fail loudly if Inter is not installed — otherwise the wordmark silently falls
// back to DejaVu and the gappy spacing returns. Inter renders ~15% narrower
// than DejaVu at weight 800; if the two widths match, "Inter" resolved to the
// DejaVu fallback.
async function assertInterFont() {
  const widthOf = async (family) => {
    const buf = await sharp(
      Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="3200" height="400">` +
          `<text x="10" y="300" font-family="${family}" font-weight="800" font-size="300">xogridmaker</text></svg>`,
      ),
    )
      .trim()
      .png()
      .toBuffer();
    return (await sharp(buf).metadata()).width;
  };
  const [wInter, wDejaVu] = await Promise.all([
    widthOf("Inter"),
    widthOf("DejaVu Sans"),
  ]);
  if (Math.abs(wInter - wDejaVu) / wDejaVu < 0.04) {
    throw new Error(
      "Inter font not found — the splash wordmark would fall back to DejaVu " +
        "(gappy spacing). Install Inter (macOS: `brew install --cask font-inter`) " +
        "and re-run.",
    );
  }
}

/** Render the launch splash: the wordmark centred on the app's ground colour
 *  with the same soft blue/green blooms as the in-app launch animation's
 *  resolved frame. `dark` swaps the navy "gridmaker" for a light tint so it
 *  reads on the dark ground, and warms the blooms up to match. */
async function renderSplashFrame({ size, dark }) {
  const ground = dark ? SPLASH_DARK_BG : SPLASH_LIGHT_BG;
  const blueOp = dark ? 0.42 : 0.16;
  const greenOp = dark ? 0.38 : 0.14;
  const bg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
      `<defs>` +
      `<radialGradient id="b" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#1769FF" stop-opacity="${blueOp}"/><stop offset="100%" stop-color="#1769FF" stop-opacity="0"/></radialGradient>` +
      `<radialGradient id="g" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#95CC1F" stop-opacity="${greenOp}"/><stop offset="100%" stop-color="#95CC1F" stop-opacity="0"/></radialGradient>` +
      `</defs>` +
      `<rect width="${size}" height="${size}" fill="${ground}"/>` +
      `<circle cx="${size * 0.32}" cy="${size * 0.4}" r="${size * 0.55}" fill="url(#b)"/>` +
      `<circle cx="${size * 0.7}" cy="${size * 0.62}" r="${size * 0.55}" fill="url(#g)"/>` +
      `</svg>`,
  );

  const gridColor = dark ? "#E4E9F2" : "#06255E";
  // Trim to the glyphs' ink bounds first, in its own pass, so WORDMARK_FRAC
  // controls the visible text width directly.
  const trimmed = await sharp(Buffer.from(wordmarkInterSvg(gridColor)))
    .trim()
    .png()
    .toBuffer();
  const word = await sharp(trimmed)
    .resize(Math.round(size * WORDMARK_FRAC), null, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  const base = await sharp(bg).png().toBuffer();
  return sharp(base)
    .composite([{ input: word, gravity: "center" }])
    .png()
    .toBuffer();
}

async function main() {
  await mkdir(outDir, { recursive: true });

  const tasks = [
    { file: "icon-only.png", size: 1024, padding: 160, background: LIGHT_BG },
    { file: "icon-foreground.png", size: 1024, padding: 220, background: "transparent" },
    { file: "icon-background.png", size: 1024, background: LIGHT_BG, solid: true },
  ];

  for (const t of tasks) {
    const buf = await renderSquare(t);
    await writeFile(resolve(outDir, t.file), buf);
    console.log(`✓ ${t.file} (${t.size}x${t.size})`);
  }

  // Launch splashes: the wordmark (live Inter) on the animation's resolved
  // ground. Guard the font first so a missing Inter fails loudly.
  await assertInterFont();
  for (const { file, dark } of [
    { file: "splash.png", dark: false },
    { file: "splash-dark.png", dark: true },
  ]) {
    const buf = await renderSplashFrame({ size: 2732, dark });
    await writeFile(resolve(outDir, file), buf);
    console.log(`✓ ${file} (2732x2732 wordmark splash)`);
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
