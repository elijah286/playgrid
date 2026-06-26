/**
 * Seeds the two dedicated accounts the functional-testing harness drives:
 *   - a "coach" account (creates playbooks, sends invites, asks Coach AI)
 *   - a "player" account (accepts invites)
 *
 * Both default to the @xogridmaker.com domain, which the analytics layer treats
 * as internal and excludes automatically (see
 * src/lib/site/analytics-exclusions-config.ts) — so test traffic never skews the
 * Traffic / App-metrics / Activation dashboards. No exclusion-list edit needed.
 *
 * Requires (.env.local locally, or env in CI):
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *   FUNC_TEST_COACH_PASSWORD, FUNC_TEST_PLAYER_PASSWORD
 * Optional overrides:
 *   FUNC_TEST_COACH_EMAIL  (default functest-coach@xogridmaker.com)
 *   FUNC_TEST_PLAYER_EMAIL (default functest-player@xogridmaker.com)
 *
 * Run: npm run seed:functest
 *
 * NOTE: the Coach AI scenario needs Cal enabled for the coach account. Cal is
 * gated; flip its beta/entitlement flag for the coach separately (or the Cal
 * spec skips itself when Cal isn't available). This script intentionally does
 * not guess that gate.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function loadDotEnvLocal() {
  const p = join(root, ".env.local");
  if (!existsSync(p)) return; // CI supplies env directly
  const raw = readFileSync(p, "utf8");
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadDotEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const coachEmail = process.env.FUNC_TEST_COACH_EMAIL || "functest-coach@xogridmaker.com";
const playerEmail = process.env.FUNC_TEST_PLAYER_EMAIL || "functest-player@xogridmaker.com";
const coachPassword = process.env.FUNC_TEST_COACH_PASSWORD;
const playerPassword = process.env.FUNC_TEST_PLAYER_PASSWORD;

if (!url || !serviceKey || !coachPassword || !playerPassword) {
  console.error(
    "Need NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, FUNC_TEST_COACH_PASSWORD, FUNC_TEST_PLAYER_PASSWORD",
  );
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function ensureAccount(email, password, displayName) {
  const { data: listData, error: listErr } = await admin.auth.admin.listUsers({
    perPage: 1000,
    page: 1,
  });
  if (listErr) throw new Error(`listUsers: ${listErr.message}`);

  let userId = (listData.users ?? []).find(
    (u) => u.email?.toLowerCase() === email.toLowerCase(),
  )?.id;

  if (userId) {
    // Keep the password in sync so CI can always sign in.
    const { error } = await admin.auth.admin.updateUserById(userId, { password });
    if (error) throw new Error(`updateUser(${email}): ${error.message}`);
    console.log("Updated existing:", email);
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw new Error(`createUser(${email}): ${error.message}`);
    userId = data.user?.id;
    if (!userId) throw new Error(`No user id for ${email}`);
    console.log("Created:", email);
  }

  // Profile is normally auto-created by handle_new_user; upsert to be safe and
  // set a recognizable display name. We deliberately do NOT pre-accept Terms —
  // the harness clicks through the "Agree to our terms" gate in the UI exactly
  // like a real new user does (handled in signIn).
  const { error: upErr } = await admin
    .from("profiles")
    .upsert({ id: userId, display_name: displayName }, { onConflict: "id" });
  if (upErr) throw new Error(`profiles upsert(${email}): ${upErr.message}`);
  return userId;
}

/**
 * Put the coach on Team Coach via a comp grant. Inviting players / sharing is a
 * paid feature, and the coaches who actually do this are paying customers — so a
 * realistic "coach who builds a team" account is on Team Coach. This provisions
 * the account's PLAN (we can't run Stripe in a test); the test scenarios still
 * perform every coach ACTION through the real UI. comp_grants feeds the
 * user_entitlements view (subscriptions ∪ comp_grants).
 */
async function ensureTeamCoach(userId) {
  const { data: ex } = await admin
    .from("comp_grants")
    .select("id")
    .eq("user_id", userId)
    .eq("tier", "coach")
    .is("revoked_at", null)
    .maybeSingle();
  if (ex) {
    console.log("Coach already on Team Coach (comp).");
    return;
  }
  const { error } = await admin
    .from("comp_grants")
    .insert({ user_id: userId, tier: "coach", note: "functional-test coach account" });
  if (error) throw new Error(`comp_grant: ${error.message}`);
  console.log("Granted Team Coach comp to coach.");
}

async function main() {
  const coachId = await ensureAccount(coachEmail, coachPassword, "Functest Coach");
  const playerId = await ensureAccount(playerEmail, playerPassword, "Functest Player");
  await ensureTeamCoach(coachId);
  console.log(JSON.stringify({ coachId, playerId, coachEmail, playerEmail }, null, 2));
  console.log(
    "\nBoth accounts are on @xogridmaker.com → auto-excluded from analytics. Done.",
  );
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
