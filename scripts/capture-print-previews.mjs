#!/usr/bin/env node
/**
 * Capture the wristband and call-sheet print previews from a real example
 * playbook, so the marketing page can show the genuine article instead of
 * hand-drawn mocks.
 *
 * Requires SEED_ADMIN_EMAIL + SEED_ADMIN_PASSWORD in ~/playbook/.env.local
 * (the seeded admin owns the example playbooks, so they can see the full
 * print UI). Writes:
 *   - public/marketing/screens/print-wristband.png
 *   - public/marketing/screens/print-callsheet.png
 *
 * Usage:
 *   BASE_URL=http://localhost:3456 node scripts/capture-print-previews.mjs
 */

import { chromium } from "playwright";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3456";
const OUT_DIR = path.resolve("public/marketing/screens");

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

  const env = await loadEnv();
  const email = env.SEED_ADMIN_EMAIL;
  const password = env.SEED_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error(
      "SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD missing from ~/playbook/.env.local",
    );
  }

  // Use the service-role key to grant the admin a temporary editor
  // membership on the first public example so the print preview actually
  // renders. We revoke it at the end — nothing persists beyond the run.
  const supa = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } },
  );
  const { data: adminList } = await supa.auth.admin.listUsers({ perPage: 200 });
  const adminUser = (adminList?.users ?? []).find(
    (u) => (u.email ?? "").toLowerCase() === email.toLowerCase(),
  );
  if (!adminUser) throw new Error("Seed admin user not found");
  // Prefer an example the admin already owns (no RLS dance needed) so the
  // /print page renders in full. Fall back to any public example and grant
  // the admin temporary editor access.
  const { data: ownedRows } = await supa
    .from("playbook_members")
    .select("playbook_id, role")
    .eq("user_id", adminUser.id)
    .eq("role", "owner");
  const ownedIds = (ownedRows ?? []).map((r) => r.playbook_id);
  let example = null;
  if (ownedIds.length > 0) {
    const { data: owned } = await supa
      .from("playbooks")
      .select("id, name")
      .in("id", ownedIds)
      .eq("is_public_example", true)
      .eq("is_archived", false)
      .limit(1)
      .maybeSingle();
    example = owned ?? null;
  }
  if (!example) {
    const { data: anyEx } = await supa
      .from("playbooks")
      .select("id, name")
      .eq("is_public_example", true)
      .eq("is_archived", false)
      .limit(1)
      .maybeSingle();
    example = anyEx ?? null;
  }
  if (!example) throw new Error("No public example playbook to capture from");
  console.log("Example:", example.id, example.name);

  // Check whether admin is already a member; if not, add them and remember
  // to clean up.
  const { data: existing } = await supa
    .from("playbook_members")
    .select("role")
    .eq("playbook_id", example.id)
    .eq("user_id", adminUser.id)
    .maybeSingle();
  let addedMembership = false;
  if (!existing) {
    const { error: insErr } = await supa.from("playbook_members").insert({
      playbook_id: example.id,
      user_id: adminUser.id,
      role: "editor",
    });
    if (insErr) throw insErr;
    addedMembership = true;
  }

  const browser = await chromium.launch();
  // Desktop-ish viewport — print preview uses a wide two-pane layout.
  const ctx = await browser.newContext({
    viewport: { width: 1400, height: 1000 },
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();

  // Sign in via the two-step email → password flow.
  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
  await page.locator('input[type="email"]').fill(email);
  await page.getByRole("button", { name: /continue|next|sign in/i }).first().click();
  await page.locator('input[type="password"]').waitFor({ timeout: 10000 });
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: /sign in|log in|continue/i }).first().click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), {
    timeout: 15000,
  });
  console.log("Signed in.");

  const href = `/playbooks/${example.id}`;
  await page.goto(`${BASE_URL}${href}/print`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);

  async function clickButton(labelRe) {
    const btn = page.getByRole("button", { name: labelRe, exact: false });
    const n = await btn.count();
    for (let i = 0; i < n; i++) {
      const candidate = btn.nth(i);
      if (await candidate.isVisible().catch(() => false)) {
        await candidate.click().catch(() => {});
        return true;
      }
    }
    return false;
  }

  const preview = page.getByRole("button", { name: /open preview fullscreen/i });
  await preview.waitFor({ timeout: 10000 });

  // Ensure a good chunk of plays is selected so the preview looks full.
  await clickButton(/^select shown$/i);
  await page.waitForTimeout(600);

  // ---- 1) CALL SHEET (default product = "playsheet")
  await page.waitForTimeout(1200);
  const callOut = path.join(OUT_DIR, "print-callsheet-v2.png");
  await preview.screenshot({ path: callOut });
  console.log("  ✓", callOut);

  // ---- 2) WRISTBAND — switch via the Layout tab's product control.
  await clickButton(/^layout$/i);
  await page.waitForTimeout(500);
  await clickButton(/^wristband$/i);
  await page.waitForTimeout(700);

  // Go back to Plays tab to re-select (some controls pick up stale state).
  await clickButton(/^plays\b/i);
  await page.waitForTimeout(400);
  await clickButton(/^select shown$/i);
  await page.waitForTimeout(500);

  // Marketing shows a single wristband card, so pick "Individual band".
  await clickButton(/^individual band$/i);
  await page.waitForTimeout(1200);

  await preview.waitFor({ timeout: 10000 });
  await page.waitForTimeout(1200);
  const wristOut = path.join(OUT_DIR, "print-wristband-v2.png");
  // Screenshot just the inner SVG, cropped tight to the wristband art —
  // no surrounding "page" margin. The preview button has the SVG as a
  // direct child via dangerouslySetInnerHTML.
  const svg = preview.locator("svg").first();
  await svg.waitFor({ timeout: 8000 });
  await svg.screenshot({ path: wristOut, omitBackground: false });
  console.log("  ✓", wristOut);

  await page.close();
  await ctx.close();
  await browser.close();

  if (addedMembership) {
    await supa
      .from("playbook_members")
      .delete()
      .eq("playbook_id", example.id)
      .eq("user_id", adminUser.id);
    console.log("Removed temporary membership.");
  }

  console.log("\nDone.");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
