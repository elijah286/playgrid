#!/usr/bin/env node
/**
 * Capture a desktop walkthrough video for the marketing page hero:
 * examples shelf → hover a book → open a playbook → scroll plays →
 * click a play → open the editor → type notes.
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
import { mkdir, readFile, rename, rm, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3456";
const OUT_DIR = path.resolve("public/marketing/screens");
const VIDEO_TMP = path.resolve(".capture-video-hero");

// Pacing — "can a coach follow this on a marketing page?"
const BEAT_SHORT = 600;
const BEAT_MED = 1200;
const BEAT_LONG = 2000;
const GLIDE_MS = 850;

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

async function run() {
  await mkdir(OUT_DIR, { recursive: true });
  await rm(VIDEO_TMP, { recursive: true, force: true });
  await mkdir(VIDEO_TMP, { recursive: true });

  const env = await loadEnv();
  const email = env.SEED_ADMIN_EMAIL;
  const password = env.SEED_ADMIN_PASSWORD;
  const useAuth = Boolean(email && password);

  // Pick an admin-owned public example so the editor renders the full
  // editing UI (notes field, route handles) instead of the locked
  // preview you get as a non-member.
  let targetPlaybookId = null;
  let targetPlayId = null;
  if (useAuth) {
    const supa = createClient(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } },
    );
    const { data: adminList } = await supa.auth.admin.listUsers({
      perPage: 200,
    });
    const adminUser = (adminList?.users ?? []).find(
      (u) => (u.email ?? "").toLowerCase() === email.toLowerCase(),
    );
    if (adminUser) {
      const { data: ownedRows } = await supa
        .from("playbook_members")
        .select("playbook_id")
        .eq("user_id", adminUser.id)
        .eq("role", "owner");
      const ownedIds = (ownedRows ?? []).map((r) => r.playbook_id);
      if (ownedIds.length > 0) {
        const { data: pb } = await supa
          .from("playbooks")
          .select("id, name")
          .in("id", ownedIds)
          .eq("is_public_example", true)
          .eq("is_archived", false)
          .limit(1)
          .maybeSingle();
        targetPlaybookId = pb?.id ?? null;
        if (targetPlaybookId) {
          const { data: play } = await supa
            .from("plays")
            .select("id, name, sort_order")
            .eq("playbook_id", targetPlaybookId)
            .order("sort_order", { ascending: false })
            .limit(1)
            .maybeSingle();
          targetPlayId = play?.id ?? null;
          console.log("Target:", pb?.name, "play:", play?.name);
        }
      }
    }
  }

  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    recordVideo: { dir: VIDEO_TMP, size: { width: 1440, height: 900 } },
  });
  const page = await ctx.newPage();
  await installCursor(page);

  // Sign in if we have creds. Otherwise capture a logged-out tour
  // (examples → example playbook → locked editor preview).
  if (useAuth) {
    await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
    await page.locator('input[type="email"]').fill(email);
    await page
      .getByRole("button", { name: /continue|next|sign in/i })
      .first()
      .click();
    await page.locator('input[type="password"]').waitFor({ timeout: 10000 });
    await page.locator('input[type="password"]').fill(password);
    await page
      .getByRole("button", { name: /sign in|log in|continue/i })
      .first()
      .click();
    await page.waitForURL((u) => !u.pathname.startsWith("/login"), {
      timeout: 15000,
    });
    console.log("Signed in.");
  }

  // ---- Step 1: bookshelf of playbooks.
  await page.goto(`${BASE_URL}/examples`, { waitUntil: "networkidle" });
  await page.waitForTimeout(BEAT_MED);
  await page.mouse.move(80, 780);
  await sleep(BEAT_SHORT);
  await shot(page, "hero-1-shelf");

  // ---- Step 2: hover over the first book so its open animation plays.
  const firstTile = page
    .locator('a[href^="/playbooks/"]')
    .first();
  await firstTile.waitFor({ timeout: 10000 });
  await glideToLocator(page, firstTile);
  await sleep(BEAT_LONG); // let the book "open" animation play through
  await shot(page, "hero-2-hover");

  // ---- Step 3: click → playbook detail.
  const href = targetPlaybookId
    ? `/playbooks/${targetPlaybookId}`
    : (await firstTile.getAttribute("href")) ?? "/examples";
  await page.mouse.down();
  await sleep(80);
  await page.mouse.up();
  await page.waitForURL(new RegExp(href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), {
    timeout: 15000,
  });
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(BEAT_MED);
  await shot(page, "hero-3-playbook");

  // ---- Step 4: scroll down through the plays grid.
  await glideTo(page, 720, 600);
  for (let i = 0; i < 4; i++) {
    await page.mouse.wheel(0, 260);
    await sleep(500);
  }
  await sleep(BEAT_MED);
  await shot(page, "hero-4-plays");

  // ---- Step 5: click a play at/near the bottom → editor.
  let playTile = page.locator('a[href*="/plays/"][href*="/edit"]');
  if (targetPlayId) {
    playTile = page.locator(`a[href="/plays/${targetPlayId}/edit"]`);
  }
  const playCount = await playTile.count();
  if (playCount > 0) {
    const target = playTile.nth(Math.min(playCount - 1, playCount > 3 ? playCount - 1 : 0));
    await target.scrollIntoViewIfNeeded();
    await sleep(400);
    await glideToLocator(page, target);
    await sleep(BEAT_SHORT);
    await page.mouse.down();
    await sleep(80);
    await page.mouse.up();
    await page.waitForURL(/\/plays\/[^/]+\/edit/, { timeout: 15000 });
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(BEAT_MED);
    await shot(page, "hero-5-editor");

    // ---- Step 6: open/focus the notes field and type.
    const addNotes = page.getByRole("button", { name: /add notes|edit notes/i });
    if (await addNotes.count()) {
      await glideToLocator(page, addNotes.first());
      await sleep(BEAT_SHORT);
      await page.mouse.down();
      await sleep(80);
      await page.mouse.up();
      await sleep(BEAT_SHORT);
    }
    const notesArea = page.locator(
      'textarea[placeholder*="notes" i], [contenteditable="true"][aria-label*="notes" i], [contenteditable="true"]',
    );
    const notesCount = await notesArea.count();
    if (notesCount > 0) {
      const n = notesArea.first();
      await glideToLocator(page, n);
      await sleep(BEAT_SHORT);
      await n.click().catch(() => {});
      await sleep(400);
      await page.keyboard.type("Hit the seam — @Y checks safety then runs ", {
        delay: 35,
      });
      await sleep(500);
      await page.keyboard.type("post.", { delay: 40 });
      await sleep(BEAT_LONG);
      await shot(page, "hero-6-notes");
    } else {
      await sleep(BEAT_LONG);
      await shot(page, "hero-6-notes");
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
