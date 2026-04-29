#!/usr/bin/env node
/**
 * Hero walkthrough video for the marketing page.
 *
 * Two scenes, each on a *real* playbook the seed admin owns:
 *   1. Chiefs Girls (flag football)  → "+ New play" → mirror Play 1's
 *      routes → type @-mention notes → animate.
 *   2. 7v7 Example                    → same flow, mirroring its Play 1.
 *
 * Conventions:
 *   - The cursor is NOT injected into the page during recording. Instead,
 *     we log every page.mouse.* call's timestamp+position and composite a
 *     large soft cursor on top of the recorded video in post — standard
 *     promotional/tutorial-video convention. That keeps the cursor smooth
 *     and easy to see, and it survives mpdecimate/transcoding losslessly.
 *   - Created plays are deleted after recording so the admin's playbooks
 *     don't accumulate "Tesla copy 17" noise.
 *
 * Writes:
 *   - public/marketing/screens/hero-walkthrough.{webm,mp4}
 *   - public/marketing/screens/hero-poster.png
 *
 * Usage:
 *   BASE_URL=http://localhost:3456 node scripts/capture-hero-walkthrough.mjs
 */

import { chromium } from "playwright";
import { mkdir, readFile, rm, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3456";
const OUT_DIR = path.resolve("public/marketing/screens");
const VIDEO_TMP = path.resolve(".capture-video-hero");
const FRAMES_DIR = path.resolve(".capture-cursor-frames");

const VIEWPORT = { width: 1440, height: 900 };
const FPS = 30;

// Pacing — tight throughout. The cursor still reads as deliberate
// because every glide/click animates over ~600ms.
const BEAT_SHORT = 220;
const BEAT_MED = 450;
const BEAT_LONG = 800;
const GLIDE_MS = 600;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function ffmpeg(args) {
  return new Promise((resolve, reject) => {
    const p = spawn("ffmpeg", args, { stdio: "inherit" });
    p.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}`)),
    );
  });
}

/* -----------------------------------------------------------------------
   Mouse tracking — every call goes through these helpers so we know the
   exact (t_ms_since_record_start, x, y, isDown) of every cursor event.
   ----------------------------------------------------------------------- */

let recordStartTs = 0;
const cursorPath = []; // [{t, x, y, down}]
const deadSegments = []; // [{start, end}] in ms since recordStartTs — trimmed in post
let curX = -100;
let curY = -100;
let curDown = false;

/** Wrap async work that doesn't move the cursor (page-load waits, modal
 *  prep). Recorded video frames during this window are trimmed in post,
 *  and cursor-path samples in this window are dropped, so the final
 *  video reads as a fast cut from "click" → "result". */
async function dead(fn) {
  const start = Date.now() - recordStartTs;
  try {
    return await fn();
  } finally {
    const end = Date.now() - recordStartTs;
    deadSegments.push({ start, end });
  }
}

function logCursor() {
  cursorPath.push({
    t: Date.now() - recordStartTs,
    x: curX,
    y: curY,
    down: curDown,
  });
}
async function moveTo(page, x, y) {
  curX = x;
  curY = y;
  logCursor();
  await page.mouse.move(x, y);
}
async function pressDown(page) {
  curDown = true;
  logCursor();
  await page.mouse.down();
}
async function releaseUp(page) {
  curDown = false;
  logCursor();
  await page.mouse.up();
}
async function tapAt(page, x, y) {
  await moveTo(page, x, y);
  await sleep(120);
  await pressDown(page);
  await sleep(80);
  await releaseUp(page);
  await sleep(140);
}
async function glideTo(page, x, y) {
  // Generate intermediate samples so the post-process cursor follows a
  // smooth curve rather than teleporting. Easing: cubic ease-out.
  const N = 18;
  const fromX = curX;
  const fromY = curY;
  for (let i = 1; i <= N; i++) {
    const t = i / N;
    const eased = 1 - Math.pow(1 - t, 3);
    await moveTo(page, fromX + (x - fromX) * eased, fromY + (y - fromY) * eased);
    await sleep(GLIDE_MS / N);
  }
}
async function glideToLocator(page, locator) {
  const box = await locator.boundingBox();
  if (!box) return null;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await glideTo(page, x, y);
  return { x, y };
}
async function clickLocator(page, locator) {
  const pt = await glideToLocator(page, locator);
  if (!pt) {
    await locator.click({ force: true }).catch(() => {});
    return null;
  }
  await sleep(120);
  await pressDown(page);
  await sleep(80);
  await releaseUp(page);
  await sleep(160);
  return pt;
}

/* -----------------------------------------------------------------------
   Env + Supabase
   ----------------------------------------------------------------------- */

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

async function findScene(supa, adminId, namePrefix, preferPublicExample) {
  const { data: ownedRows } = await supa
    .from("playbook_members")
    .select("playbook_id")
    .eq("user_id", adminId)
    .eq("role", "owner");
  const ownedIds = (ownedRows ?? []).map((r) => r.playbook_id);
  const { data: pbs } = await supa
    .from("playbooks")
    .select("id, name, is_public_example, is_archived")
    .in("id", ownedIds)
    .eq("is_archived", false)
    .ilike("name", `${namePrefix}%`);
  // Prefer playbooks that actually have plays.
  const candidates = (pbs ?? [])
    .slice()
    .sort((a, b) => Number(b.is_public_example === preferPublicExample) - Number(a.is_public_example === preferPublicExample));
  for (const pb of candidates) {
    const { count } = await supa
      .from("plays")
      .select("id", { count: "exact", head: true })
      .eq("playbook_id", pb.id)
      .eq("play_type", "offense");
    if ((count ?? 0) === 0) continue;
    const { data: play1 } = await supa
      .from("plays")
      .select("id, name, formation_id, formation_name, current_version_id")
      .eq("playbook_id", pb.id)
      .eq("play_type", "offense")
      .order("sort_order", { ascending: true })
      .limit(1)
      .single();
    const { data: pv } = await supa
      .from("play_versions")
      .select("document")
      .eq("id", play1.current_version_id)
      .single();
    return {
      playbookId: pb.id,
      playbookName: pb.name,
      play1: { ...play1, document: pv?.document },
    };
  }
  throw new Error(`No usable playbook matching ${namePrefix}`);
}

/* -----------------------------------------------------------------------
   Sign-in
   ----------------------------------------------------------------------- */

async function signIn(page, email, password) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
  const emailInput = page.locator('input[type="email"]');
  await emailInput.waitFor({ timeout: 20000 });
  await emailInput.fill(email);
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
    .getByRole("button", { name: /^(sign in|log in|continue)$/i })
    .first()
    .click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), {
    timeout: 20000,
  });
}

/* -----------------------------------------------------------------------
   Per-scene flow: open playbook → +New play → editor → mirror routes →
   notes → animate. Returns { newPlayId } so we can clean up.
   ----------------------------------------------------------------------- */

async function runScene(page, scene, opts = {}) {
  console.log(`\n== Scene: ${scene.playbookName} (mirror "${scene.play1.name}") ==`);

  if (!opts.alreadyOnPage) {
    // Goto playbook detail (mark as dead so the inter-scene transition
    // collapses to a near-instant cut in post).
    await dead(async () => {
      await page.goto(`${BASE_URL}/playbooks/${scene.playbookId}`, {
        waitUntil: "domcontentloaded",
      });
      await page.waitForLoadState("networkidle");
      await page
        .locator('a[href*="/plays/"]')
        .first()
        .waitFor({ state: "visible", timeout: 20000 });
    });
  }
  await sleep(BEAT_SHORT);

  // Click "+ New play" (desktop button).
  const newPlayBtn = page.getByRole("button", { name: /new play/i }).first();
  await newPlayBtn.waitFor({ timeout: 10000 });
  await glideToLocator(page, newPlayBtn);
  await sleep(120);
  await pressDown(page);
  await sleep(80);
  await releaseUp(page);
  await sleep(BEAT_SHORT);

  // Formation picker dialog opens. Try to click the formation tile
  // matching Play 1's formation_name. Fall back to "No specific
  // formation" (which uses default players for the playbook's player
  // count).
  await page
    .getByText("Start a new play", { exact: true })
    .first()
    .waitFor({ timeout: 8000 })
    .catch(() => {});
  // Tiles are <button> elements containing a <p> with the formation name.
  const targetFormationName = scene.play1.formation_name ?? "";
  let formationTile = null;
  if (targetFormationName) {
    const escaped = targetFormationName.replace(/"/g, '\\"');
    const cand = page.locator(`button:has(p:text-is("${escaped}"))`);
    if (await cand.count()) formationTile = cand.first();
  }
  if (!formationTile) {
    formationTile = page
      .locator('button:has(p:text-is("No specific formation"))')
      .first();
  }
  await formationTile.waitFor({ state: "visible", timeout: 8000 });
  await formationTile.scrollIntoViewIfNeeded();
  await glideToLocator(page, formationTile);
  await sleep(140);
  await pressDown(page);
  await sleep(80);
  await releaseUp(page);

  // The "Preparing play editor…" spinner appears here. Mark this
  // window as dead so it gets trimmed out in post.
  await dead(async () => {
    await page.waitForURL(/\/plays\/[^/]+\/edit/, { timeout: 20000 });
    await page.waitForLoadState("networkidle");
    await page
      .waitForFunction(
        () =>
          Array.from(document.querySelectorAll("svg")).some(
            (s) =>
              s.getBoundingClientRect().width > 400 &&
              s.querySelectorAll("g > circle").length >= 1,
          ),
        null,
        { timeout: 25000 },
      )
      .catch(() => {});
  });
  await sleep(BEAT_SHORT);

  const newPlayId = page.url().match(/plays\/([0-9a-f-]+)\/edit/)?.[1];

  // ---- Plan and draw routes ----
  // Coach-Cal-style invariants enforced inline:
  //   - Skip non-eligibles (QB, snapper). The QB never has a downfield
  //     route in flag/7v7; mirroring Play 1's QB motion was producing
  //     "run routes for the Q" bugs.
  //   - At most one route per receiver.
  //   - Every route progresses forward (toward the offense's end zone).
  //     For freehand we hand-code a strictly forward path; templates
  //     are forward by construction.
  //
  // Most routes use Quick Route templates so they're clean and never
  // smear across multiple players. ONE route per scene is freehand,
  // to demo the route-drawing capability — that's the user's ask.
  const players = await page.evaluate(() => {
    const svgs = Array.from(document.querySelectorAll("svg"));
    const svg = svgs
      .filter((s) => s.getBoundingClientRect().width > 400)
      .sort(
        (a, b) =>
          b.getBoundingClientRect().width -
          a.getBoundingClientRect().width,
      )[0];
    if (!svg) return [];
    const rect = svg.getBoundingClientRect();
    const groups = Array.from(svg.querySelectorAll("g")).filter((g) =>
      g.querySelector(":scope > circle"),
    );
    const out = [];
    for (const g of groups) {
      const bb = g.getBoundingClientRect();
      // Skip selection rings / dots / decoration groups.
      if (bb.width < 14 || bb.width > 80) continue;
      const text = g.querySelector("text")?.textContent?.trim() ?? "";
      out.push({
        label: text,
        cx: bb.left + bb.width / 2,
        cy: bb.top + bb.height / 2,
        fieldRectLeft: rect.left,
        fieldRectRight: rect.left + rect.width,
        fieldRectTop: rect.top,
        fieldRectBottom: rect.top + rect.height,
      });
    }
    return out;
  });

  // Filter to non-QB receivers, sort left-to-right (so the "first"
  // route is on the leftmost receiver, etc.).
  const isReceiver = (p) =>
    p.label && !/^Q$/i.test(p.label) && !/^C$/i.test(p.label);
  const receivers = players.filter(isReceiver).sort((a, b) => a.cx - b.cx);
  if (receivers.length === 0) {
    console.warn("No receivers identified; skipping routes for this scene.");
  }

  // Per-scene template plan. `null` = freehand. Plays better visually
  // for marketing if templates are varied (no two adjacent receivers
  // get the same shape).
  const TEMPLATES_BY_KIND = {
    flag: ["Slant", null, "Corner", "Dig"], // 4 receivers
    sevenSeven: ["Slant", null, "Post", "Corner", "Dig"], // 5 receivers
  };
  const isSeven = receivers.length >= 5;
  const planRaw = TEMPLATES_BY_KIND[isSeven ? "sevenSeven" : "flag"];
  const plan = planRaw.slice(0, receivers.length);
  const fieldCenterX =
    receivers[0]
      ? (receivers[0].fieldRectLeft + receivers[0].fieldRectRight) / 2
      : VIEWPORT.width / 2;

  for (let i = 0; i < plan.length; i++) {
    const player = receivers[i];
    const tpl = plan[i];

    // Glide and tap exactly on the player marker. Subtle: we glide to
    // the player center, then start the tap with a tiny extra dwell so
    // the editor's pointer-capture latches onto the player <g> rather
    // than slipping to canvas (which would create a click-route from
    // any previously-selected player).
    await glideTo(page, player.cx, player.cy);
    await sleep(180);
    await pressDown(page);
    await sleep(90);
    await releaseUp(page);
    await sleep(280);

    if (tpl) {
      // Apply Quick Route template — guaranteed clean shape, no drag,
      // no chance of "moving the player by accident."
      // The Quick Routes panel is rendered twice (mobile + desktop)
      // so we use the role+name lookup — only the visible button has
      // the matching accessible name.
      const btn = page
        .getByRole("button", { name: tpl, exact: true })
        .first();
      let applied = false;
      try {
        await btn.waitFor({ state: "visible", timeout: 6000 });
        await btn.scrollIntoViewIfNeeded().catch(() => {});
        // Glide the cursor to the button so the recorded path looks
        // intentional, then dispatch via locator.click() which
        // guarantees a real "click" event (mouse.down + mouse.up at
        // the same point isn't always enough — React listens for
        // click, not mousedown).
        const box = await btn.boundingBox();
        if (box) {
          await glideTo(page, box.x + box.width / 2, box.y + box.height / 2);
          await sleep(140);
          // Cursor visual feedback for the captured path.
          curDown = true;
          logCursor();
          await sleep(90);
          curDown = false;
          logCursor();
        }
        await btn.click({ force: true, timeout: 6000 });
        await sleep(220);
        applied = true;
      } catch (e) {
        console.log(`  [tpl ${tpl}] primary click failed: ${e.message?.split("\n")[0]}`);
        // Fallback: type the template name into the routes search.
        const search = page
          .locator('input[type="search"][placeholder^="Search routes"]')
          .first();
        if (await search.count()) {
          await glideToLocator(page, search);
          await search.click({ force: true }).catch(() => {});
          await sleep(120);
          await page.keyboard.type(tpl, { delay: 50 });
          await sleep(BEAT_SHORT);
          const btn2 = page
            .getByRole("button", { name: tpl, exact: true })
            .first();
          if ((await btn2.count()) > 0) {
            await btn2.scrollIntoViewIfNeeded().catch(() => {});
            const box2 = await btn2.boundingBox();
            if (box2) {
              await glideTo(page, box2.x + box2.width / 2, box2.y + box2.height / 2);
              await sleep(140);
              curDown = true;
              logCursor();
              await sleep(90);
              curDown = false;
              logCursor();
              await btn2
                .click({ force: true, timeout: 4000 })
                .catch(() => {});
              applied = true;
            }
          }
          // Clear the search box so subsequent template searches start fresh.
          if (applied) {
            await search.fill("").catch(() => {});
            await sleep(120);
          }
        }
      }
      if (!applied) {
        console.warn(`Couldn't apply template "${tpl}" — skipping route.`);
      }
    } else {
      // ---- Freehand "Post" — strictly forward (-y on screen). ----
      // Start far enough off the player marker that the editor
      // resolves the pointerdown as a CANVAS click (drawing route),
      // not a player click (which would either re-select or, with a
      // stray drag, move the player). 35px clearance > the marker's
      // hit radius.
      const upfield = player.fieldRectTop; // smaller y = forward
      const dxToCenter = fieldCenterX - player.cx; // post breaks inside

      // Path waypoints — ALL strictly forward (y < player.cy).
      const stem = { x: player.cx, y: player.cy - 130 }; // 12 yds vertical
      const breakPt = { x: player.cx + dxToCenter * 0.55, y: player.cy - 250 };
      const finishPt = {
        x: player.cx + dxToCenter * 0.85,
        y: Math.max(upfield + 30, player.cy - 320),
      };

      // Validate forward-only invariant before issuing any pointer events.
      const ys = [player.cy, stem.y, breakPt.y, finishPt.y];
      for (let k = 1; k < ys.length; k++) {
        if (ys[k] >= ys[k - 1]) {
          throw new Error(
            `Freehand path violates forward-only invariant at step ${k}`,
          );
        }
      }

      // Begin drag well off the player marker. We start the press at
      // ~110px in front of the player and ~25px to the side. That's
      // unambiguously canvas (player marker is ~32px diameter, label
      // adds ~12px below it). Drawing a route from this anchor is
      // visually equivalent to drawing it from the player itself
      // because the editor connects the route to the player via
      // carrierPlayerId derived from the current selection.
      const startX = player.cx + Math.sign(dxToCenter || 1) * 25;
      const startY = player.cy - 110;
      await moveTo(page, startX, startY);
      await sleep(220);
      await pressDown(page);
      await sleep(180);
      // Nudge the cursor a few px right at the start so the editor's
      // 5px DRAG_THRESHOLD_PX is exceeded immediately and the state
      // transitions from "pending(canvas)" to "drawing_route" before
      // any committed movement.
      await moveTo(page, startX + 8, startY - 4);
      await sleep(40);

      let prev = { x: startX + 8, y: startY - 4 };
      for (const node of [stem, breakPt, finishPt]) {
        const STEPS = 16;
        for (let s = 1; s <= STEPS; s++) {
          const t = s / STEPS;
          await moveTo(
            page,
            prev.x + (node.x - prev.x) * t,
            prev.y + (node.y - prev.y) * t,
          );
          await sleep(22);
        }
        prev = node;
      }
      await sleep(160);
      await releaseUp(page);
    }
    await sleep(BEAT_SHORT);
  }

  // Click empty area to deselect so Notes panel + Playback panel are
  // accessible without the route-style toolbar.
  await page.keyboard.press("Escape");
  await sleep(160);

  // ---- Type notes with @-mention chips ----
  // The notes card is below the field on desktop — scroll to it first
  // so it's actually in view (and gets recorded).
  const notes = page
    .locator('div[role="textbox"][contenteditable="true"]')
    .first();
  if (await notes.count()) {
    await notes.scrollIntoViewIfNeeded();
    await sleep(BEAT_SHORT);
    await glideToLocator(page, notes);
    await sleep(120);
    await pressDown(page);
    await sleep(80);
    await releaseUp(page);
    await sleep(180);
    // Each @-token followed by a letter autoresolves to a colored chip
    // for the matching player. Splitting on commas/words gives a more
    // human-paced rhythm than a single .type() call.
    const tokens = [
      "@Q",
      " fakes the handoff, then hits ",
      "@yellow",
      " on the corner.",
    ];
    for (const tok of tokens) {
      await page.keyboard.type(tok, { delay: 28 });
      await sleep(80);
    }
    await sleep(BEAT_SHORT);
  }

  // Deselect any text selection / panel so the Playback panel renders.
  await page.keyboard.press("Escape");
  await sleep(140);
  await moveTo(page, 40, 800);
  await sleep(120);
  await pressDown(page);
  await sleep(60);
  await releaseUp(page);
  await sleep(BEAT_SHORT);

  // ---- Click the primary Playback button (Motion / Play). ----
  const playbackPanel = page
    .locator('div:has(> p:text-is("Playback"))')
    .first();
  const motion = playbackPanel
    .getByRole("button", { name: /^(motion|play|replay|snap)$/i })
    .first();
  if (await motion.count()) {
    await clickLocator(page, motion);
    await sleep(BEAT_MED);
    // If a motion phase fired, the button retitles to "Play" — click again.
    const play2 = playbackPanel
      .getByRole("button", { name: /^(play|snap)$/i })
      .first();
    if (await play2.count()) {
      await pressDown(page);
      await sleep(80);
      await releaseUp(page);
      await sleep(BEAT_LONG);
    } else {
      await sleep(BEAT_MED);
    }
  } else {
    await sleep(BEAT_SHORT);
  }

  return { newPlayId };
}

