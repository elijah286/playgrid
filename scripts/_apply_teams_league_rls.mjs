/**
 * Apply 20260621230000_teams_league_rls.sql to prod via the Supabase transaction
 * pooler (the local supabase CLI isn't authed here).
 *
 * Reads SUPABASE_DB_PASSWORD + NEXT_PUBLIC_SUPABASE_URL from the repo .env.local.
 * Run: node scripts/_apply_teams_league_rls.mjs
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
  new URL("../supabase/migrations/20260621230000_teams_league_rls.sql", import.meta.url),
);
const sql = readFileSync(sqlPath, "utf8");

const client = new pg.Client(config);
console.log("Connecting to pooler @ 6543…");
await client.connect();
console.log("Connected. Applying migration…");

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

for (const [i, stmt] of stmts.entries()) {
  const preview = stmt.replace(/\s+/g, " ").slice(0, 80);
  process.stdout.write(`  [${i + 1}/${stmts.length}] ${preview}… `);
  try {
    await client.query(stmt);
    console.log("ok");
  } catch (e) {
    if (e.code === "42P07" || e.code === "42710" || e.code === "42701") {
      console.log("ok (already exists)");
    } else {
      console.log("FAILED");
      console.error(`  Error: ${e.message} (code ${e.code})`);
      await client.end();
      process.exit(1);
    }
  }
}

const version = "20260621230000";
const name = "teams_league_rls";
try {
  await client.query(
    "insert into supabase_migrations.schema_migrations (version, name) values ($1, $2) on conflict (version) do nothing",
    [version, name],
  );
  console.log(`Tracked migration version=${version} in schema_migrations.`);
} catch (e) {
  console.log(`Could not insert into schema_migrations (${e.message}) — may need manual tracking.`);
}

console.log("\nVerifying (the schema change actually landed):");
// 1. Both new policies exist on public.teams, and each is guarded on league_id.
const pol = await client.query(
  `select policyname, cmd, qual, with_check
     from pg_policies
    where schemaname = 'public' and tablename = 'teams'
    order by policyname`,
);
console.log("  pg_policies on public.teams:");
for (const r of pol.rows) {
  console.log(`    - ${r.policyname} (${r.cmd})`);
  console.log(`        using:      ${r.qual}`);
  if (r.with_check) console.log(`        with check: ${r.with_check}`);
}
const member = pol.rows.find((r) => r.policyname === "teams_league_member_read");
const admin = pol.rows.find((r) => r.policyname === "teams_league_admin_write");
const ok =
  member && admin &&
  /league_id IS NOT NULL/i.test(member.qual ?? "") &&
  /league_id IS NOT NULL/i.test(admin.qual ?? "");
console.log(`\n  Both policies present and guarded on league_id IS NOT NULL: ${ok ? "YES" : "NO — investigate"}`);
console.log("  (coach teams have league_id IS NULL, so these policies never apply to them)");

await client.end();
console.log("\nDone.");
