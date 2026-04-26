#!/usr/bin/env node
/**
 * Capture App Store + Play Store screenshots in every required size.
 *
 * Apple requires:
 *   - 6.7" iPhone (1290x2796)  — required for new submissions
 *   - 6.5" iPhone (1284x2778)  — strongly recommended
 *   - 12.9" iPad  (2048x2732)  — required if you support iPad
 *
 * Google requires:
 *   - Phone     (1080x1920+, 16:9 to 9:18.5) — at least 2, up to 8
 *   - 7" tablet (recommended)
 *   - 10" tablet (recommended)
 *
 * For each viewport we capture a guided tour of the marketing-meaningful
 * screens: examples shelf → playbook → play viewer → game mode → offline
 * library. Output is a tight, repeatable set of PNGs ready to upload.
 *
 * Always runs unauthenticated on the public examples so the screens
 * match what a brand-new visitor (and store reviewer) sees.
 *
 * Usage:
 *   BASE_URL=http://localhost:3456 node scripts/capture-store-screenshots.mjs
 *
 * Output:
 *   public/marketing/store/{platform}/{device}/{nn}-{slug}.png
 */

import { chromium } from "playwright";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3456";
const OUT_ROOT = path.resolve("public/marketing/store");

// Each device produces one full set of screenshots. `viewport` is the CSS
// pixel size we render at; `dpr` multiplies up to the physical pixels the
// store expects. On Apple, 1290×2796 = 430×932 @ 3x.
const DEVICES = [
  // --- iOS ---
  {
    platform: "ios",
    slug: "iphone-6_7",
    label: "iPhone 6.7\" (1290×2796)",
    viewport: { width: 430, height: 932 },
    dpr: 3,
  },
  {
    platform: "ios",
    slug: "iphone-6_5",
    label: "iPhone 6.5\" (1284×2778)",
    viewport: { width: 414, height: 896 },
    dpr: 3,
  },
  {
    platform: "ios",
    slug: "ipad-12_9",
    label: "iPad 12.9\" (2048×2732)",
    viewport: { width: 1024, height: 1366 },
    dpr: 2,
  },
  // --- Android ---
  {
    platform: "android",
    slug: "phone",
    label: "Android phone (1080×2400)",
    viewport: { width: 360, height: 800 },
    dpr: 3,
  },
  {
    platform: "android",
    slug: "tablet-7",
    label: "Android 7\" tablet (1200×1920)",
    viewport: { width: 600, height: 960 },
    dpr: 2,
  },
  {
    platform: "android",
    slug: "tablet-10",
    label: "Android 10\" tablet (1600×2560)",
    viewport: { width: 800, height: 1280 },
    dpr: 2,
  },
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function shot(page, dir, name) {
  const file = path.join(dir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log("  ✓", file);
}

/**
 * Run one device through the same script of screens. Each function in
 * the steps list captures one frame; if a step throws (e.g. the demo
 * playbook layout drifts), we skip and continue so a single broken step
 * doesn't trash the whole run.
 */
async function captureDevice(device) {
  const outDir = path.join(OUT_ROOT, device.platform, device.slug);
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: device.viewport,
    deviceScaleFactor: device.dpr,
    isMobile: device.platform !== "ios" || device.slug.startsWith("iphone"),
    hasTouch: true,
  });
  const page = await ctx.newPage();

  console.log(`\n=== ${device.label} ===`);

  const steps = [
    // 1) Bookshelf — the brand-meaningful landing for new coaches.
    async () => {
      await page.goto(`${BASE_URL}/examples`, { waitUntil: "domcontentloaded" });
      await sleep(800);
      await shot(page, outDir, "01-examples-shelf");
    },

    // 2) An open playbook — shows the play grid.
    async () => {
      const firstHref = await page
        .locator('a[href^="/playbooks/"]')
        .first()
        .getAttribute("href");
      if (!firstHref) throw new Error("No example playbooks on /examples");
      await page.goto(`${BASE_URL}${firstHref}`, { waitUntil: "domcontentloaded" });
      await sleep(900);
      await shot(page, outDir, "02-playbook-overview");
    },

    // 3) The play editor / viewer — the product's signature screen.
    async () => {
      const firstPlay = await page
        .locator('a[href*="/plays/"][href*="/edit"]')
        .first()
        .getAttribute("href");
      if (!firstPlay) throw new Error("No plays in playbook");
      await page.goto(`${BASE_URL}${firstPlay}`, { waitUntil: "domcontentloaded" });
      await sleep(1100);
      await shot(page, outDir, "03-play-editor");
    },

    // 4) Print preview — wristbands are a real coach hook.
    async () => {
      const playbookUrl = page.url().split("/plays/")[0];
      await page.goto(`${playbookUrl}/print`, { waitUntil: "domcontentloaded" });
      await sleep(1000);
      await shot(page, outDir, "04-printable-playsheet");
    },
  ];

  for (const step of steps) {
    try {
      await step();
    } catch (e) {
      console.warn("  ⚠ step failed:", e.message);
    }
  }

  await page.close();
  await ctx.close();
  await browser.close();
}

async function run() {
  await mkdir(OUT_ROOT, { recursive: true });
  for (const device of DEVICES) {
    await captureDevice(device);
  }
  console.log("\nDone. Upload PNGs from", OUT_ROOT);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
