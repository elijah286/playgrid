#!/usr/bin/env -S npx tsx
/**
 * scripts/check-league-import-boundary.ts
 *
 * Guardrail from the 2026-07-01 platform audit: the league-operator platform
 * (src/lib/league*, src/features/league, src/app/league, src/app/register,
 * src/app/actions/league-*, src/app/api/league-ai) must stay decoupled from
 * the coach product — that isolation was verified once by hand; this makes it
 * a build-time check so a future refactor can't silently regress it.
 *
 * Fails if any file OUTSIDE the league surface imports a league module,
 * except the small documented allowlist below (each entry reviewed in the
 * audit as a deliberate, narrow, fail-open touchpoint — e.g. the site header
 * checking whether to show a "League Operations" nav link).
 *
 * Usage:
 *   npx tsx scripts/check-league-import-boundary.ts
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(__dirname, "..");
const SRC = join(ROOT, "src");

// Directories that ARE the league surface — free to import each other.
const LEAGUE_SURFACE_DIRS = [
  "src/app/league/",
  "src/app/register/",
  "src/features/league/",
  "src/lib/league/",
  "src/lib/league-ai/",
  "src/app/api/league-ai/",
];
// Individual files that are part of the surface but don't live under one of
// the directories above (action files are flat, not nested by feature).
const LEAGUE_SURFACE_FILE_PREFIXES = [
  "src/app/actions/league", // league.ts, league-*.ts, league-organizers.ts, ...
  "src/app/actions/public-registration.ts",
];

// Reviewed, deliberate exceptions — a coach-product file that imports one
// narrow, specific league symbol (always fail-open: an error here degrades to
// "no league UI shown", never to a crash or a data leak). Add here ONLY with
// the same scrutiny the 2026-07-01 audit gave the existing three: read the
// call site, confirm it's read-only / fail-open, and note why it can't live
// inside the league surface instead.
const ALLOWED_EXCEPTIONS = new Set<string>([
  // Shows/hides the "League Operations" banner on the coach home page.
  "src/app/(dashboard)/home/page.tsx",
  // Shows/hides the "League Operations" link in the Resources nav dropdown.
  "src/components/layout/SiteHeader.tsx",
  // Site-admin-only surface (gated on profiles.role === "admin"), not
  // reachable by a coach; manages league_organizers grants.
  "src/features/admin/LeagueOrganizersAdminClient.tsx",
]);

const IMPORT_RE = /(?:from|require\()\s*["']([^"']+)["']/g;
const LEAGUE_MODULE_RE =
  /^@\/(lib\/league(?:-ai)?|features\/league|app\/actions\/league|app\/api\/league-ai)(\/|$)/;

function isLeagueSurfaceFile(relPath: string): boolean {
  if (LEAGUE_SURFACE_DIRS.some((p) => relPath.startsWith(p))) return true;
  if (LEAGUE_SURFACE_FILE_PREFIXES.some((p) => relPath.startsWith(p))) return true;
  return false;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function main(): void {
  const files = walk(SRC);
  const violations: { file: string; specifier: string }[] = [];

  for (const abs of files) {
    const rel = relative(ROOT, abs).replace(/\\/g, "/");
    if (isLeagueSurfaceFile(rel)) continue;
    if (ALLOWED_EXCEPTIONS.has(rel)) continue;

    const content = readFileSync(abs, "utf8");
    for (const m of content.matchAll(IMPORT_RE)) {
      const specifier = m[1];
      if (LEAGUE_MODULE_RE.test(specifier)) {
        violations.push({ file: rel, specifier });
      }
    }
  }

  if (violations.length > 0) {
    console.error(
      `[check-league-isolation] FAIL: ${violations.length} coach-product file(s) import league modules:\n`,
    );
    for (const v of violations) console.error(`  ${v.file}\n    imports "${v.specifier}"`);
    console.error(
      "\nThe league-operator platform must stay decoupled from the coach product (see AGENTS.md's " +
        "isolation guarantees and docs/league-platform/PLAN.md). If this import is a deliberate, " +
        "narrow, fail-open touchpoint (like SiteHeader's organizer-link check), add it to " +
        "ALLOWED_EXCEPTIONS in scripts/check-league-import-boundary.ts with the same scrutiny the " +
        "2026-07-01 audit applied to the existing three entries.",
    );
    process.exit(1);
  }

  console.log(`[check-league-isolation] OK: scanned ${files.length} files, no boundary violations.`);
}

main();
