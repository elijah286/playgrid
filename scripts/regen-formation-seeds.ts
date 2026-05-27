#!/usr/bin/env -S npx tsx
/**
 * scripts/regen-formation-seeds.ts
 *
 * Regenerates the `formations` seed rows from the Football Library
 * catalog ([src/domain/football-kg/defs/formations.ts](src/domain/football-kg/defs/formations.ts)).
 *
 * Seeds are formations that get snapshot-cloned into every new playbook
 * of a matching variant (see `createPlaybookForUser` in
 * src/lib/data/playbook-create.ts). Before this script, seeds were
 * hand-authored in the admin UI and drifted from the catalog. After,
 * the catalog is the source of truth — re-run this script after any
 * catalog change to regenerate the migration.
 *
 * Usage:
 *   npx tsx scripts/regen-formation-seeds.ts            # writes default path
 *   npx tsx scripts/regen-formation-seeds.ts --out=foo.sql
 *
 * Migration shape:
 *   1. DELETE FROM formations WHERE is_seed = true AND kind = 'offense'
 *      — clears every previously-generated offense seed. Defense and
 *      special-teams seeds (if any) are left alone since the library
 *      doesn't cover those yet.
 *   2. INSERT a row per catalog formation × supported variant, with
 *      both strength-Right and strength-Left for asymmetric shapes
 *      (Trips, Bunch, Stack, etc.); balanced shapes (Doubles, Spread,
 *      Diamond) get one row.
 *
 * The script uses the same synthesizer + render path the in-app editor
 * uses (`synthesizeOffense` → CoachDiagram → coachDiagramToPlayDocument),
 * so the seeded player positions, roles, labels, and colors match what
 * a coach sees when they open the formation in the Football Library.
 */

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { FORMATIONS } from "../src/domain/football-kg/defs/formations";
import { synthesizeOffense } from "../src/domain/play/offensiveSynthesize";
import {
  coachDiagramToPlayDocument,
  type CoachDiagram,
} from "../src/features/coach-ai/coachDiagramConverter";
import { sportProfileForVariant } from "../src/domain/play/factory";

type LibraryVariant = "flag_5v5" | "flag_6v6" | "flag_7v7" | "tackle_11";
const LIBRARY_VARIANTS: LibraryVariant[] = [
  "flag_5v5",
  "flag_6v6",
  "flag_7v7",
  "tackle_11",
];

/** Catalog formations that have asymmetric strong/weak sides — get
 *  seeded twice (Right + Left). Balanced shapes get a single seed. */
const ASYMMETRIC_IDS = new Set([
  "trips",
  "twins",
  "empty",
  "bunch",
  "stack",
  "pro-i",
  "pro-set",
  "wishbone",
  "t-formation",
  "pistol",
  "singleback",
  "trips-bunch",
]);

type Seed = {
  semanticKey: string;
  displayName: string;
  variant: LibraryVariant;
  kind: "offense";
  sortOrder: number;
  params: unknown;
};

function buildSeed(
  formationName: string,
  formationId: string,
  variant: LibraryVariant,
  strength: "right" | "left" | null,
  sortOrder: number,
): Seed | null {
  // Pass strength in the name so parseFormationName picks it up; balanced
  // formations call synth without a strength suffix (defaults to right,
  // doesn't matter geometrically).
  const synthName = strength
    ? `${formationName} ${strength === "right" ? "Right" : "Left"}`
    : formationName;
  const synth = synthesizeOffense(variant, synthName);
  if (!synth) return null;

  const diagram: CoachDiagram = {
    title: formationName,
    variant,
    focus: "O",
    players: synth.players.map((p) => ({
      id: p.id,
      x: p.x,
      y: p.y,
      team: "O",
    })),
    routes: [],
    zones: [],
  };
  let doc;
  try {
    doc = coachDiagramToPlayDocument(diagram);
  } catch (err) {
    console.warn(`[skip] ${formationName}/${variant}/${strength ?? "balanced"} — render error: ${(err as Error).message}`);
    return null;
  }

  const displayName = strength
    ? `${formationName} ${strength === "right" ? "Right" : "Left"}`
    : formationName;

  // Stable, deterministic semantic key so re-runs of this script produce
  // a clean diff against the previous output.
  const variantTag = variant.replace(/[^a-z0-9]+/gi, "_");
  const strengthTag = strength ?? "balanced";
  const semanticKey = `catalog_${formationId}_${variantTag}_${strengthTag}`;

  return {
    semanticKey,
    displayName,
    variant,
    kind: "offense",
    sortOrder,
    params: {
      displayName,
      players: doc.layers.players,
      sportProfile: sportProfileForVariant(variant),
      lineOfScrimmageY: 0.4,
    },
  };
}

