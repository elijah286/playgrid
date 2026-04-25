#!/usr/bin/env node
/**
 * Generate the source PNGs that @capacitor/assets consumes to produce
 * iOS/Android app icons + splash screens.
 *
 * Inputs:  public/brand/xogridmaker_monogram.svg (the X-O mark)
 * Outputs:
 *   assets/icon-only.png         1024x1024  white bg, monogram centered
 *   assets/icon-foreground.png   1024x1024  transparent, monogram only
 *   assets/icon-background.png   1024x1024  solid white (Android adaptive)
 *   assets/splash.png            2732x2732  white bg, monogram centered
 *   assets/splash-dark.png       2732x2732  dark surface bg, monogram centered
 *
 * After running this, run `npx capacitor-assets generate` (or
 * `npm run cap:assets`) to fan out into ios/ and android/.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const monogramPath = resolve(root, "public/brand/xogridmaker_monogram.svg");
const outDir = resolve(root, "assets");

const LIGHT_BG = "#FFFFFF";
const DARK_BG = "#111318"; // matches --color-surface-dark from globals.css

async function loadMonogramSvg() {
  return readFile(monogramPath, "utf-8");
}

/** Render the monogram into a square PNG of the given size, centered with
 *  padding so it doesn't kiss the edges. Background is either a solid color
 *  or transparent. */
async function renderSquare({ size, padding, background }) {
  const svg = await loadMonogramSvg();
  const inner = Math.round(size - padding * 2);
  const monogram = await sharp(Buffer.from(svg))
    .resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

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

  return base.composite([{ input: monogram, gravity: "center" }]).png().toBuffer();
}

async function main() {
  await mkdir(outDir, { recursive: true });

  const tasks = [
    { file: "icon-only.png", size: 1024, padding: 160, background: LIGHT_BG },
    { file: "icon-foreground.png", size: 1024, padding: 220, background: "transparent" },
    { file: "icon-background.png", size: 1024, padding: 0, background: LIGHT_BG },
    { file: "splash.png", size: 2732, padding: 900, background: LIGHT_BG },
    { file: "splash-dark.png", size: 2732, padding: 900, background: DARK_BG },
  ];

  for (const t of tasks) {
    const buf = await renderSquare(t);
    await writeFile(resolve(outDir, t.file), buf);
    console.log(`✓ ${t.file} (${t.size}x${t.size})`);
  }

  console.log("\nNext: npm run cap:assets");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
