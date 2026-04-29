#!/usr/bin/env node
/**
 * Capture a desktop walkthrough video for the marketing page hero.
 *
 * Flow (authed as the seed admin so the editor renders fully — no
 * "example playbook" lobby, no demo banner):
 *   1. Sign in
 *   2. /playbooks shelf → glide cursor to first real playbook
 *   3. Click into the playbook
 *   4. Click into a play → opens the editor
 *   5. Drag from a player marker to draw a route
 *   6. Click Motion to animate routes
 *   7. Navigate back to the playbook so the loop reads as a tour
 *
 * Pacing/cursor mirror scripts/capture-game-mode.mjs. Page-load dead
 * frames are removed in post via ffmpeg's mpdecimate filter, so the
 * tour reads fast even though Playwright records latency in real time.
 *
 * Writes:
 *   - public/marketing/screens/hero-walkthrough.{webm,mp4}
 *   - public/marketing/screens/hero-1..7-*.png
 *
 * Usage:
 *   BASE_URL=http://localhost:3456 node scripts/capture-hero-walkthrough.mjs
 */

import { chromium } from "playwright";
import { mkdir, readFile, rm, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3456";
const OUT_DIR = path.resolve("public/marketing/screens");
const VIDEO_TMP = path.resolve(".capture-video-hero");

// Pacing — kept tight; mpdecimate removes any remaining dead frames.
const BEAT_SHORT = 500;
const BEAT_MED = 900;
const BEAT_LONG = 1600;
const GLIDE_MS = 750;

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

/** Soft translucent orange cursor dot — same as capture-game-mode.mjs. */
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

/** Hide demo / preview banners just in case. */
const HIDE_BANNERS = () => {
  const css =
    "[data-demo-banner],[data-preview-banner]{display:none!important;}";
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);
};

async function installCursor(page) {
  await page.addInitScript(CURSOR_INIT);
  await page.addInitScript(HIDE_BANNERS);
  await page.evaluate(CURSOR_INIT);
  await page.evaluate(HIDE_BANNERS);
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

async function loadEnv() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    process.env.ENV_FILE,
    path.resolve(here, "../.env.local"),
    path.resolve(process.env.HOME ?? "", "playbook/.env.local"),
  ].filter(Boolean);
  for (const p of candidates) {
    try {
      const text = await readFile(p, "utf8");
      const out = {};
      for (const line of text.split(/\r?\n/)) {
        const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
        if (!m) continue;
        let val = m[2].trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }
        out[m[1]] = val;
      }
      return out;
    } catch {
      // keep trying
    }
  }
  return {};
}

/**
 * Pick a real playbook the seed admin owns: not archived, not an
 * example, with at least one play. Returns { playbookId, playId } or
 * throws if nothing usable exists.
 */
async function pickRealPlaybook(env) {
  const supa = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } },
  );
  const { data: adminList } = await supa.auth.admin.listUsers({ perPage: 200 });
  const adminUser = (adminList?.users ?? []).find(
    (u) => (u.email ?? "").toLowerCase() === env.SEED_ADMIN_EMAIL.toLowerCase(),
  );
  if (!adminUser) throw new Error("Seed admin user not found");

  const { data: ownedRows } = await supa
    .from("playbook_members")
    .select("playbook_id")
    .eq("user_id", adminUser.id)
    .eq("role", "owner");
  const ownedIds = (ownedRows ?? []).map((r) => r.playbook_id);
  if (ownedIds.length === 0) throw new Error("Admin owns no playbooks");

  // Prefer real team playbooks: not archived, not flagged as a public
  // example, and whose name doesn't shout "Example". Allow override via
  // PLAYBOOK_ID for ad-hoc captures.
  const { data: pbs } = await supa
    .from("playbooks")
    .select("id, name, is_public_example, is_archived, updated_at")
    .in("id", ownedIds)
    .eq("is_archived", false)
    .order("updated_at", { ascending: false });
  let real = null;
  if (process.env.PLAYBOOK_ID) {
    real = (pbs ?? []).find((p) => p.id === process.env.PLAYBOOK_ID) ?? null;
  }
  if (!real) {
    real =
      (pbs ?? []).find(
        (p) => !p.is_public_example && !/example/i.test(p.name ?? ""),
      ) ?? (pbs ?? []).find((p) => !p.is_public_example) ?? (pbs ?? [])[0];
  }
  if (!real) throw new Error("No usable playbook");

  const { data: play } = await supa
    .from("plays")
    .select("id, name, sort_order")
    .eq("playbook_id", real.id)
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!play) throw new Error(`Playbook "${real.name}" has no plays`);

  console.log(`Target: ${real.name} → ${play.name}`);
  return { playbookId: real.id, playId: play.id, playbookName: real.name };
}

