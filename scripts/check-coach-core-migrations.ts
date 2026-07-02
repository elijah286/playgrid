#!/usr/bin/env -S npx tsx
/**
 * scripts/check-coach-core-migrations.ts
 *
 * Guardrail from the 2026-07-01 platform audit: the league-operator platform
 * must never alter the security surface of the tables the coach product's
 * data model actually depends on. RLS policies/triggers on those tables are
 * the ONE thing a "read-only" league migration could get wrong in a way that
 * silently leaks or corrupts coach data — column additions are safe (nullable,
 * additive), but a policy is a live access-control decision.
 *
 * Fails if any migration NOT already in GRANDFATHERED creates, alters, or
 * drops a policy/trigger on a coach-core table without a `-- COACH-CORE-CHANGE:`
 * marker comment acknowledging it was deliberate.
 *
 * GRANDFATHERED is the exact, frozen list of migrations that existed before
 * this check shipped (2026-07-02) and legitimately touch these tables — 11
 * are ordinary pre-league coach-product history (2026-06-20 and earlier);
 * one, 20260621230000_teams_league_rls.sql, is the single league-era file
 * that does this, and was reviewed in the 2026-07-01 audit (additive-only,
 * guarded on `league_id IS NOT NULL`, never touches coach teams).
 *
 * Usage:
 *   npx tsx scripts/check-coach-core-migrations.ts
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");
const MIGRATIONS_DIR = join(ROOT, "supabase/migrations");

const COACH_CORE_TABLES = new Set(["teams", "playbooks", "plays", "profiles", "playbook_members"]);

const MARKER = "-- COACH-CORE-CHANGE:";

const GRANDFATHERED = new Set<string>([
  "0001_init.sql",
  "0003_admin_roles.sql",
  "0006_profiles_insert_own.sql",
  "0017_playbook_members_and_identity.sql",
  "0053_shared_playbook_profiles_and_formations.sql",
  "0063_examples_authoring.sql",
  "0064_examples_authoring_simplified.sql",
  "0065_public_example_read.sql",
  "0082_roster_claim_flow.sql",
  "0083_fix_unclaimed_rls_recursion.sql",
  "20260506180000_system_notices.sql",
  "20260621230000_teams_league_rls.sql",
]);

// Matches CREATE/ALTER/DROP POLICY|TRIGGER <name> ... ON [public.]<table>. The
// non-greedy, dotall body between the name and "on" bridges whatever clause
// Postgres puts there (FOR SELECT, timing/event for triggers, etc.) — in both
// statement forms "on" appears exactly once, right before the table name.
const STMT_RE =
  /\b(create|alter|drop)\s+(policy|trigger)\s+(?:if\s+exists\s+)?(\S+)[\s\S]*?\bon\s+(?:public\.)?(\w+)/gi;

function main(): void {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql"));
  const violations: { file: string; verb: string; kind: string; name: string; table: string }[] = [];

  for (const file of files) {
    if (GRANDFATHERED.has(file)) continue;
    const content = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    if (content.includes(MARKER)) continue;

    for (const m of content.matchAll(STMT_RE)) {
      const [, verb, kind, name, table] = m;
      if (COACH_CORE_TABLES.has(table.toLowerCase())) {
        violations.push({ file, verb: verb.toLowerCase(), kind: kind.toLowerCase(), name, table });
      }
    }
  }

  if (violations.length > 0) {
    console.error(
      `[check-coach-core-migrations] FAIL: ${violations.length} unacknowledged coach-core policy/trigger change(s):\n`,
    );
    for (const v of violations) {
      console.error(`  ${v.file}\n    ${v.verb} ${v.kind} ${v.name} on ${v.table}`);
    }
    console.error(
      `\nThese tables (${[...COACH_CORE_TABLES].join(", ")}) back the coach product. If this change ` +
        `is deliberate, add a line containing "${MARKER}" to the migration explaining why. If it's a ` +
        "pre-existing migration this check shouldn't have caught, add its filename to GRANDFATHERED in " +
        "scripts/check-coach-core-migrations.ts.",
    );
    process.exit(1);
  }

  console.log(
    `[check-coach-core-migrations] OK: scanned ${files.length} migrations, no unacknowledged coach-core changes.`,
  );
}

main();
