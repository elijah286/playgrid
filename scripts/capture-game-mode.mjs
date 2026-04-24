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
const BEAT_SHORT = 900;   // pause after a small UI change
const BEAT_MED = 1600;    // pause to let the viewer read a new screen
const BEAT_LONG = 2400;   // pause on a key moment (play picked, thumbs up)
const MOVE_STEPS = 28;    // interpolated mouse-move frames → slow glide

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
  const el = document.createElement("div");
  el.id = id;
  Object.assign(el.style, {
    position: "fixed",
    left: "0px",
    top: "0px",
    width: "44px",
    height: "44px",
    marginLeft: "-22px",
    marginTop: "-22px",
    borderRadius: "9999px",
    background: "rgba(242,101,34,0.28)",
    border: "2px solid rgba(242,101,34,0.9)",
    boxShadow: "0 0 0 6px rgba(242,101,34,0.15), 0 2px 10px rgba(0,0,0,0.25)",
    pointerEvents: "none",
    zIndex: "2147483647",
    transition: "transform 120ms ease-out",
    transform: "translate(-200px,-200px)",
  });
  const dot = document.createElement("div");
  Object.assign(dot.style, {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: "10px",
    height: "10px",
    marginLeft: "-5px",
    marginTop: "-5px",
    borderRadius: "9999px",
    background: "#F26522",
    boxShadow: "0 0 0 2px white",
  });
  el.appendChild(dot);
  document.body.appendChild(el);

  window.addEventListener(
    "mousemove",
    (ev) => {
      el.style.transform = `translate(${ev.clientX}px, ${ev.clientY}px)`;
    },
    { passive: true, capture: true },
  );

  // Tap ripple on click.
  window.addEventListener(
    "mousedown",
    (ev) => {
      const ripple = document.createElement("div");
      Object.assign(ripple.style, {
        position: "fixed",
        left: ev.clientX + "px",
        top: ev.clientY + "px",
        width: "16px",
        height: "16px",
        marginLeft: "-8px",
        marginTop: "-8px",
        borderRadius: "9999px",
        border: "2px solid rgba(242,101,34,0.9)",
        background: "rgba(242,101,34,0.25)",
        pointerEvents: "none",
        zIndex: "2147483646",
        animation: "__cap_ripple__ 600ms ease-out forwards",
      });
      document.body.appendChild(ripple);
      setTimeout(() => ripple.remove(), 650);
    },
    { passive: true, capture: true },
  );

  const style = document.createElement("style");
  style.textContent =
    "@keyframes __cap_ripple__ { to { transform: scale(4); opacity: 0; } }";
  document.head.appendChild(style);
};

async function installCursor(page) {
  await page.addInitScript(CURSOR_INIT);
  await page.evaluate(CURSOR_INIT);
}

/** Glide the mouse to a target with interpolated steps so the orange
 *  cursor is visibly in motion rather than teleporting. */
async function glideTo(page, x, y) {
  await page.mouse.move(x, y, { steps: MOVE_STEPS });
}

async function glideToLocator(page, locator) {
  const box = await locator.boundingBox();
  if (!box) return null;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await glideTo(page, x, y);
  await sleep(350);
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

  // Step 1 — picker open ("Pick a play").
  await shot(page, "gm-1-picker");

  // Glide across the picker so viewers see "options exist" before we tap one.
  await glideTo(page, 320, 260);
  await sleep(600);
  await glideTo(page, 60, 260);
  await sleep(600);

  // Pick first play in the picker.
  const firstPlay = page.locator('[role="dialog"] button, [role="dialog"] [role="option"], [data-play-id]').first();
  await firstPlay.waitFor({ timeout: 5000 }).catch(() => {});
  if (await firstPlay.count()) {
    await tap(page, firstPlay);
  } else {
    await glideTo(page, 195, 400);
    await page.mouse.down();
    await sleep(80);
    await page.mouse.up();
  }
  await sleep(BEAT_LONG);

  // Step 2 — field view with the picked play.
  await shot(page, "gm-2-play");

  // Step 3 — tap thumbs up to score it. Pause to let the viewer register
  // the control, then tap.
  const thumbsUp = page.getByRole("button", { name: /thumbs up/i });
  if (await thumbsUp.count()) {
    await glideToLocator(page, thumbsUp.first());
    await sleep(BEAT_SHORT);
    await tap(page, thumbsUp.first());
    await sleep(BEAT_MED);
    await shot(page, "gm-3-thumbsup");
  }

  // Step 4 — open next-play picker.
  const chooseNext = page.getByRole("button", { name: /choose next play/i });
  if (await chooseNext.count()) {
    await glideToLocator(page, chooseNext.first());
    await sleep(BEAT_SHORT);
    await tap(page, chooseNext.first());
    await sleep(BEAT_MED);
    await shot(page, "gm-4-next-picker");

    // Scroll with the cursor hovering inside the list so there's a clear
    // "they're browsing" beat.
    await glideTo(page, 195, 500);
    await sleep(400);
    await page.mouse.wheel(0, 220);
    await sleep(700);
    await page.mouse.wheel(0, 180);
    await sleep(BEAT_MED);
    await shot(page, "gm-5-next-scrolled");

    // Pick a different play (second in list) slowly.
    const plays = page.locator('[role="dialog"] button, [data-play-id]');
    const count = await plays.count();
    if (count > 1) {
      await tap(page, plays.nth(1));
    } else if (count === 1) {
      await tap(page, plays.first());
    }
    await sleep(BEAT_LONG);

    // Step 6 — back to field with "next play" queued.
    await shot(page, "gm-6-next-queued");

    const runBtn = page.getByRole("button", { name: /^run$/i });
    if (await runBtn.count()) {
      await glideToLocator(page, runBtn.first());
      await sleep(BEAT_SHORT);
      await tap(page, runBtn.first());
      await sleep(BEAT_LONG + 600);
      await shot(page, "gm-7-running-next");
    }
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
