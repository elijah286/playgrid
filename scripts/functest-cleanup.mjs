/**
 * Belt-and-suspenders cleanup for the functional-testing harness.
 *
 * Each write-path spec creates entities named with the `__functest` prefix and
 * deletes them in afterAll. If a run crashes before teardown, orphans can linger
 * on production. This script hard-deletes any `__functest`-prefixed playbook
 * older than 1 hour (so it never races a currently-running test), cascading its
 * memberships/invites. Safe to run on a schedule.
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 * Run: node scripts/functest-cleanup.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function loadDotEnvLocal() {
  const p = join(root, ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadDotEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Need NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PREFIX = "__functest";
const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();

async function main() {
  const { data, error } = await admin
    .from("playbooks")
    .delete()
    .like("name", `${PREFIX}%`)
    .lt("created_at", cutoff)
    .select("id");
  if (error) {
    console.error("cleanup failed:", error.message);
    process.exit(1);
  }
  console.log(`Deleted ${data?.length ?? 0} stale ${PREFIX} playbook(s) older than 1h.`);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