/* -----------------------------------------------------------------------
   Dead-segment compression: build the list of "alive" [start, end]
   segments from deadSegments[], plus helpers to remap original-timeline
   timestamps to the compressed (post-trim) timeline.
   ----------------------------------------------------------------------- */

function buildAliveSegments(totalRecMs) {
  const MIN_ALIVE_MS = 250; // anything shorter is a transition glitch — drop it
  // Merge overlapping dead segments first.
  const sorted = deadSegments
    .slice()
    .sort((a, b) => a.start - b.start);
  const merged = [];
  for (const d of sorted) {
    const last = merged[merged.length - 1];
    if (last && d.start <= last.end) {
      last.end = Math.max(last.end, d.end);
    } else {
      merged.push({ ...d });
    }
  }
  // Complement: alive = [0..d0.start, d0.end..d1.start, ..., dN.end..total].
  let alive = [];
  let cursor = 0;
  for (const d of merged) {
    if (d.start > cursor) alive.push({ start: cursor, end: d.start });
    cursor = Math.max(cursor, d.end);
  }
  if (cursor < totalRecMs) alive.push({ start: cursor, end: totalRecMs });

  // Drop tiny alive slivers (the few-ms gap between recordStartTs and
  // the first `dead()` block, for instance) so the trim doesn't leak a
  // single frame of about:blank into the final video.
  alive = alive.filter((a) => a.end - a.start >= MIN_ALIVE_MS);
  return { alive, dead: merged };
}

