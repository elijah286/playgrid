#!/usr/bin/env node
/**
 * Capture a real Game Mode walkthrough from an example playbook, phone
 * viewport. Writes both:
 *   - A webm video of the whole flow (saved as public/marketing/screens/
 *     gm-walkthrough.webm) for the marketing page to <video autoplay loop>.
 *   - Stepped PNGs at key beats (gm-1-picker.png, gm-2-play.png, etc.)
 *     so the marketing page can also fall back to a cross-fade animation.
 *
 * Usage:
 *   BASE_URL=http://localhost:3456 node scripts/capture-game-mode.mjs
 */

import { chromium } from "playwright";
import { mkdir, rename, rm, readdir } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3456";
const OUT_DIR = path.resolve("public/marketing/screens");
const VIDEO_TMP = path.resolve(".capture-video");

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

async function run() {
  await mkdir(OUT_DIR, { recursive: true });
  await rm(VIDEO_TMP, { recursive: true, force: true });
  await mkdir(VIDEO_TMP, { recursive: true });

  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    recordVideo: { dir: VIDEO_TMP, size: { width: 390, height: 844 } },
  });
  const page = await ctx.newPage();

  // Find first public example.
  await page.goto(`${BASE_URL}/examples`, { waitUntil: "networkidle" });
  const tile = page.locator('a[href^="/playbooks/"]').first();
  await tile.waitFor({ timeout: 10000 });
  const href = await tile.getAttribute("href");
  if (!href) throw new Error("No example playbook");
  console.log("Example:", href);

  // Enter Game Mode directly.
  await page.goto(`${BASE_URL}${href}/game`, { waitUntil: "networkidle" });
  await sleep(1200);

  // Step 1 — picker open ("Pick a play").
  await shot(page, "gm-1-picker");

  // Pick first play in the picker. Plays render as clickable tiles; the
  // picker dialog uses buttons with the play name. Fall back to the first
  // clickable row if needed.
  const firstPlay = page.locator('[role="dialog"] button, [role="dialog"] [role="option"], [data-play-id]').first();
  await firstPlay.waitFor({ timeout: 5000 }).catch(() => {});
  if (await firstPlay.count()) {
    await firstPlay.click();
  } else {
    // Fallback: tap the centre of the picker area.
    await page.mouse.click(195, 400);
  }
  await sleep(1800);

  // Step 2 — field view with the picked play.
  await shot(page, "gm-2-play");

  // Step 3 — tap thumbs up to score it.
  const thumbsUp = page.getByRole("button", { name: /thumbs up/i });
  if (await thumbsUp.count()) {
    await thumbsUp.first().click({ force: true }).catch(() => {});
    await sleep(600);
    await shot(page, "gm-3-thumbsup");
  }

  // Step 4 — open next-play picker.
  const chooseNext = page.getByRole("button", { name: /choose next play/i });
  if (await chooseNext.count()) {
    await chooseNext.first().click();
    await sleep(700);
    await shot(page, "gm-4-next-picker");

    // Scroll the inline picker a bit so the shot shows list motion.
    await page.mouse.wheel(0, 300);
    await sleep(500);
    await shot(page, "gm-5-next-scrolled");

    // Pick a different play (second in list).
    const plays = page.locator('[role="dialog"] button, [data-play-id]');
    const count = await plays.count();
    if (count > 1) {
      await plays.nth(1).click().catch(() => {});
    } else if (count === 1) {
      await plays.first().click().catch(() => {});
    }
    await sleep(600);

    // Step 6 — back to field with "next play" queued.
    await shot(page, "gm-6-next-queued");

    const runBtn = page.getByRole("button", { name: /^run$/i });
    if (await runBtn.count()) {
      await runBtn.first().click();
      await sleep(1800);
      await shot(page, "gm-7-running-next");
    }
  }

  // Let the scoreboard get a tap too.
  await sleep(500);

  await page.close();
  await ctx.close();
  await browser.close();

  // Video is a single file in VIDEO_TMP; move + re-encode to mp4 for
  // better Safari support, and also emit a looping webm. Keep both
  // under public/marketing/screens/.
  const vids = (await readdir(VIDEO_TMP)).filter((f) => f.endsWith(".webm"));
  if (vids.length === 0) throw new Error("No video captured");
  const webmSrc = path.join(VIDEO_TMP, vids[0]);
  const webmOut = path.join(OUT_DIR, "gm-walkthrough.webm");
  const mp4Out = path.join(OUT_DIR, "gm-walkthrough.mp4");
  await rename(webmSrc, webmOut);
  console.log("  ✓", webmOut);

  // Transcode webm → mp4 (H.264) so iOS Safari plays it inline.
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
