#!/usr/bin/env node
/**
 * Build the 1024x500 Google Play feature graphic from brand assets.
 *
 * Renders an HTML layout in Playwright (system fonts, identical text
 * rendering across machines) and screenshots it at 1024x500. Output
 * lands at public/marketing/play-store/feature-graphic-1024x500.png.
 *
 * Usage:
 *   node scripts/build-feature-graphic.mjs
 */

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const outPath = resolve(root, "public/marketing/play-store/feature-graphic-1024x500.png");

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<style>
  html, body { margin: 0; padding: 0; width: 1024px; height: 500px; overflow: hidden; }
  body {
    background: linear-gradient(135deg, #06255E 0%, #0B3D99 100%);
    font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif;
    color: #fff;
    display: flex;
    align-items: center;
    padding: 0 64px;
    box-sizing: border-box;
    position: relative;
  }
  /* faint horizontal field-line decoration */
  body::before {
    content: "";
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(transparent 99%, rgba(255,255,255,0.05) 99%),
      linear-gradient(90deg, transparent 99%, rgba(255,255,255,0.05) 99%);
    background-size: 100% 50px, 50px 100%;
    pointer-events: none;
  }
  .monogram {
    flex: 0 0 auto;
    width: 200px;
    height: 200px;
    margin-right: 56px;
    position: relative;
    z-index: 1;
  }
  .copy {
    flex: 1;
    position: relative;
    z-index: 1;
  }
  .wordmark {
    font-style: italic;
    font-weight: 800;
    font-size: 72px;
    letter-spacing: -2px;
    line-height: 1;
    margin: 0 0 16px;
  }
  .wordmark .x { color: #1769FF; }
  .wordmark .o { color: #95CC1F; }
  .wordmark .rest { color: #fff; }
  .tagline {
    font-size: 30px;
    font-weight: 500;
    line-height: 1.2;
    margin: 0 0 10px;
    color: #fff;
  }
  .subhead {
    font-size: 18px;
    font-weight: 400;
    color: rgba(255,255,255,0.7);
    margin: 0;
    letter-spacing: 0.2px;
  }
</style>
</head>
<body>
  <svg class="monogram" viewBox="0 0 900 380" xmlns="http://www.w3.org/2000/svg">
    <line stroke="#1769FF" stroke-linecap="square" stroke-width="52" x1="250" x2="380" y1="100" y2="240" />
    <line stroke="#1769FF" stroke-linecap="square" stroke-width="52" x1="380" x2="250" y1="100" y2="240" />
    <rect fill="none" height="130" rx="42" ry="42" stroke="#95CC1F" stroke-width="38" width="170" x="480" y="105" />
  </svg>
  <div class="copy">
    <h1 class="wordmark">
      <span class="x">x</span><span class="o">o</span><span class="rest">gridmaker</span>
    </h1>
    <p class="tagline">Football playbooks for coaches.</p>
    <p class="subhead">Build, share, and call plays from the sideline.</p>
  </div>
</body>
</html>`;

async function main() {
  await mkdir(dirname(outPath), { recursive: true });

  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1024, height: 500 },
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  await page.setContent(html, { waitUntil: "load" });
  await page.screenshot({
    path: outPath,
    type: "png",
    clip: { x: 0, y: 0, width: 1024, height: 500 },
    omitBackground: false,
  });
  await browser.close();
  console.log(`Wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
