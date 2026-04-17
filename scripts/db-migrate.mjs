/**
 * Apply all SQL in supabase/migrations/ to your hosted Supabase project via the CLI.
 * No SQL Editor paste — uses `supabase link` + `supabase db push`.
 *
 * Requires in .env.local:
 *   - NEXT_PUBLIC_SUPABASE_URL (https://<project-ref>.supabase.co)
 *   - SUPABASE_DB_PASSWORD (Database password from Supabase → Project Settings → Database)
 *
 * First time on this machine you also need either:
 *   - `npx supabase login` (browser), or
 *   - SUPABASE_ACCESS_TOKEN (Account → Access Tokens at supabase.com/dashboard)
 *
 * Run: npm run db:migrate
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

function parseProjectRef(url) {
  if (!url) return null;
  const m = String(url).match(/https?:\/\/([a-z0-9-]+)\.supabase\.co/i);
  return m ? m[1] : null;
}

function run(label, cmd, args, extraEnv = {}) {
  console.error(`\n→ ${label}`);
  const env = { ...process.env, CI: "true", ...extraEnv };
  const shell = process.platform === "win32";
  const r = spawnSync(cmd, args, {
    cwd: root,
    stdio: "inherit",
    env,
    shell,
  });
  if (r.status !== 0) {
    console.error(`\n${label} failed (exit ${r.status ?? "unknown"}).`);
    process.exit(r.status ?? 1);
  }
}

loadDotEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const password = process.env.SUPABASE_DB_PASSWORD;
const projectRef =
  process.env.SUPABASE_PROJECT_REF || parseProjectRef(url);

if (!password) {
  console.error("Set SUPABASE_DB_PASSWORD in .env.local (Database password in Supabase dashboard).");
  process.exit(1);
}
if (!projectRef) {
  console.error(
    "Could not infer project ref. Set SUPABASE_PROJECT_REF or NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co",
  );
  process.exit(1);
}

// Prefer HTTPS DNS resolver (helps some networks where IPv6 / direct DNS fails)
const sb = ["supabase", "--dns-resolver", "https"];

run(`Link project ${projectRef}`, "npx", [...sb, "link", "--project-ref", projectRef, "-p", password, "--yes"]);

run("Push migrations", "npx", [...sb, "db", "push", "-p", password, "--yes"]);

console.error("\nMigrations applied on remote.");
