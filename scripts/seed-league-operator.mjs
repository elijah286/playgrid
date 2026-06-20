/**
 * Provisions the league-operator TEST account + a seeded test league + an
 * operator membership. Mirrors scripts/seed-admin.mjs (service-role key).
 *
 * Run AFTER the Wave 0 migrations are applied to the target Supabase project.
 * Idempotent: re-running reconciles the user, profile, league, and membership.
 *
 * Requires in .env.local:
 *   - NEXT_PUBLIC_SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 *   - SEED_LEAGUE_OPERATOR_PASSWORD        (the credential — never committed)
 *   - SEED_LEAGUE_OPERATOR_EMAIL           (optional; defaults below)
 *
 * Run: node scripts/seed-league-operator.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function loadDotEnvLocal() {
  const p = join(root, ".env.local");
  if (!existsSync(p)) {
    console.error("Missing .env.local");
    process.exit(1);
  }
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
const email = process.env.SEED_LEAGUE_OPERATOR_EMAIL || "league@xogridmaker.com";
const password = process.env.SEED_LEAGUE_OPERATOR_PASSWORD;

const LEAGUE_NAME = "Waco Test League";
const LEAGUE_SLUG = "waco-test";

if (!url || !serviceKey || !password) {
  console.error(
    "Need NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and SEED_LEAGUE_OPERATOR_PASSWORD in .env.local",
  );
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function ensureUser() {
  const { data: listData, error: listErr } = await admin.auth.admin.listUsers({
    perPage: 200,
    page: 1,
  });
  if (listErr) {
    console.error("listUsers:", listErr.message);
    process.exit(1);
  }
  const existing = (listData.users ?? []).find(
    (u) => u.email?.toLowerCase() === email.toLowerCase(),
  );
  if (existing) {
    console.log("User already exists:", email);
    return existing.id;
  }
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) {
    console.error("createUser:", error.message);
    process.exit(1);
  }
  console.log("Created user:", email);
  return data.user?.id;
}

async function ensureProfile(userId) {
  // Operators are NOT site admins — role stays 'user'. League powers come from
  // the league_members row, never from profiles.role.
  const { error } = await admin.from("profiles").upsert(
    { id: userId, display_name: "League Operator", role: "user" },
    { onConflict: "id" },
  );
  if (error) {
    console.error("profiles upsert:", error.message);
    console.error("Apply the Wave 0 migrations first, then re-run.");
    process.exit(1);
  }
}

async function ensureLeague(userId) {
  const { data: existing } = await admin
    .from("leagues")
    .select("id")
    .eq("slug", LEAGUE_SLUG)
    .maybeSingle();
  if (existing?.id) {
    console.log("League already exists:", LEAGUE_SLUG);
    return existing.id;
  }
  const { data, error } = await admin
    .from("leagues")
    .insert({
      name: LEAGUE_NAME,
      slug: LEAGUE_SLUG,
      sport: "football",
      created_by: userId,
    })
    .select("id")
    .single();
  if (error) {
    console.error("leagues insert:", error.message);
    process.exit(1);
  }
  console.log("Created league:", LEAGUE_NAME);
  return data.id;
}

async function ensureMembership(leagueId, userId) {
  const { error } = await admin.from("league_members").upsert(
    { league_id: leagueId, user_id: userId, role: "operator" },
    { onConflict: "league_id,user_id,role" },
  );
  if (error) {
    console.error("league_members upsert:", error.message);
    process.exit(1);
  }
  console.log("Operator membership ensured for", email);
}

async function main() {
  const userId = await ensureUser();
  if (!userId) {
    console.error("No user id resolved");
    process.exit(1);
  }
  await ensureProfile(userId);
  const leagueId = await ensureLeague(userId);
  await ensureMembership(leagueId, userId);
  console.log("\nDone. Sign in as", email, "and visit /league.");
}

main();
