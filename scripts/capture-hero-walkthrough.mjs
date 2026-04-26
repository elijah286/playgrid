#!/usr/bin/env node
/**
 * Capture a desktop walkthrough video for the marketing page hero:
 * examples shelf → hover a book → open the playbook → click a play →
 * play the route animation (the "Motion" button) → loop back to the
 * playbook so the video reads as a repeating tour.
 *
 * Always runs unauthenticated — visitors should see the same flow the
 * marketing page promises (no login, no admin UI).
 *
 * Pacing + cursor overlay mirror scripts/capture-game-mode.mjs so the
 * visual language on the marketing page stays consistent across the
 * phone (game mode) and desktop (editor) walkthroughs.
 *
 * Writes:
 *   - public/marketing/screens/hero-walkthrough.{webm,mp4}
 *   - public/marketing/screens/hero-1..6-*.png (stepped posters)
 *
 * Usage:
 *   BASE_URL=http://localhost:3456 node scripts/capture-hero-walkthrough.mjs
 */

import { chromium } from "playwright";
import { mkdir, rename, rm, readdir } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3456";
const OUT_DIR = path.resolve("public/marketing/screens");
const VIDEO_TMP = path.resolve(".capture-video-hero");

// Pacing — "can a coach follow this on a marketing page?"
const BEAT_SHORT = 600;
const BEAT_MED = 1200;
const BEAT_LONG = 2000;
const GLIDE_MS = 850;
// Post-navigation dwell. Kept small so the captured video doesn't sit on
// dead frames while Next.js finishes hydrating — the visible content is
// already painted by the time DOMContentLoaded fires for these routes.
const NAV_DWELL = 350;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function shot(page, name) {
  const file = path.join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log("  ✓", file);
}

