import pg from "pg";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const env = Object.fromEntries(
  readFileSync(`${process.env.HOME}/playbook/.env.local`, "utf8")
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

const client = new pg.Client({
  host: "aws-1-us-east-2.pooler.supabase.com",
  port: 6543,
  user: `postgres.${ref}`,
  password,
  database: "postgres",
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
});

const sqlPath = fileURLToPath(
  new URL("../supabase/migrations/20260609120000_site_settings_meta_pixel_id.sql", import.meta.url),
);
const sql = readFileSync(sqlPath, "utf8");
const stmts = sql
  .split(/;\s*\n/)
  .map((s) => s.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n").trim())
  .filter((s) => s.length > 0);

console.log("Connecting to pooler @ 6543…");
await client.connect();
console.log("Connected. Applying migration…");
for (const [i, stmt] of stmts.entries()) {
  process.stdout.write(`  [${i + 1}/${stmts.length}] ${stmt.replace(/\s+/g, " ").slice(0, 80)}… `);
  try {
    await client.query(stmt);
    console.log("ok");
  } catch (e) {
    if (e.code === "42701" || e.code === "42P07" || e.code === "42710") console.log("ok (already exists)");
    else { console.log("FAILED"); console.error(`  Error: ${e.message} (code ${e.code})`); await client.end(); process.exit(1); }
  }
}
try {
  await client.query(
    "insert into supabase_migrations.schema_migrations (version, name) values ($1, $2) on conflict (version) do nothing",
    ["20260609120000", "site_settings_meta_pixel_id"],
  );
  console.log("Tracked migration version=20260609120000.");
} catch (e) { console.log(`Could not track (${e.message}).`); }

const res = await client.query(
  "select column_name, data_type from information_schema.columns where table_schema='public' and table_name='site_settings' and column_name='meta_pixel_id'",
);
console.log("Verify column:", JSON.stringify(res.rows));
await client.end();
console.log("Done.");
