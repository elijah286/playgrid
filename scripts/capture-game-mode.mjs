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
  // around the screen. No heavy halo, no ripple burst — the dot itself
  // briefly scales down on tap to read as a press.
  const el = document.createElement("div");
  el.id = id;
  Object.assign(el.style, {
    position: "fixed",
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
    pointerEvents: "none",
    zIndex: "2147483647",
    transition:
      "transform 850ms cubic-bezier(0.22, 1, 0.36, 1), width 180ms ease-out, height 180ms ease-out, margin 180ms ease-out, opacity 240ms ease-out",
    transform: "translate(-200px,-200px)",
    opacity: "0.95",
  });
  document.body.appendChild(el);

  let lastX = -200;
  let lastY = -200;
  window.addEventListener(
    "mousemove",
    (ev) => {
      lastX = ev.clientX;
      lastY = ev.clientY;
      el.style.transform = `translate(${ev.clientX}px, ${ev.clientY}px)`;
    },
    { passive: true, capture: true },
  );

  // Subtle press: shrink the dot briefly, then restore.
  window.addEventListener(
    "mousedown",
    () => {
      el.style.width = "20px";
      el.style.height = "20px";
      el.style.marginLeft = "-10px";
      el.style.marginTop = "-10px";
      el.style.opacity = "1";
    },
    { passive: true, capture: true },
  );
  window.addEventListener(
    "mouseup",
    () => {
      el.style.width = "30px";
      el.style.height = "30px";
      el.style.marginLeft = "-15px";
      el.style.marginTop = "-15px";
      el.style.opacity = "0.95";
    },
    { passive: true, capture: true },
  );
  // Silence unused-var lint on lastX/lastY — they're handy for future
  // overlays (e.g. pinning cursor on scroll) without rewiring listeners.
  void lastX;
  void lastY;
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