function ffmpeg(args) {
  return new Promise((resolve, reject) => {
    const p = spawn("ffmpeg", args, { stdio: "inherit" });
    p.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}`)),
    );
  });
}

/**
 * Soft translucent orange cursor dot. Same visual language as the
 * game-mode capture.
 */
const CURSOR_INIT = () => {
  const id = "__capture_cursor__";
  if (document.getElementById(id)) return;
  const wrap = document.createElement("div");
  wrap.id = id;
  Object.assign(wrap.style, {
    position: "fixed",
    left: "0px",
    top: "0px",
    width: "0px",
    height: "0px",
    pointerEvents: "none",
    zIndex: "2147483647",
    transform: "translate(-200px,-200px)",
    transition: "transform 800ms cubic-bezier(0.22, 1, 0.36, 1)",
  });
  const dot = document.createElement("div");
  Object.assign(dot.style, {
    position: "absolute",
    left: "0px",
    top: "0px",
    width: "30px",
    height: "30px",
    marginLeft: "-15px",
    marginTop: "-15px",
    borderRadius: "9999px",
    background: "rgba(242,101,34,0.55)",
    boxShadow:
      "0 0 0 1px rgba(242,101,34,0.35), 0 6px 18px rgba(242,101,34,0.35), 0 2px 6px rgba(0,0,0,0.15)",
    transformOrigin: "center center",
    transition: "transform 180ms ease-out, opacity 240ms ease-out",
    opacity: "0.95",
  });
  wrap.appendChild(dot);
  document.body.appendChild(wrap);

  window.addEventListener(
    "mousemove",
    (ev) => {
      wrap.style.transform = `translate(${ev.clientX}px, ${ev.clientY}px)`;
    },
    { passive: true, capture: true },
  );
  window.addEventListener(
    "mousedown",
    () => {
      dot.style.transform = "scale(0.66)";
      dot.style.opacity = "1";
    },
    { passive: true, capture: true },
  );
  window.addEventListener(
    "mouseup",
    () => {
      dot.style.transform = "scale(1)";
      dot.style.opacity = "0.95";
    },
    { passive: true, capture: true },
  );
};

async function installCursor(page) {
  await page.addInitScript(CURSOR_INIT);
  await page.evaluate(CURSOR_INIT);
}

async function glideTo(page, x, y) {
  await page.mouse.move(x, y);
  await sleep(GLIDE_MS);
}

async function glideToLocator(page, locator) {
  const box = await locator.boundingBox();
  if (!box) return null;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await glideTo(page, x, y);
  return { x, y };
}

async function tap(page, locator) {
  const pt = await glideToLocator(page, locator);
  if (!pt) {
    await locator.click({ force: true }).catch(() => {});
    return;
  }
  await page.mouse.down();
  await sleep(80);
  await page.mouse.up();
  await sleep(200);
}

async function run() {
  await mkdir(OUT_DIR, { recursive: true });
  await rm(VIDEO_TMP, { recursive: true, force: true });
  await mkdir(VIDEO_TMP, { recursive: true });

  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    recordVideo: { dir: VIDEO_TMP, size: { width: 1440, height: 900 } },
  });
  const page = await ctx.newPage();
  await installCursor(page);

  // Warm the routes we're about to record on a throwaway page in the same
  // context so Next.js's RSC payloads are cached. This trims the dead
  // "loading" frames from the recorded video without changing the visible
  // pacing of the walkthrough itself.
  const warm = await ctx.newPage();
  await warm.goto(`${BASE_URL}/examples`, { waitUntil: "domcontentloaded" });
  const firstHref = await warm
    .locator('a[href^="/playbooks/"]')
    .first()
    .getAttribute("href")
    .catch(() => null);
  if (firstHref) {
    await warm.goto(`${BASE_URL}${firstHref}`, { waitUntil: "domcontentloaded" });
    const firstPlay = await warm
      .locator('a[href*="/plays/"][href*="/edit"]')
      .first()
      .getAttribute("href")
      .catch(() => null);
    if (firstPlay) {
      await warm.goto(`${BASE_URL}${firstPlay}`, { waitUntil: "domcontentloaded" });
    }
  }
  await warm.close();

  // ---- Step 1: bookshelf of playbooks (always unauthed).
  await page.goto(`${BASE_URL}/examples`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(NAV_DWELL);
  await page.mouse.move(80, 780);
  await sleep(BEAT_SHORT);
  await shot(page, "hero-1-shelf");

  // ---- Step 2: hover over the first book so its open animation plays.
  const firstTile = page.locator('a[href^="/playbooks/"]').first();
  await firstTile.waitFor({ timeout: 10000 });
  await glideToLocator(page, firstTile);
  await sleep(BEAT_LONG);
  await shot(page, "hero-2-hover");

  // ---- Step 3: click into the playbook.
  const playbookHref = (await firstTile.getAttribute("href")) ?? "/examples";
  await page.mouse.down();
  await sleep(80);
  await page.mouse.up();
  await page.waitForURL(
    new RegExp(playbookHref.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    { timeout: 15000 },
  );
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(NAV_DWELL);
  await shot(page, "hero-3-playbook");

  // ---- Step 4: glide to a play tile and click in.
  const playTile = page.locator('a[href*="/plays/"][href*="/edit"]').first();
  if (await playTile.count()) {
    await playTile.scrollIntoViewIfNeeded();
    await sleep(400);
    await glideToLocator(page, playTile);
    await sleep(BEAT_SHORT);
    await page.mouse.down();
    await sleep(80);
    await page.mouse.up();
    await page.waitForURL(/\/plays\/[^/]+\/edit/, { timeout: 15000 });
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(BEAT_MED);
    await shot(page, "hero-4-play");

    // ---- Step 5: click the Motion / playback button so the routes
    //              animate. The button is labeled "Motion" in the
    //              playback panel; fall back to any obvious play
    //              control.
    const motion = page
      .getByRole("button", { name: /^motion$/i })
      .or(page.getByRole("button", { name: /^play(back)?$/i }))
      .first();
    if (await motion.count()) {
      await glideToLocator(page, motion);
      await sleep(BEAT_SHORT);
      await page.mouse.down();
      await sleep(80);
      await page.mouse.up();
      // Let the route animation play through end-to-end.
      await sleep(BEAT_LONG * 2);
      await shot(page, "hero-5-motion");
    } else {
      await sleep(BEAT_LONG);
      await shot(page, "hero-5-motion");
    }

    // ---- Step 6: navigate back to the playbook so the loop reads as
    //              a repeating tour rather than freezing on the play.
    await page.goto(`${BASE_URL}${playbookHref}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(NAV_DWELL);
    await glideTo(page, 720, 500);
    await sleep(BEAT_SHORT);
    await shot(page, "hero-6-back");
  }

  // Hold on the final frame so the loop doesn't snap back instantly.
  await sleep(BEAT_SHORT);

  await page.close();
  await ctx.close();
  await browser.close();

  const vids = (await readdir(VIDEO_TMP)).filter((f) => f.endsWith(".webm"));
  if (vids.length === 0) throw new Error("No video captured");
  const webmSrc = path.join(VIDEO_TMP, vids[0]);
  const webmOut = path.join(OUT_DIR, "hero-walkthrough.webm");
  const mp4Out = path.join(OUT_DIR, "hero-walkthrough.mp4");
  await rename(webmSrc, webmOut);
  console.log("  ✓", webmOut);

  await ffmpeg([
    "-y",
    "-i",
    webmOut,
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    "-an",
    mp4Out,
  ]);
  console.log("  ✓", mp4Out);

  await rm(VIDEO_TMP, { recursive: true, force: true });
  console.log("\nDone.");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
