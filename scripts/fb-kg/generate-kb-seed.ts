/**
 * Phase 1c generator: produce a Supabase migration that seeds
 * `rag_documents` rows from every Football KG primitive's `body` field.
 *
 * Usage:
 *   npx tsx scripts/fb-kg/generate-kb-seed.ts          # check (dry-run, print to stdout)
 *   npx tsx scripts/fb-kg/generate-kb-seed.ts --write  # write migration file to supabase/migrations/
 *
 * Output: one timestamped migration file with one INSERT per KG primitive:
 *   - routes        → topic="route",            subtopic = route.kbSubtopic
 *   - formations    → topic="formation",        subtopic = "formation_{id}"
 *   - schemes       → topic="defense",          subtopic = "scheme_{id}"
 *   - concepts      → topic="concept",          subtopic = "concept_{id}"
 *   - reactor patterns → topic="defense",       subtopic = "reactor_{id}"
 *
 * Each row carries the primitive's `body` as content + variant filter +
 * authoritative: true + source: "football-kg" so subsequent regenerations
 * can soft-replace these rows without disturbing coach-authored content.
 *
 * Why this exists: the KB has been growing in lockstep with the catalog
 * via hand-written migrations (0144_seed_routes_global, etc.). With the
 * KG as source of truth, those migrations become DERIVED — change the
 * KG entry's `body`, regenerate the migration, ship. The pre-Phase-1
 * fragmentation (catalog drift from KB) becomes structurally impossible.
 */

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { FOOTBALL_KG } from "../../src/domain/football-kg/defs/index";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../..");

/* ------------------------------------------------------------------ */
/*  SQL helpers                                                        */
/* ------------------------------------------------------------------ */

/** Escape a string for safe inclusion in a PostgreSQL single-quoted
 *  literal. Doubles every single quote. Other characters pass through. */