function remapToCompressed(tOrig, alive) {
  // Returns the compressed-timeline ms for an event at tOrig, or null
  // if tOrig falls inside a dead segment (in which case the event
  // should be dropped from the cursor path).
  let offset = 0;
  for (const seg of alive) {
    if (tOrig < seg.start) return null; // event was inside a dead gap
    if (tOrig <= seg.end) return offset + (tOrig - seg.start);
    offset += seg.end - seg.start;
  }
  return offset; // past end — pin to total
}

/* -----------------------------------------------------------------------
   Cursor PNG sequence — composite a soft round cursor on top of a
   transparent canvas at every frame, interpolating between recorded
   path samples (already remapped to the compressed timeline).
   ----------------------------------------------------------------------- */

function sampleCursor(t) {
  // Find the bracketing samples in cursorPath for time t (ms).
  if (cursorPath.length === 0) return { x: -100, y: -100, down: false };
  if (t <= cursorPath[0].t) return cursorPath[0];
  if (t >= cursorPath[cursorPath.length - 1].t)
    return cursorPath[cursorPath.length - 1];
  let lo = 0;
  let hi = cursorPath.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (cursorPath[mid].t <= t) lo = mid;
    else hi = mid;
  }
  const a = cursorPath[lo];
  const b = cursorPath[hi];
  const span = Math.max(1, b.t - a.t);
  const u = (t - a.t) / span;
  return {
    x: a.x + (b.x - a.x) * u,
    y: a.y + (b.y - a.y) * u,
    down: a.down,
  };
}