async function signIn(page, email, password) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
  const emailInput = page.locator('input[type="email"]');
  await emailInput.waitFor({ timeout: 20000 });
  await emailInput.fill(email);
  // Wait for the form to actually hydrate (React-controlled value present).
  await page.waitForFunction(
    (v) =>
      document.querySelector('input[type="email"]')?.value?.toLowerCase() ===
      v.toLowerCase(),
    email,
    { timeout: 5000 },
  );
  await page
    .getByRole("button", { name: /^continue$/i })
    .first()
    .click();
  await page.locator('input[type="password"]').waitFor({ timeout: 30000 });
  await page.locator('input[type="password"]').fill(password);
  await page
    .getByRole("button", { name: /^(continue|sign in|log in)$/i })
    .first()
    .click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), {
    timeout: 20000,
  });
}

async function run() {
  await mkdir(OUT_DIR, { recursive: true });
  await rm(VIDEO_TMP, { recursive: true, force: true });
  await mkdir(VIDEO_TMP, { recursive: true });

  const env = await loadEnv();
  if (!env.SEED_ADMIN_EMAIL || !env.SEED_ADMIN_PASSWORD) {
    throw new Error(
      "SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD missing from .env.local",
    );
  }

  // Resolve a real playbook + first play before starting the recording.
  const target = await pickRealPlaybook(env);

  // -----------------------------------------------------------------
  // Pre-warm: sign in and visit each page once in a throwaway context
  // so Next has the routes compiled / Supabase data cached. This is
  // the single biggest factor in making the recorded tour feel snappy.
  // -----------------------------------------------------------------
  const warmBrowser = await chromium.launch();
  const warmCtx = await warmBrowser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const warmPage = await warmCtx.newPage();
  console.log("Pre-warming routes…");
  await signIn(warmPage, env.SEED_ADMIN_EMAIL, env.SEED_ADMIN_PASSWORD);
  for (const p of [
    "/playbooks",
    `/playbooks/${target.playbookId}`,
    `/plays/${target.playId}/edit`,
  ]) {
    await warmPage.goto(`${BASE_URL}${p}`, { waitUntil: "networkidle" });
  }
  const storageState = await warmCtx.storageState();
  await warmCtx.close();
  await warmBrowser.close();

  // -----------------------------------------------------------------
  // Real recording — reuses the warmed-up auth state, so no login
  // screen appears on tape.
  // -----------------------------------------------------------------
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    storageState,
    recordVideo: { dir: VIDEO_TMP, size: { width: 1440, height: 900 } },
  });
  const page = await ctx.newPage();
  await installCursor(page);

  // ---- Step 1: real /playbooks shelf.
  await page.goto(`${BASE_URL}/playbooks`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");
  await page.mouse.move(80, 780);
  await sleep(BEAT_SHORT);
  await shot(page, "hero-1-shelf");

  // ---- Step 2: hover the target playbook tile.
  const tile = page
    .locator(`a[href="/playbooks/${target.playbookId}"]`)
    .first();
  await tile.waitFor({ timeout: 10000 });
  await tile.scrollIntoViewIfNeeded();
  await glideToLocator(page, tile);
  await sleep(BEAT_MED);
  await shot(page, "hero-2-hover");

  // ---- Step 3: click into the playbook.
  await page.mouse.down();
  await sleep(80);
  await page.mouse.up();
  await page.waitForURL(new RegExp(`/playbooks/${target.playbookId}`), {
    timeout: 15000,
  });
  await page.waitForLoadState("networkidle");
  // Wait for actual play tiles to render (not just the skeleton).
  await page
    .locator('a[href*="/plays/"]')
    .first()
    .waitFor({ state: "visible", timeout: 20000 });
  await sleep(BEAT_SHORT);
  await shot(page, "hero-3-playbook");

  // ---- Step 4: glide to the first VISIBLE play tile and click in.
  // Default tab is Offense; pick whatever the coach would see first.
  const playTile = page.locator('a[href*="/plays/"]:visible').first();
  await playTile.waitFor({ state: "visible", timeout: 15000 });
  await playTile.scrollIntoViewIfNeeded();
  await glideToLocator(page, playTile);
  await sleep(BEAT_SHORT);
  await page.mouse.down();
  await sleep(80);
  await page.mouse.up();
  await page.waitForURL(/\/plays\/[^/]+(\/edit)?$/, { timeout: 15000 });
  await page.waitForLoadState("networkidle");
  // Wait for the editor SVG (the field) to actually render.
  await page
    .locator("svg")
    .first()
    .waitFor({ state: "visible", timeout: 20000 });
  // Wait until the editor SVG has any player markers rendered.
  await page
    .waitForFunction(
      () =>
        Array.from(document.querySelectorAll("svg")).some(
          (s) =>
            s.getBoundingClientRect().width > 400 &&
            s.querySelectorAll("g > circle").length >= 1,
        ),
      null,
      { timeout: 20000 },
    )
    .catch(() => {});
  await sleep(BEAT_MED);
  await shot(page, "hero-4-editor");

  // ---- Step 5: draw a route on a player marker.
  // Find the editor SVG, locate a player <g> wrapper near the
  // offensive slot, and drag from there upfield with a slight bend.
  const drag = await page.evaluate(() => {
    const svgs = Array.from(document.querySelectorAll("svg"));
    const svg = svgs
      .filter((s) => s.getBoundingClientRect().width > 400)
      .sort(
        (a, b) =>
          b.getBoundingClientRect().width - a.getBoundingClientRect().width,
      )[0];
    if (!svg) return null;
    const groups = Array.from(svg.querySelectorAll("g")).filter((g) =>
      g.querySelector(":scope > circle"),
    );
    if (groups.length === 0) return null;
    const svgRect = svg.getBoundingClientRect();
    // Aim near (62%, 62%) — typically a slot/WR on the offensive side.
    const targetX = svgRect.left + svgRect.width * 0.62;
    const targetY = svgRect.top + svgRect.height * 0.62;
    let best = null;
    let bestDist = Infinity;
    for (const g of groups) {
      const r = g.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const d = Math.hypot(cx - targetX, cy - targetY);
      if (d < bestDist) {
        bestDist = d;
        best = { cx, cy };
      }
    }
    if (!best) return null;
    return {
      from: { x: best.cx, y: best.cy },
      to: { x: best.cx + 110, y: best.cy - 220 },
    };
  });

  if (drag) {
    // Editor state machine: pointer-down on a player + drag = MOVE the
    // player. To draw a route we have to (1) tap the player to select
    // it, then (2) on a fresh pointer-down on canvas, drag from there.
    // Start the drag a few px off the player so the editor doesn't
    // resolve the hit-target as the player marker again.
    await glideTo(page, drag.from.x, drag.from.y);
    await sleep(BEAT_SHORT);
    // (1) tap to select
    await page.mouse.down();
    await sleep(80);
    await page.mouse.up();
    await sleep(BEAT_SHORT);
    // (2) drag from canvas just-off-the-player to draw the route
    const startX = drag.from.x + 14;
    const startY = drag.from.y - 14;
    await page.mouse.move(startX, startY);
    await sleep(120);
    await page.mouse.down();
    await sleep(120);
    const steps = 28;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = startX + (drag.to.x - startX) * t;
      const bend = Math.sin(t * Math.PI) * 36;
      const y = startY + (drag.to.y - startY) * t - bend;
      await page.mouse.move(x, y);
      await sleep(28);
    }
    await sleep(140);
    await page.mouse.up();
    await sleep(BEAT_MED);
    await shot(page, "hero-5-route");
  } else {
    await sleep(BEAT_MED);
    await shot(page, "hero-5-route");
  }

  // ---- Step 6: deselect (so the Playback panel appears in place of
  // the route-style toolbar), then click the primary button ("Motion"
  // if the play has motion, otherwise "Play") to animate.
  // PlayEditorClient gates: PlayControlsPanel only renders when
  // !showToolbar — i.e. nothing selected.
  await page.keyboard.press("Escape");
  await sleep(200);
  // Belt-and-suspenders: also click an empty canvas area outside the field.
  await page.mouse.move(40, 800);
  await sleep(120);
  await page.mouse.down();
  await sleep(60);
  await page.mouse.up();
  await sleep(BEAT_SHORT);

  const playbackPanel = page
    .locator('div:has(> p:text-is("Playback"))')
    .first();
  const motion = playbackPanel
    .getByRole("button", { name: /^(motion|play|replay|snap)$/i })
    .first();
  if (await motion.count()) {
    await glideToLocator(page, motion);
    await sleep(BEAT_SHORT);
    await page.mouse.down();
    await sleep(80);
    await page.mouse.up();
    // Let the routes animate end-to-end. If there's a motion phase,
    // the button retitles to "Play" — click again to run the play.
    await sleep(BEAT_LONG);
    const playAgain = playbackPanel
      .getByRole("button", { name: /^(play|snap)$/i })
      .first();
    if (await playAgain.count()) {
      await page.mouse.down();
      await sleep(80);
      await page.mouse.up();
      await sleep(BEAT_LONG * 2);
    } else {
      await sleep(BEAT_LONG);
    }
    await shot(page, "hero-6-motion");
  } else {
    await sleep(BEAT_LONG);
    await shot(page, "hero-6-motion");
  }

  // ---- Step 7: pop back to the playbook so the loop wraps cleanly.
  await page.goto(`${BASE_URL}/playbooks/${target.playbookId}`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");
  await sleep(BEAT_SHORT);
  await glideTo(page, 720, 500);
  await sleep(BEAT_SHORT);
  await shot(page, "hero-7-back");

  // Hold final frame so the loop doesn't snap.
  await sleep(BEAT_SHORT);

  await page.close();
  await ctx.close();
  await browser.close();

  // -----------------------------------------------------------------
  // Post-process: drop near-duplicate frames (page-load dead time)
  // and re-encode. mpdecimate compares consecutive frames and skips
  // ones that are visually identical, so navigation latency collapses
  // to a near-instant cut while cursor motion / animations stay smooth.
  // -----------------------------------------------------------------
  const vids = (await readdir(VIDEO_TMP)).filter((f) => f.endsWith(".webm"));
  if (vids.length === 0) throw new Error("No video captured");
  const webmSrc = path.join(VIDEO_TMP, vids[0]);
  const webmOut = path.join(OUT_DIR, "hero-walkthrough.webm");
  const mp4Out = path.join(OUT_DIR, "hero-walkthrough.mp4");
  // Conservative mpdecimate: only drops frames that are essentially
  // identical to their predecessor (page-load dead time, hold-on-final
  // pauses) while preserving cursor motion + route animation. Defaults
  // (hi=64*12, lo=64*5) are too eager and chop real motion.
  const VF = "mpdecimate=hi=64*4:lo=64*2:frac=0.5,setpts=N/FRAME_RATE/TB";

  await ffmpeg([
    "-y",
    "-i",
    webmSrc,
    "-vf",
    VF,
    "-r",
    "30",
    "-c:v",
    "libvpx-vp9",
    "-b:v",
    "0",
    "-crf",
    "32",
    "-an",
    webmOut,
  ]);
  console.log("  ✓", webmOut);

  await ffmpeg([
    "-y",
    "-i",
    webmSrc,
    "-vf",
    VF,
    "-r",
    "30",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    "-crf",
    "20",
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
