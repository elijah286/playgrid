/**
 * Ensures SEED_ADMIN_EMAIL exists in Supabase Auth and has profiles.role = 'admin'.
 * Requires: .env.local with NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *           SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD
 * Run: npm run seed:admin
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
const email = process.env.SEED_ADMIN_EMAIL;
const password = process.env.SEED_ADMIN_PASSWORD;

if (!url || !serviceKey || !email || !password) {
  console.error(
    "Need NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD in .env.local",
  );
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  let userId = null;

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
    userId = existing.id;
    console.log("User already exists:", email);
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) {
      console.error("createUser:", error.message);
      process.exit(1);
    }
    userId = data.user?.id;
    if (!userId) {
      console.error("No user id returned");
      process.exit(1);
    }
    console.log("Created user:", email);
  }

  const { error: upErr } = await admin.from("profiles").upsert(
    {
      id: userId,
      display_name: email.split("@")[0] ?? email,
      role: "admin",
    },
    { onConflict: "id" },
  );

  if (upErr) {
    console.error("profiles upsert:", upErr.message);
    console.error(
      "Apply migrations first (see supabase/apply_remote.sql or npm run db:push), then run seed again.",
    );
    process.exit(1);
  }

  console.log("Profile set to admin for", email);
}

main();
