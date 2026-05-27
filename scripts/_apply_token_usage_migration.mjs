import pg from "pg";
import { readFileSync } from "node:fs";

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

const config = {
  host: "aws-1-us-east-2.pooler.supabase.com",
  port: 6543,
  user: `postgres.${ref}`,
  password,
  database: "postgres",
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
};

const sql = readFileSync(
  `${process.env.HOME}/playbook/supabase/migrations/20260527160000_coach_ai_token_usage.sql`,
  "utf8",
);

const client = new pg.Client(config);
console.log("Connecting to pooler @ 6543…");
await client.connect();
console.log("Connected. Applying migration…");
await client.query(sql);
console.log("Migration applied. Verifying…");
const { rows } = await client.query(
  "select column_name, data_type from information_schema.columns where table_name = 'coach_ai_token_usage' order by ordinal_position",
);
console.table(rows);
await client.end();
console.log("Done.");
