#!/usr/bin/env node
/**
 * Cal-into-Coach cutover.
 *
 * Flips the runtime `coach_ai_tier_enabled` site setting to `false` so
 * the Coach Pro column disappears from the public pricing page in
 * production. The code-level fold-Cal-into-Coach changes (Cal access
 * gated by Coach tier, 50 msg/mo cap, copy sweep) ship with the same
 * deploy — this script is the one runtime flip that needs to land
 * after merge, since the toggle controls production behavior outside
 * of the code path.
 *
 * Idempotent. Reads first, reports current state, asks before writing.
 * Confirm with `--yes` to skip the prompt (CI / scripted use).
 *
 * Run:
 *   node scripts/cal-into-coach-cutover.mjs           # interactive
 *   node scripts/cal-into-coach-cutover.mjs --yes     # skip confirm
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

const env = Object.fromEntries(
  readFileSync(`${process.env.HOME}/playbook/.env.local`, "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, "")];
    }),
);

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const { data, error } = await sb
  .from("site_settings")
  .select("coach_ai_tier_enabled, free_max_plays_per_playbook, coach_ai_eval_days")
  .eq("id", "default")
  .maybeSingle();

if (error) {
  console.error("Failed to read site_settings:", error.message);
  process.exit(1);
}

console.log("Current site_settings:");
console.log("  coach_ai_tier_enabled:    ", data?.coach_ai_tier_enabled);
console.log("  free_max_plays_per_playbook:", data?.free_max_plays_per_playbook);
console.log("  coach_ai_eval_days:        ", data?.coach_ai_eval_days);

if (data?.coach_ai_tier_enabled === false) {
  console.log("\nNothing to do — coach_ai_tier_enabled is already false.");
  process.exit(0);
}

const skipPrompt = process.argv.includes("--yes");
if (!skipPrompt) {
  const rl = createInterface({ input: stdin, output: stdout });
  const answer = await rl.question(
    "\nFlip coach_ai_tier_enabled → false (hide Coach Pro on /pricing)? [y/N] ",
  );
  rl.close();
  if (answer.trim().toLowerCase() !== "y") {
    console.log("Aborted.");
    process.exit(0);
  }
}

const { error: upErr } = await sb
  .from("site_settings")
  .update({ coach_ai_tier_enabled: false })
  .eq("id", "default");

if (upErr) {
  console.error("Update failed:", upErr.message);
  process.exit(1);
}

// Verify the write actually took (per AGENTS.md: "verify the schema
// change actually landed by querying the affected column").
const { data: confirm } = await sb
  .from("site_settings")
  .select("coach_ai_tier_enabled")
  .eq("id", "default")
  .single();

if (confirm?.coach_ai_tier_enabled !== false) {
  console.error("Update appeared to succeed but readback shows", confirm);
  process.exit(1);
}

console.log("\n✓ coach_ai_tier_enabled = false. Coach Pro is now hidden on /pricing.");
