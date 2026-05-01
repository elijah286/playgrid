#!/usr/bin/env -S npx tsx
/**
 * scripts/build-catalog-kb.ts
 *
 * Regenerates the catalog-derived KB seed migration from the typed
 * catalogs (routeTemplates.ts, defensiveAlignments.ts) via
 * buildCatalogKbChunks().
 *
 * Usage:
 *   npx tsx scripts/build-catalog-kb.ts            # writes default path
 *   npx tsx scripts/build-catalog-kb.ts --out=foo.sql  # custom out
 *   npx tsx scripts/build-catalog-kb.ts --check    # exit 1 if file would change
 *
 * The --check mode is the CI hook: it verifies the migration on disk
 * matches what the catalog would generate. If a coach edits a route
 * template without re-running this script, CI fails — which prevents
 * the KB from drifting from the catalog (AGENTS.md Rule 6).
 *
 * Migration shape:
 *   1. DELETE FROM rag_documents WHERE source = 'catalog' — clears
 *      every previously-generated row but leaves hand-authored content
 *      (rules, conventions, KB seeds with source='seed') untouched.
 *   2. INSERT all chunks in deterministic order so re-runs diff cleanly.
 */

import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { buildCatalogKbChunks, type CatalogKbChunk } from "../src/domain/play/catalogKb";

const DEFAULT_OUT = resolve(
  __dirname,
  "..",
  "supabase",
  "migrations",
  "0200_catalog_kb_seed.sql",
);

function escapeSqlLiteral(s: string): string {
  // PostgreSQL single-quote escaping: '' for literal '. We don't need
  // dollar-quoting since the content is all short prose.
  return `'${s.replace(/'/g, "''")}'`;
}

function chunkToValuesRow(chunk: CatalogKbChunk): string {
  return [
    escapeSqlLiteral(chunk.scope),
    "null", // scope_id
    escapeSqlLiteral(chunk.topic),
    escapeSqlLiteral(chunk.subtopic),
    escapeSqlLiteral(chunk.title),
    escapeSqlLiteral(chunk.content),
    chunk.sportVariant === null ? "null" : escapeSqlLiteral(chunk.sportVariant),
    "null", // sanctioning_body
    escapeSqlLiteral(chunk.source),
    escapeSqlLiteral(chunk.sourceNote),
    chunk.authoritative ? "true" : "false",
    chunk.needsReview ? "true" : "false",
  ].join(", ");
}

function buildMigrationSql(chunks: CatalogKbChunk[]): string {
  const header = [
    "-- Catalog-derived KB seed.",
    "-- ",
    "-- THIS FILE IS GENERATED. Do not edit by hand.",
    "-- Source: src/domain/play/catalogKb.ts (buildCatalogKbChunks).",
    "-- Regenerate: `npx tsx scripts/build-catalog-kb.ts`.",
    "-- ",
    "-- Strategy (AGENTS.md Rule 6 — KB direction of truth):",
    "--   Catalogs are the single source of truth for catalog-derived",
    "--   topics (route_*, defense_*). This migration is idempotent:",
    "--   it DELETEs every row with source='catalog' and re-inserts the",
    "--   fresh set. Hand-authored KB content (source='seed', 'admin',",
    "--   etc.) is unaffected.",
    "",
  ].join("\n");

  const deleteStmt =
    "delete from public.rag_documents where source = 'catalog';";

  const valuesRows = chunks.map(
    (c) => `  (${chunkToValuesRow(c)})`,
  );
  const insertStmt = [
    "insert into public.rag_documents (",
    "  scope, scope_id, topic, subtopic, title, content,",
    "  sport_variant, sanctioning_body, source, source_note,",
    "  authoritative, needs_review",
    ") values",
    valuesRows.join(",\n"),
    ";",
  ].join("\n");

  return [header, deleteStmt, "", insertStmt, ""].join("\n");
}

type Options = {
  out: string;
  check: boolean;
};

function parseArgs(argv: string[]): Options {
  let out = DEFAULT_OUT;
  let check = false;
  for (const arg of argv.slice(2)) {
    if (arg === "--check") check = true;
    else if (arg.startsWith("--out=")) out = resolve(arg.slice("--out=".length));
    else if (arg === "--help" || arg === "-h") {
      console.log(
        "Usage: build-catalog-kb [--out=path] [--check]\n" +
          "  --out=PATH   Write migration to PATH (default: supabase/migrations/0200_catalog_kb_seed.sql)\n" +
          "  --check      Exit 1 if generated content differs from disk (CI gate)",
      );
      process.exit(0);
    }
  }
  return { out, check };
}

function main(): void {
  const opts = parseArgs(process.argv);
  const chunks = buildCatalogKbChunks();
  const sql = buildMigrationSql(chunks);

  if (opts.check) {
    if (!existsSync(opts.out)) {
      console.error(`[--check] FAIL: ${opts.out} does not exist. Run without --check to generate it.`);
      process.exit(1);
    }
    const onDisk = readFileSync(opts.out, "utf8");
    if (onDisk !== sql) {
      console.error(
        `[--check] FAIL: ${opts.out} is stale (catalog has changed since last regen).\n` +
          `Run: npx tsx scripts/build-catalog-kb.ts`,
      );
      process.exit(1);
    }
    console.log(`[--check] OK: ${opts.out} matches catalog state (${chunks.length} chunks).`);
    return;
  }

  writeFileSync(opts.out, sql, { encoding: "utf8" });
  console.log(`Wrote ${chunks.length} chunks → ${opts.out}`);
}

main();
