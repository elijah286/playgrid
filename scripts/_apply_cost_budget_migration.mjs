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
if (!ref) throw new Error("Could not parse project ref");
const password = env.SUPABASE_DB_PASSWORD;
if (!password) throw new Error("SUPABASE_DB_PASSWORD missing");

const client = new pg.Client({
  host: "aws-1-us-east-2.pooler.supabase.com",
  port: 6543,
  user: `postgres.${ref}`,
  password,
  database: "postgres",
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 45000,
});

const sql = readFileSync(
  `${process.env.HOME}/playbook/supabase/migrations/20260529130000_coach_cal_cost_budget.sql`,
  "utf8",
);

console.log("Connecting…");
await client.connect();
console.log("Applying migration…");
await client.query(sql);
const { rows } = await client.query(
  "select column_name, data_type from information_schema.columns where table_name = 'owner_seat_grants' and column_name like 'purchased_budget%' order by column_name",
);
console.table(rows);
await client.end();
console.log("Done.");
