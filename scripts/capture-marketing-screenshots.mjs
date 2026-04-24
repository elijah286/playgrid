#!/usr/bin/env node
/**
 * Capture real screenshots of the app at phone/tablet/desktop viewports for
 * use on the /learn-more marketing page. Writes PNGs to
 * public/marketing/screens/.
 *
 * Read-only: navigates and screenshots. Never clicks Save / Edit / Delete
 * and never submits forms other than the login form (when creds provided).
 *
 * Modes:
 *   Unauthenticated (default): captures public /examples playbooks.
 *   Authenticated: pass CAPTURE_EMAIL + CAPTURE_PASSWORD to sign in and
 *     use your own first non-archived playbook instead.
 *
 * Usage:
 *   BASE_URL=http://localhost:3456 node scripts/capture-marketing-screenshots.mjs
 *   BASE_URL=http://localhost:3456 CAPTURE_EMAIL=you@x.com CAPTURE_PASSWORD=xxx \
 *     node scripts/capture-marketing-screenshots.mjs
 */

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const OUT_DIR = path.resolve("public/marketing/screens");
const EMAIL = process.env.CAPTURE_EMAIL;
const PASSWORD = process.env.CAPTURE_PASSWORD;
const AUTHED = Boolean(EMAIL && PASSWORD);

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

async function signIn(page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
  await page.locator('input[type="email"]').fill(EMAIL);
  // Submit email form (either Enter or the first submit button).
  await page.locator('input[type="email"]').press("Enter");
  await page.locator('input[type="password"]').waitFor({ timeout: 10000 });
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('input[type="password"]').press("Enter");
  // Wait for redirect to /home.
  await page.waitForURL((u) => u.pathname === "/home" || u.pathname === "/", {
    timeout: 15000,
  });
  await page.waitForTimeout(500);
}

async function firstAuthedPlaybookHref(page) {
  await page.goto(`${BASE_URL}/playbooks`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  const tile = page.locator('a[href^="/playbooks/"]').first();
  await tile.waitFor({ timeout: 10000 });
  const href = await tile.getAttribute("href");
  if (!href) throw new Error("No playbooks found on this account");
  return href;
}

async function firstExamplePlaybookHref(page) {
  await page.goto(`${BASE_URL}/examples`, { waitUntil: "networkidle" });
  const tile = page.locator('a[href^="/playbooks/"]').first();
  await tile.waitFor({ timeout: 10000 });
  const href = await tile.getAttribute("href");
  if (!href) throw new Error("No example playbooks published");
  return href;
}

async function captureAtViewport(browser, deviceName, viewport) {
  console.log(`\n== ${deviceName} (${viewport.width}x${viewport.height})${AUTHED ? " [authed]" : ""} ==`);
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.dsf,
  });
  const page = await context.newPage();

  if (AUTHED) await signIn(page);

  const playbookHref = AUTHED
    ? await firstAuthedPlaybookHref(page)
    : await firstExamplePlaybookHref(page);

  // Index page (playbooks shelf or /examples).
  const indexPath = AUTHED ? "/playbooks" : "/examples";
  await page.goto(`${BASE_URL}${indexPath}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await shot(page, `${deviceName}-index`);

  // The playbook itself (plays grid).
  await page.goto(`${BASE_URL}${playbookHref}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await shot(page, `${deviceName}-playbook`);

  // A play detail (first play link inside the playbook).
  const playLink = page.locator('a[href*="/plays/"]').first();
  if (await playLink.count()) {
    const playHref = await playLink.getAttribute("href");
    if (playHref) {
      await page.goto(`${BASE_URL}${playHref}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(1000);
      await shot(page, `${deviceName}-play`);
    }
  }

  // Print view — only makes sense on desktop.
  if (deviceName === "desktop") {
    await page.goto(`${BASE_URL}${playbookHref}/print`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    await shot(page, `${deviceName}-print`);
  }

  await context.close();
}

async function run() {
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  for (const [deviceName, viewport] of Object.entries(DEVICE_PRESETS)) {
    await captureAtViewport(browser, deviceName, viewport);
  }
  await browser.close();
  console.log("\nDone.");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
