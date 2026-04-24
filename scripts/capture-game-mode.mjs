#!/usr/bin/env node
/**
 * Capture a real Game Mode walkthrough from an example playbook, phone
 * viewport. A visible orange "finger" cursor is injected into the page so
 * viewers can track what's being tapped. The pace is deliberately slow —
 * marketing viewers need to follow the flow, not be impressed by speed.
 *
 * Writes:
 *   - public/marketing/screens/gm-walkthrough.{webm,mp4}
 *   - public/marketing/screens/gm-{1..7}-*.png (stepped frames)
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

// Pacing knobs — tuned for "can a coach follow this on a marketing page?"
const BEAT_SHORT = 700;   // pause after a small UI change
const BEAT_MED = 1400;    // pause to let the viewer read a new screen
const BEAT_LONG = 2200;   // pause on a key moment (play picked, thumbs up)
const GLIDE_MS = 900;     // matches the CSS transition on the cursor

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
 * Install a DOM cursor that follows mousemove events and pulses on click.
 * Runs in page context. The cursor is a fixed-position div with a
 * translucent orange halo + solid dot. pointer-events:none so it never
 * intercepts real clicks.
 */
const CURSOR_INIT = () => {
  const id = "__capture_cursor__";
  if (document.getElementById(id)) return;
  // Apple-style: a single soft, translucent dot that glides smoothly
  // around the screen. Position lives on the outer wrapper; scale/press
  // lives on the inner dot so shrinking never shifts the hit point off
  // what the user is clicking.
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
    transition: "transform 850ms cubic-bezier(0.22, 1, 0.36, 1)",
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
    backdropFilter: "blur(2px)",
    transformOrigin: "center center",
    transition:
      "transform 180ms ease-out, opacity 240ms ease-out",
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

  // Press scales the dot in place — no margin tricks, so the center
  // stays exactly on the pointer.
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

/** Move the real mouse to the target and wait for the DOM cursor's CSS
 *  transition to settle. The overlay cursor uses a long ease-out, so
 *  the dot glides smoothly to where we're about to tap. */
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
  await installCursor(page);
  // Park the cursor off-screen-ish so its entry is visible.
  await page.mouse.move(40, 780);
  await sleep(BEAT_MED);

  // Helper: pick the Nth play in whichever picker is currently open.
  async function pickPlayAt(n) {
    const plays = page.locator(
      '[role="dialog"] button, [role="dialog"] [role="option"], [data-play-id]',
    );
    const count = await plays.count();
    if (count === 0) return false;
    const target = plays.nth(Math.min(n, count - 1));
    await tap(page, target);
    return true;
  }

  // Helper: tap an outcome tag (Gain of yardage / First down / Score /
  // Loss of yardage / etc). Assumes thumbs-up or thumbs-down has already
  // been pressed so the tag rail is visible. Always taps thumbs-up first
  // for the "up" cases below; no "down" flow is needed yet.
  async function pickOutcome(label) {
    const thumbsUp = page.getByRole("button", { name: /thumbs up/i });
    if (await thumbsUp.count()) {
      await tap(page, thumbsUp.first());
      await sleep(BEAT_SHORT);
    }
    const tag = page.getByRole("button", { name: new RegExp(label, "i") });
    if (await tag.count()) {
      await tap(page, tag.first());
      await sleep(BEAT_MED);
    }
  }

  async function openNextPicker() {
    const chooseNext = page.getByRole("button", { name: /choose next play/i });
    if (!(await chooseNext.count())) return false;
    await glideToLocator(page, chooseNext.first());
    await sleep(BEAT_SHORT);
    await tap(page, chooseNext.first());
    await sleep(BEAT_MED);
    return true;
  }

  async function runQueuedPlay() {
    const runBtn = page.getByRole("button", { name: /^run$/i });
    if (!(await runBtn.count())) return false;
    await glideToLocator(page, runBtn.first());
    await sleep(BEAT_SHORT);
    await tap(page, runBtn.first());
    // Hold long enough for the auto-stepped animation to play through.
    await sleep(BEAT_LONG + 1200);
    return true;
  }

  // Step 1 — picker open ("Pick a play"). Glide across so the viewer
  // registers that there are several plays to choose from.
  await shot(page, "gm-1-picker");
  await glideTo(page, 320, 260);
  await glideTo(page, 60, 260);

  // ---- Drive 1: pick play → animation auto-runs → First down.
  await pickPlayAt(0);
  await sleep(BEAT_LONG + 800); // let the play auto-animate
  await shot(page, "gm-2-play");

  await pickOutcome("first down");
  await shot(page, "gm-3-first-down");

  // ---- Drive 2: choose next → pick another → run → animation → Gain of yardage.
  if (await openNextPicker()) {
    await shot(page, "gm-4-next-picker");
    await glideTo(page, 195, 500);
    await page.mouse.wheel(0, 220);
    await sleep(BEAT_MED);
    await pickPlayAt(1);
    await sleep(BEAT_MED);
    await shot(page, "gm-5-next-queued");

    await runQueuedPlay();
    await shot(page, "gm-6-drive2-animated");

    await pickOutcome("gain of yardage");
    await shot(page, "gm-7-gain");
  }

  // ---- Drive 3: one more loop so the video makes the pattern obvious.
  if (await openNextPicker()) {
    await pickPlayAt(2);
    await sleep(BEAT_MED);
    await runQueuedPlay();
    await pickOutcome("first down");
  }

  // Hold on the final frame so the loop doesn't snap back instantly.
  await sleep(BEAT_LONG);

  await page.close();
  await ctx.close();
  await browser.close();

  const vids = (await readdir(VIDEO_TMP)).filter((f) => f.endsWith(".webm"));
  if (vids.length === 0) throw new Error("No video captured");
  const webmSrc = path.join(VIDEO_TMP, vids[0]);
  const webmOut = path.join(OUT_DIR, "gm-walkthrough.webm");
  const mp4Out = path.join(OUT_DIR, "gm-walkthrough.mp4");
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