async function makeCursorImg() {
  // 80px circle with halo + soft shadow. Standard tutorial-video cursor.
  const idle = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
    <defs>
      <radialGradient id="g" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="rgba(242,101,34,0.95)"/>
        <stop offset="55%" stop-color="rgba(242,101,34,0.55)"/>
        <stop offset="100%" stop-color="rgba(242,101,34,0)"/>
      </radialGradient>
      <filter id="s" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="2"/>
      </filter>
    </defs>
    <circle cx="48" cy="48" r="40" fill="url(#g)" filter="url(#s)"/>
    <circle cx="48" cy="48" r="22" fill="rgba(255,255,255,0.18)" stroke="rgba(255,255,255,0.85)" stroke-width="2.5"/>
  </svg>`;
  const down = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
    <defs>
      <radialGradient id="g" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="rgba(242,101,34,1)"/>
        <stop offset="60%" stop-color="rgba(242,101,34,0.7)"/>
        <stop offset="100%" stop-color="rgba(242,101,34,0)"/>
      </radialGradient>
    </defs>
    <circle cx="48" cy="48" r="42" fill="rgba(242,101,34,0.18)"/>
    <circle cx="48" cy="48" r="34" fill="url(#g)"/>
    <circle cx="48" cy="48" r="18" fill="rgba(255,255,255,0.35)" stroke="rgba(255,255,255,1)" stroke-width="3"/>
  </svg>`;
  const idleBuf = await sharp(Buffer.from(idle)).png().toBuffer();
  const downBuf = await sharp(Buffer.from(down)).png().toBuffer();
  return { idleBuf, downBuf, size: 96 };
}