function sqlEscape(s: string): string {
  return s.replace(/'/g, "''");
}

/** Render a comma-separated list of variants as a SQL TEXT[] literal. */
function sqlVariantArray(variants: readonly string[]): string {
  if (variants.length === 0) return "ARRAY[]::TEXT[]";
  return `ARRAY[${variants.map((v) => `'${v}'`).join(",")}]::TEXT[]`;
}

type SeedRow = {
  scope: "global";
  scopeId: null;
  topic: string;
  subtopic: string;
  title: string;
  content: string;
  sportVariants: readonly string[];
};

function renderInsertRow(row: SeedRow): string {
  const variants = row.sportVariants.length > 0 ? row.sportVariants : ["other"];
  // For multi-variant primitives we emit ONE row per variant — the
  // rag_documents schema has a single sport_variant column, not an
  // array, so we duplicate the row across variants to preserve the
  // existing retrieval semantics.
  return variants
    .map((variant) =>
      `('${row.scope}', null, '${row.topic}', '${row.subtopic}',
 '${sqlEscape(row.title)}',
 '${sqlEscape(row.content)}',
 '${variant}', null, 'football-kg', null, true, false)`,
    )
    .join(",\n\n");
}

/* ------------------------------------------------------------------ */
/*  Map KG → SeedRows                                                  */
/* ------------------------------------------------------------------ */

function* allSeedRows(): Iterable<SeedRow> {
  for (const r of FOOTBALL_KG.routes) {
    yield {
      scope: "global",
      scopeId: null,
      topic: "route",
      subtopic: r.kbSubtopic,
      title: `Route: ${r.name}`,
      content: r.body,
      sportVariants: r.variants,
    };
  }
  for (const f of FOOTBALL_KG.formations) {
    yield {
      scope: "global",
      scopeId: null,
      topic: "formation",
      subtopic: `formation_${f.id.replace(/-/g, "_")}`,
      title: `Formation: ${f.name}`,
      content: f.body,
      sportVariants: f.variants,
    };
  }
  for (const s of FOOTBALL_KG.schemes) {
    yield {
      scope: "global",
      scopeId: null,
      topic: "defense",
      subtopic: `scheme_${s.id.replace(/-/g, "_")}`,
      title: `Defense: ${s.name}`,
      content: s.body,
      sportVariants: s.variants,
    };
  }
  for (const c of FOOTBALL_KG.concepts) {
    yield {
      scope: "global",
      scopeId: null,
      topic: "concept",
      subtopic: `concept_${c.id.replace(/-/g, "_")}`,
      title: `Concept: ${c.name}`,
      content: c.body,
      sportVariants: c.variants,
    };
  }
  for (const rp of FOOTBALL_KG.reactorPatterns) {
    yield {
      scope: "global",
      scopeId: null,
      topic: "defense",
      subtopic: `reactor_${rp.id.replace(/-/g, "_")}`,
      title: `Reactor: ${rp.name}`,
      content: rp.body,
      sportVariants: rp.variants,
    };
  }
}

/* ------------------------------------------------------------------ */
/*  Migration assembly                                                 */
/* ------------------------------------------------------------------ */

function generateMigration(): string {
  const rows = [...allSeedRows()];
  const inserts = rows.map(renderInsertRow).join(",\n\n");
  const counts = {
    routes: FOOTBALL_KG.routes.length,
    formations: FOOTBALL_KG.formations.length,
    schemes: FOOTBALL_KG.schemes.length,
    concepts: FOOTBALL_KG.concepts.length,
    reactorPatterns: FOOTBALL_KG.reactorPatterns.length,
  };
  const totalRows = rows.reduce((acc, r) => acc + (r.sportVariants.length || 1), 0);
  return `-- Football KG — auto-generated KB seed.
--
-- DO NOT EDIT BY HAND. Regenerate from KG defs with:
--   npx tsx scripts/fb-kg/generate-kb-seed.ts --write
--
-- Source: src/domain/football-kg/defs/* (Phase 1b migration, ${rows.length} primitives)
-- Counts: routes=${counts.routes}, formations=${counts.formations}, schemes=${counts.schemes}, concepts=${counts.concepts}, reactor_patterns=${counts.reactorPatterns}
-- Total rows after per-variant fan-out: ${totalRows}
--
-- Idempotent strategy: source='football-kg' rows are wiped first, then
-- re-inserted. Coach-authored content (source='seed' or NULL) is preserved
-- — only the KG-derived rows are managed by this migration.

-- 1. Wipe existing KG-derived rows so re-runs don't accumulate duplicates.
delete from public.rag_documents where source = 'football-kg';

-- 2. Insert the current KG snapshot.
insert into public.rag_documents (
  scope, scope_id, topic, subtopic, title, content,
  sport_variant, sanctioning_body, source, source_note,
  authoritative, needs_review
) values
${inserts};

-- 3. Revisions table — append the initial revision for each new row.
--    Phase 1c-iteration-2 will track revision_number per (subtopic, sport_variant)
--    across regenerations; for now every regen produces revision 1.
insert into public.rag_document_revisions (
  document_id, revision_number, title, content, source, source_note,
  authoritative, needs_review, change_kind, change_summary, changed_by
)
select d.id, 1, d.title, d.content, d.source, d.source_note,
       d.authoritative, d.needs_review,
       'create',
       'Auto-generated from football-kg ${new Date().toISOString().slice(0, 10)}',
       null
from public.rag_documents d
where d.source = 'football-kg' and d.retired_at is null
  and not exists (select 1 from public.rag_document_revisions r where r.document_id = d.id);
`;
}

function timestampedFilename(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  const h = String(now.getUTCHours()).padStart(2, "0");
  const min = String(now.getUTCMinutes()).padStart(2, "0");
  const s = String(now.getUTCSeconds()).padStart(2, "0");
  return `${y}${m}${d}${h}${min}${s}_football_kg_seed.sql`;
}

function main() {
  const out = generateMigration();
  const args = process.argv.slice(2);
  if (args.includes("--write")) {
    const filename = timestampedFilename();
    const target = resolve(REPO_ROOT, "supabase/migrations", filename);
    writeFileSync(target, out, "utf8");
    console.log(`Wrote ${target} (${out.length} bytes)`);
    return;
  }
  // Dry-run: print stats only (full content goes to stdout if --print is added).
  if (args.includes("--print")) {
    process.stdout.write(out);
    return;
  }
  console.log(`Would write ${out.length} bytes of SQL.`);
  console.log(`Run with --write to create a migration file, OR --print to view stdout.`);
}

main();
