/**
 * Apply 20260702120000_backfill_playbook_invite_referrers.sql to prod via
 * the Supabase transaction pooler (the local supabase CLI isn't authed
 * here).
 *
 * Reads SUPABASE_DB_PASSWORD + NEXT_PUBLIC_SUPABASE_URL from the repo .env.local.
 * Run: node scripts/_apply_backfill_playbook_invite_referrers.mjs
 */
import pg from "pg";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const envPath = fileURLToPath(new URL("../.env.local", import.meta.url));
const env = Object.fromEntries(
  readFileSync(envPath, "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, "")];
    }),
);

const ref = (env.NEXT_PUBLIC_SUPABASE_URL ?? "").match(/https:\/\/([a-z0-9]+)\./)?.[1];
if (!ref) throw new Error("Could not parse project ref from NEXT_PUBLIC_SUPABASE_URL");
const password = env.SUPABASE_DB_PASSWORD;
if (!password) throw new Error("SUPABASE_DB_PASSWORD missing");

const config = {
  host: "aws-1-us-east-2.pooler.supabase.com",
  port: 6543,
  user: `postgres.${ref}`,
  password,
  database: "postgres",
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
};

const sqlPath = fileURLToPath(
  new URL(
    "../supabase/migrations/20260702120000_backfill_playbook_invite_referrers.sql",
    import.meta.url,
  ),
);
const sql = readFileSync(sqlPath, "utf8");

const client = new pg.Client(config);
console.log("Connecting to pooler @ 6543…");
await client.connect();
console.log("Connected. Applying backfill…");

const stmts = sql
  .split(/;\s*\n/)
  .map((s) =>
    s
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n")
      .trim(),
  )
  .filter((s) => s.length > 0);

let backfilled = [];
for (const [i, stmt] of stmts.entries()) {
  const preview = stmt.replace(/\s+/g, " ").slice(0, 80);
  process.stdout.write(`  [${i + 1}/${stmts.length}] ${preview}… `);
  try {
    const res = await client.query(stmt);
    backfilled = res.rows ?? [];
    console.log(`ok (${res.rowCount ?? 0} row(s))`);
  } catch (e) {
    console.log("FAILED");
    console.error(`  Error: ${e.message} (code ${e.code})`);
    await client.end();
    process.exit(1);
  }
}

console.log(`\nBackfilled ${backfilled.length} historical signup notice(s):`);
for (const r of backfilled) {
  console.log(`  - ${r.user_display_name || r.user_email || r.id}`);
}

const version = "20260702120000";
const name = "backfill_playbook_invite_referrers";
try {
  await client.query(
    "insert into supabase_migrations.schema_migrations (version, name) values ($1, $2) on conflict (version) do nothing",
    [version, name],
  );
  console.log(`\nTracked migration version=${version} in schema_migrations.`);
} catch (e) {
  console.log(`Could not insert into schema_migrations (${e.message}) — may need manual tracking.`);
}

console.log("\nVerifying target user (johnsonjustin11@hotmail.com):");
const check = await client.query(
  `select body, detail from public.system_notices
     where kind = 'user_signup' and user_email = $1
     order by created_at desc limit 1`,
  ["johnsonjustin11@hotmail.com"],
);
if (check.rows[0]) {
  console.log(`  body: ${check.rows[0].body}`);
  console.log(`  detail.invited_by_email: ${check.rows[0].detail?.invited_by_email ?? "(still null)"}`);
  console.log(`  detail.invited_by_name:  ${check.rows[0].detail?.invited_by_name ?? "(still null)"}`);
} else {
  console.log("  No user_signup notice found for that email.");
}

await client.end();
console.log("\nDone.");