function generateSeeds(): Seed[] {
  const seeds: Seed[] = [];
  let order = 0;
  for (const formation of FORMATIONS) {
    const variants = (formation.variants ?? []).filter(
      (v): v is LibraryVariant => LIBRARY_VARIANTS.includes(v as LibraryVariant),
    );
    const isAsymmetric = ASYMMETRIC_IDS.has(formation.id);
    for (const variant of variants) {
      if (isAsymmetric) {
        const r = buildSeed(formation.name, formation.id, variant, "right", order++);
        if (r) seeds.push(r);
        const l = buildSeed(formation.name, formation.id, variant, "left", order++);
        if (l) seeds.push(l);
      } else {
        const s = buildSeed(formation.name, formation.id, variant, null, order++);
        if (s) seeds.push(s);
      }
    }
  }
  return seeds;
}

function escapeSqlString(s: string): string {
  return s.replace(/'/g, "''");
}

function emitMigration(seeds: Seed[]): string {
  const header = `-- Auto-generated by scripts/regen-formation-seeds.ts — DO NOT EDIT BY HAND.
-- Source of truth: src/domain/football-kg/defs/formations.ts (FORMATIONS catalog).
-- Re-run \`npx tsx scripts/regen-formation-seeds.ts\` to regenerate after
-- catalog changes, then \`supabase db push\`.
--
-- Replaces all offense seeds with catalog-derived rows. Defense and
-- special-teams seeds are left untouched (the catalog doesn't cover
-- those yet). Existing playbook copies of the old seeds (is_seed=false
-- rows owned by playbook_id) are NOT touched — only the seeds
-- themselves get regenerated.

begin;

delete from public.formations
where is_seed = true and kind = 'offense';

insert into public.formations (playbook_id, is_seed, kind, semantic_key, sort_order, params)
values
`;

  const rows = seeds.map((s, i) => {
    const json = JSON.stringify(s.params);
    const escaped = escapeSqlString(json);
    const key = escapeSqlString(s.semanticKey);
    const suffix = i === seeds.length - 1 ? ";" : ",";
    return `  (null, true, 'offense', '${key}', ${s.sortOrder}, '${escaped}'::jsonb)${suffix}`;
  });

  return header + rows.join("\n") + "\n\ncommit;\n";
}

function main() {
  const outArg = process.argv.find((a) => a.startsWith("--out="));
  const out =
    outArg?.split("=")[1] ??
    resolve(
      __dirname,
      "../supabase/migrations/20260526170000_regen_formation_seeds.sql",
    );

  const seeds = generateSeeds();
  if (seeds.length === 0) {
    console.error("No seeds generated. Aborting.");
    process.exit(1);
  }
  const sql = emitMigration(seeds);
  writeFileSync(out, sql, "utf8");
  console.log(`Wrote ${seeds.length} seed rows → ${out}`);
  const byVariant: Record<string, number> = {};
  for (const s of seeds) byVariant[s.variant] = (byVariant[s.variant] || 0) + 1;
  console.log("by variant:", byVariant);
}

main();
