#!/usr/bin/env node
/**
 * Capture real screenshots of the app at phone/tablet/desktop viewports for
 * use on the /learn-more marketing page. Writes PNGs to
 * public/marketing/screens/.
 *
 * Usage (with the dev server already running on BASE_URL):
 *   BASE_URL=http://localhost:3456 node scripts/capture-marketing-screenshots.mjs
 */

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const OUT_DIR = path.resolve("public/marketing/screens");

const DEVICE_PRESETS = {
  phone: { width: 390, height: 844, dsf: 2 },
  tablet: { width: 1024, height: 768, dsf: 2 },
  desktop: { width: 1440, height: 900, dsf: 2 },
};

async function shot(page, name) {
  const file = path.join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log("  ✓", file);
}

async function gotoFirstExamplePlaybook(page) {
  await page.goto(`${BASE_URL}/examples`, { waitUntil: "networkidle" });
  // The first example book tile is a link to /playbooks/[id]. Click it.
  const firstTile = page.locator('a[href^="/playbooks/"]').first();
  await firstTile.waitFor({ timeout: 10000 });
  const href = await firstTile.getAttribute("href");
  if (!href) throw new Error("No example playbook tile found");
  return href;
}

async function run() {
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();

  for (const [deviceName, viewport] of Object.entries(DEVICE_PRESETS)) {
    console.log(`\n== ${deviceName} (${viewport.width}x${viewport.height}) ==`);
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: viewport.dsf,
    });
    const page = await context.newPage();

    // Find a real example playbook
    const playbookHref = await gotoFirstExamplePlaybook(page);
    await shot(page, `${deviceName}-examples`);

    // Open the example playbook
    await page.goto(`${BASE_URL}${playbookHref}`, { waitUntil: "networkidle" });
    // Give any client-side animations a moment to settle
    await page.waitForTimeout(800);
    await shot(page, `${deviceName}-playbook`);

    // Find a play link inside the playbook and open it in visitor mode
    const firstPlayLink = page.locator('a[href*="/plays/"]').first();
    if (await firstPlayLink.count()) {
      const playHref = await firstPlayLink.getAttribute("href");
      if (playHref) {
        await page.goto(`${BASE_URL}${playHref}`, { waitUntil: "networkidle" });
        await page.waitForTimeout(1000);
        await shot(page, `${deviceName}-play`);
      }
    }

    await context.close();
  }

  await browser.close();
  console.log("\nDone.");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