async function generateCursorFrames(durationMs) {
  await rm(FRAMES_DIR, { recursive: true, force: true });
  await mkdir(FRAMES_DIR, { recursive: true });
  const { idleBuf, downBuf, size } = await makeCursorImg();
  const totalFrames = Math.ceil((durationMs / 1000) * FPS);
  console.log(`Compositing ${totalFrames} cursor frames…`);

  // Build empty transparent base once, then composite per frame.
  const baseSpec = {
    create: {
      width: VIEWPORT.width,
      height: VIEWPORT.height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  };

  // Process in parallel chunks for throughput.
  const CHUNK = 16;
  for (let i = 0; i < totalFrames; i += CHUNK) {
    const ops = [];
    for (let j = 0; j < CHUNK && i + j < totalFrames; j++) {
      const idx = i + j;
      const tMs = (idx / FPS) * 1000;
      const c = sampleCursor(tMs);
      // For "click ripple" pulse: keep down-frame variant briefly after a
      // pointerup as well so the ripple lingers.
      const recentDown = cursorPath.find(
        (p, k, arr) =>
          k > 0 &&
          arr[k - 1].down &&
          !p.down &&
          tMs >= arr[k - 1].t &&
          tMs <= arr[k - 1].t + 220,
      );
      const useDown = c.down || !!recentDown;
      const buf = useDown ? downBuf : idleBuf;
      const left = Math.round(c.x - size / 2);
      const top = Math.round(c.y - size / 2);
      ops.push(
        sharp(baseSpec)
          .composite([{ input: buf, left, top }])
          .png()
          .toFile(path.join(FRAMES_DIR, `f_${idx.toString().padStart(5, "0")}.png`)),
      );
    }
    await Promise.all(ops);
  }
}

/* -----------------------------------------------------------------------
   Main
   ----------------------------------------------------------------------- */

async function run() {
  await mkdir(OUT_DIR, { recursive: true });
  await rm(VIDEO_TMP, { recursive: true, force: true });
  await mkdir(VIDEO_TMP, { recursive: true });

  const env = await loadEnv();
  if (!env.SEED_ADMIN_EMAIL || !env.SEED_ADMIN_PASSWORD) {
    throw new Error("SEED_ADMIN_EMAIL/PASSWORD missing");
  }

  // Resolve scene targets.
  const supa = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } },
  );
  const { data: adminList } = await supa.auth.admin.listUsers({ perPage: 200 });
  const adminUser = (adminList?.users ?? []).find(
    (u) => (u.email ?? "").toLowerCase() === env.SEED_ADMIN_EMAIL.toLowerCase(),
  );
  if (!adminUser) throw new Error("seed admin user not found");
  const sceneA = await findScene(supa, adminUser.id, "Flag Football", false);
  const sceneB = await findScene(supa, adminUser.id, "7v7", true);
  console.log("Scene A:", sceneA.playbookName, "→", sceneA.play1.name);
  console.log("Scene B:", sceneB.playbookName, "→", sceneB.play1.name);

  // Pre-warm in a throwaway context so the recording context starts hot.
  console.log("Pre-warming…");
  const warmBrowser = await chromium.launch();
  const warmCtx = await warmBrowser.newContext({ viewport: VIEWPORT });
  const warmPage = await warmCtx.newPage();
  await signIn(warmPage, env.SEED_ADMIN_EMAIL, env.SEED_ADMIN_PASSWORD);
  for (const id of [sceneA.playbookId, sceneB.playbookId]) {
    await warmPage.goto(`${BASE_URL}/playbooks/${id}`, {
      waitUntil: "networkidle",
    });
  }
  await warmPage.goto(`${BASE_URL}/plays/new-preview?playbookId=${sceneA.playbookId}`, {
    waitUntil: "networkidle",
  });
  const storageState = await warmCtx.storageState();
  await warmCtx.close();
  await warmBrowser.close();

  // -----------------------------------------------------------------
  // Real recording.
  // -----------------------------------------------------------------
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1, // recordVideo is at viewport size; keep 1:1
    storageState,
    recordVideo: { dir: VIDEO_TMP, size: VIEWPORT },
  });
  const page = await ctx.newPage();
  // Hide demo / preview banners just in case (admin-owned playbooks
  // shouldn't show them, but defensive).
  await page.addInitScript(() => {
    const css = "[data-demo-banner],[data-preview-banner]{display:none!important;}";
    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
  });

  // The recording starts when the context is created. Anchor the
  // cursor timeline (recordStartTs) to that exact moment, then mark
  // the about:blank → /playbooks/<id> prelude as a dead segment so it
  // gets trimmed in post.
  recordStartTs = Date.now();
  curX = 80;
  curY = 780;
  await page.mouse.move(curX, curY); // initial position
  logCursor();

  await dead(async () => {
    await page.goto(`${BASE_URL}/playbooks/${sceneA.playbookId}`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForLoadState("networkidle");
    await page
      .locator('a[href*="/plays/"]')
      .first()
      .waitFor({ state: "visible", timeout: 20000 });
  });

  const created = [];
  const rA = await runScene(page, sceneA, { alreadyOnPage: true });
  if (rA.newPlayId) created.push(rA.newPlayId);
  const rB = await runScene(page, sceneB);
  if (rB.newPlayId) created.push(rB.newPlayId);

  // Don't screenshot a poster here — we'll extract the very first frame
  // of the final mp4 below so the browser sees zero pixel-jump between
  // poster and playback.

  const totalRecMs = Date.now() - recordStartTs;
  await sleep(400);
  await page.close();
  await ctx.close();
  await browser.close();

  // -----------------------------------------------------------------
  // Cleanup created plays so the admin's playbooks stay tidy.
  // -----------------------------------------------------------------
  if (created.length) {
    console.log(`Cleaning up ${created.length} created play(s)…`);
    await supa.from("plays").delete().in("id", created);
  }

  // -----------------------------------------------------------------
  // Save the recorded webm with a stable name.
  // -----------------------------------------------------------------
  const vids = (await readdir(VIDEO_TMP)).filter((f) => f.endsWith(".webm"));
  if (vids.length === 0) throw new Error("No video captured");
  const rawWebm = path.join(VIDEO_TMP, vids[0]);

  // Persist the cursor path for debugging / re-encode without re-capture.
  await writeFile(
    path.join(VIDEO_TMP, "cursor-path.json"),
    JSON.stringify({ totalRecMs, cursorPath }),
  );

  // -----------------------------------------------------------------
  // Compress: drop dead segments (page-load lulls, modal-spinner
  // windows) from both the source video and the cursor path, so the
  // final tour reads as a fast cut "click → result" everywhere.
  // -----------------------------------------------------------------
  const { alive, dead: deadMerged } = buildAliveSegments(totalRecMs);
  const aliveDurMs = alive.reduce((s, a) => s + (a.end - a.start), 0);
  console.log(
    `Trimming: ${(totalRecMs / 1000).toFixed(1)}s → ${(
      aliveDurMs / 1000
    ).toFixed(1)}s (dropped ${deadMerged.length} dead segment(s))`,
  );

  // Remap cursor path to the compressed timeline.
  const compressedPath = [];
  for (const ev of cursorPath) {
    const tNew = remapToCompressed(ev.t, alive);
    if (tNew == null) continue;
    compressedPath.push({ ...ev, t: tNew });
  }
  cursorPath.length = 0;
  for (const ev of compressedPath) cursorPath.push(ev);

  await generateCursorFrames(aliveDurMs + 200);

  const webmOut = path.join(OUT_DIR, "hero-walkthrough.webm");
  const mp4Out = path.join(OUT_DIR, "hero-walkthrough.mp4");

  // Build trim+concat filter for the source video.
  const trimParts = alive
    .map(
      (seg, i) =>
        `[0:v]trim=start=${(seg.start / 1000).toFixed(3)}:end=${(seg.end / 1000).toFixed(3)},setpts=PTS-STARTPTS[s${i}]`,
    )
    .join(";");
  const concatInputs = alive.map((_, i) => `[s${i}]`).join("");
  const VF =
    `${trimParts};${concatInputs}concat=n=${alive.length}:v=1:a=0[bg0];` +
    `[bg0]format=yuv420p[bg];[1:v]format=rgba[fg];[bg][fg]overlay=0:0:shortest=1`;

  await ffmpeg([
    "-y",
    "-i",
    rawWebm,
    "-framerate",
    String(FPS),
    "-i",
    path.join(FRAMES_DIR, "f_%05d.png"),
    "-filter_complex",
    VF,
    "-r",
    String(FPS),
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

  await ffmpeg([
    "-y",
    "-i",
    rawWebm,
    "-framerate",
    String(FPS),
    "-i",
    path.join(FRAMES_DIR, "f_%05d.png"),
    "-filter_complex",
    VF,
    "-r",
    String(FPS),
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

  // Extract the very first frame (which is now the playbook shelf
  // post-trim) as the poster — guarantees zero pixel-jump between the
  // browser's poster paint and the start of playback.
  const posterPath = path.join(OUT_DIR, "hero-poster.png");
  await ffmpeg([
    "-y",
    "-i",
    mp4Out,
    "-frames:v",
    "1",
    "-q:v",
    "3",
    "-update",
    "1",
    posterPath,
  ]);
  console.log("  ✓", posterPath);

  await rm(VIDEO_TMP, { recursive: true, force: true });
  await rm(FRAMES_DIR, { recursive: true, force: true });
  console.log("\nDone.");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
