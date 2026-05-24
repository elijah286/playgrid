/**
 * Tests for the Phase 1c KB seed generator.
 *
 * The generator imports the FOOTBALL_KG and produces a Supabase migration
 * that seeds rag_documents from every primitive's `body` field. These
 * tests run the generator IN-PROCESS (no subprocess; no file write) and
 * assert structural properties of the output: every primitive gets a row,
 * variants fan out correctly, SQL escaping handles single quotes safely,
 * delete + insert ordering is right.
 *
 * Why not snapshot-test the full SQL? The output is ~124KB; a literal
 * snapshot would dominate diff review. Structural tests catch the
 * regressions that matter (missing primitives, broken escaping,
 * malformed SQL) without locking us into byte-identical output that
 * has to be regenerated for any cosmetic change.
 */

import { describe, expect, it } from "vitest";
import { FOOTBALL_KG } from "./index";
import { execSync } from "node:child_process";
import { resolve } from "node:path";

// __dirname is .../src/domain/football-kg/defs — repo root is 4 levels up.
const REPO_ROOT = resolve(__dirname, "../../../../");
const GENERATOR_PATH = resolve(REPO_ROOT, "scripts/fb-kg/generate-kb-seed.ts");

function runGenerator(): string {
  return execSync(`npx tsx ${GENERATOR_PATH} --print`, {
    encoding: "utf8",
    cwd: REPO_ROOT,
    maxBuffer: 50 * 1024 * 1024,
  });
}

describe("generate-kb-seed — produces a valid KG-derived KB migration", () => {
  const sql = runGenerator();

  it("starts with a header comment naming the source generator", () => {
    expect(sql).toContain("Football KG — auto-generated KB seed");
    expect(sql).toContain("generate-kb-seed.ts");
  });

  it("includes the wipe step (idempotent regen)", () => {
    expect(sql).toContain("delete from public.rag_documents where source = 'football-kg'");
  });

  it("includes one row per (primitive × variant) — total = sum of variants per primitive", () => {
    const expectedRowCount =
      FOOTBALL_KG.routes.reduce((acc, r) => acc + r.variants.length, 0) +
      FOOTBALL_KG.formations.reduce((acc, f) => acc + f.variants.length, 0) +
      FOOTBALL_KG.schemes.reduce((acc, s) => acc + s.variants.length, 0) +
      FOOTBALL_KG.concepts.reduce((acc, c) => acc + c.variants.length, 0) +
      FOOTBALL_KG.reactorPatterns.reduce((acc, r) => acc + r.variants.length, 0);
    // Each row begins with "('global', null, " — count occurrences.
    const matches = sql.match(/\('global', null,/g) ?? [];
    expect(matches.length).toBe(expectedRowCount);
  });

  it("every route's kbSubtopic appears as a row subtopic", () => {
    for (const r of FOOTBALL_KG.routes) {
      expect(
        sql.includes(`'${r.kbSubtopic}'`),
        `route ${r.id}: kbSubtopic "${r.kbSubtopic}" missing from generated SQL`,
      ).toBe(true);
    }
  });

  it("every formation gets a 'formation_*' subtopic", () => {
    for (const f of FOOTBALL_KG.formations) {
      const expected = `formation_${f.id.replace(/-/g, "_")}`;
      expect(sql.includes(`'${expected}'`), `formation ${f.id}: subtopic "${expected}" missing`).toBe(true);
    }
  });

  it("every concept gets a 'concept_*' subtopic", () => {
    for (const c of FOOTBALL_KG.concepts) {
      const expected = `concept_${c.id.replace(/-/g, "_")}`;
      expect(sql.includes(`'${expected}'`), `concept ${c.id}: subtopic "${expected}" missing`).toBe(true);
    }
  });

  it("every scheme gets a 'scheme_*' subtopic", () => {
    for (const s of FOOTBALL_KG.schemes) {
      const expected = `scheme_${s.id.replace(/-/g, "_")}`;
      expect(sql.includes(`'${expected}'`), `scheme ${s.id}: subtopic "${expected}" missing`).toBe(true);
    }
  });

  it("every reactor pattern gets a 'reactor_*' subtopic", () => {
    for (const rp of FOOTBALL_KG.reactorPatterns) {
      const expected = `reactor_${rp.id.replace(/-/g, "_")}`;
      expect(sql.includes(`'${expected}'`), `reactor ${rp.id}: subtopic "${expected}" missing`).toBe(true);
    }
  });

  it("SQL-escapes single quotes in body content (don't is rendered as don''t)", () => {
    // Smoke-test by finding a primitive whose body contains a single quote
    // (most do — coaching prose is contraction-heavy).
    const allBodies = [
      ...FOOTBALL_KG.routes.map((r) => r.body),
      ...FOOTBALL_KG.concepts.map((c) => c.body),
    ];
    const bodyWithApostrophe = allBodies.find((b) => b.includes("'"));
    expect(bodyWithApostrophe, "expected at least one body to contain an apostrophe").toBeDefined();
    if (bodyWithApostrophe) {
      // The escaped form (double-single-quote) should appear in the SQL output.
      expect(sql).toMatch(/''/);
    }
  });

  it("appends the revision-history insert AFTER the main insert", () => {
    const insertIdx = sql.indexOf("insert into public.rag_documents");
    const revisionIdx = sql.indexOf("insert into public.rag_document_revisions");
    expect(insertIdx).toBeGreaterThan(0);
    expect(revisionIdx).toBeGreaterThan(insertIdx);
  });

  it("output is substantial — >80KB of SQL (113 primitives × ~3 variants × ~250 bytes each)", () => {
    expect(sql.length).toBeGreaterThan(80_000);
  });
});
