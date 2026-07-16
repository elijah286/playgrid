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
import {
  DEFENSIVE_ALIGNMENTS,
  alignmentPlayersWithUniqueIds,
} from "../src/domain/play/defensiveAlignments";
import {
  defenseStarterSemanticKey,
  slugifyDefensePart,
} from "../src/domain/play/defenseStarters";

type Side = "offense" | "defense";

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
  kind: "offense" | "defense";
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

// ── Defense ────────────────────────────────────────────────────────────────
//
// A defensive formation is BODIES ONLY — the same contract as offense. The
// coverage's zones and assignments belong to the play, not the formation, so
// they are deliberately dropped here; the new-play flow re-derives them from
// the catalog via `semantic_key` when a coach starts a play from a starter.
//
// The unit is one seed per catalog ALIGNMENT (front × coverage), not per
// front. Placement is a function of the coverage — a corner presses in Cover
// 0 and bails in Cover 3 — so "front" alone does not determine where bodies
// stand, and deduping to fronts would collapse flag to a meaningless
// "Zone"/"Man" pair.

/** Strip the catalog's explanatory glosses: "Nickel (4-2-5)" → "Nickel",
 *  "Cover 4 (Quarters)" → "Cover 4". The parenthetical is a definition, not
 *  part of the name a coach says out loud. */
function stripGloss(s: string): string {
  return s.replace(/\s*\([^)]*\)/g, "").trim();
}

/**
 * The name a coach would actually call this look.
 *
 * In flag the "front" is a restatement of the coverage family ("5v5 Zone /
 * Cover 2"), so prefixing it produces stutter — the coverage alone IS the
 * name. In tackle the front is real, independent information (4-3 Over vs
 * 3-4 vs 46 Bear), so it leads.
 */
function defenseDisplayName(front: string, coverage: string, variant: LibraryVariant): string {
  const cov = stripGloss(coverage);
  if (variant === "tackle_11") return `${stripGloss(front)} ${cov}`;
  return cov;
}

/** Re-exported from the domain module so the ids the script bakes into the
 *  migration and the keys the app resolves are produced by one function. */
const slug = slugifyDefensePart;

function buildDefenseSeed(
  alignment: (typeof DEFENSIVE_ALIGNMENTS)[number],
  strength: "left" | "right" | null,
  sortOrder: number,
): Seed | null {
  const variant = alignment.variant as LibraryVariant;
  const catalogPlayers = alignmentPlayersWithUniqueIds(alignment, strength ?? "right");

  // Catalog coords are YARDS relative to the ball; CoachDiagram speaks the
  // same units, and coachDiagramToPlayDocument does the normalization + the
  // sanitizer pass (Rule 10). Defense-only diagram: no offense to render.
  const diagram: CoachDiagram = {
    title: alignment.coverage,
    variant,
    focus: "D",
    players: catalogPlayers.map((p) => ({
      id: p.uniqueId,
      role: p.role,
      x: p.x,
      y: p.y,
      team: "D",
    })),
    routes: [],
    zones: [],
  };

  let doc;
  try {
    doc = coachDiagramToPlayDocument(diagram);
  } catch (err) {
    console.warn(
      `[skip] ${alignment.front}/${alignment.coverage}/${variant}/${strength ?? "balanced"} — render error: ${(err as Error).message}`,
    );
    return null;
  }

  if (doc.layers.players.length !== catalogPlayers.length) {
    throw new Error(
      `Defender count drift for ${alignment.front}/${alignment.coverage}/${variant}: ` +
        `catalog has ${catalogPlayers.length}, render produced ${doc.layers.players.length}.`,
    );
  }

  // The converter assigns random ids (`cd_7_4q8yk`) via uid(). Seeds are
  // committed to a migration and `updateFormationAndPropagateAction` matches
  // play players to formation players BY ID, so the ids must be stable across
  // regens. Remap to catalog-derived ids. The converter preserves input
  // order; the label assertion below fails loudly if that ever stops holding.
  const players = doc.layers.players.map((p, i) => {
    const cp = catalogPlayers[i];
    if (p.label !== cp.role && p.label !== cp.uniqueId) {
      throw new Error(
        `Player order drift for ${alignment.front}/${alignment.coverage}/${variant}: ` +
          `slot ${i} rendered label "${p.label}" but catalog expected "${cp.role}". ` +
          `coachDiagramToPlayDocument no longer preserves input order — remap by id instead.`,
      );
    }
    return { ...p, id: `def_${slug(cp.uniqueId)}` };
  });

  const baseName = defenseDisplayName(alignment.front, alignment.coverage, variant);
  const displayName = strength
    ? `${baseName} ${strength === "right" ? "Right" : "Left"}`
    : baseName;

  // Encodes front + coverage + variant so the new-play flow can resolve this
  // row back to its catalog alignment and install that coverage's zones.
  // Built by the domain module that the app resolves with — see
  // src/domain/play/defenseStarters.ts.
  const semanticKey = defenseStarterSemanticKey(alignment, strength ?? "balanced");

  return {
    semanticKey,
    displayName,
    variant,
    kind: "defense",
    sortOrder,
    params: {
      displayName,
      players,
      sportProfile: sportProfileForVariant(variant),
      lineOfScrimmageY: 0.4,
    },
  };
}

/** True when mirroring changes the SHAPE on the field, not merely which
 *  label sits on which side. 5v5 Cover 2 mirrors onto itself (the FS/SS
 *  swap sides but the picture is identical) — seeding it twice would give
 *  coaches two tiles they can't tell apart. 6v6 Cover 3 offsets its rusher,
 *  so Right and Left are genuinely different looks. */
function isVisuallyAsymmetric(alignment: (typeof DEFENSIVE_ALIGNMENTS)[number]): boolean {
  const posSig = (s: "left" | "right") =>
    alignmentPlayersWithUniqueIds(alignment, s)
      .map((p) => `${p.x},${p.y}`)
      .sort()
      .join("|");
  return posSig("right") !== posSig("left");
}

function generateDefenseSeeds(): Seed[] {
  const seeds: Seed[] = [];
  let order = 0;
  for (const alignment of DEFENSIVE_ALIGNMENTS) {
    if (!LIBRARY_VARIANTS.includes(alignment.variant as LibraryVariant)) continue;
    if (isVisuallyAsymmetric(alignment)) {
      const r = buildDefenseSeed(alignment, "right", order++);
      if (r) seeds.push(r);
      const l = buildDefenseSeed(alignment, "left", order++);
      if (l) seeds.push(l);
    } else {
      const s = buildDefenseSeed(alignment, null, order++);
      if (s) seeds.push(s);
    }
  }
  return seeds;
}

function escapeSqlString(s: string): string {
  return s.replace(/'/g, "''");
}

const HEADERS: Record<Side, string> = {
  offense: `-- Auto-generated by scripts/regen-formation-seeds.ts — DO NOT EDIT BY HAND.
-- Source of truth: src/domain/football-kg/defs/formations.ts (FORMATIONS catalog).
-- Re-run \`npx tsx scripts/regen-formation-seeds.ts --side=offense\` to
-- regenerate after catalog changes, then \`supabase db push\`.
--
-- Replaces all offense seeds with catalog-derived rows. Defense and
-- special-teams seeds are left untouched. Existing playbook copies of the
-- old seeds (is_seed=false rows owned by playbook_id) are NOT touched —
-- only the seeds themselves get regenerated.`,
  defense: `-- Auto-generated by scripts/regen-formation-seeds.ts — DO NOT EDIT BY HAND.
-- Source of truth: src/domain/football-kg/defs/schemes.ts, via the
-- DEFENSIVE_ALIGNMENTS projection in src/domain/play/defensiveAlignments.ts.
-- Re-run \`npx tsx scripts/regen-formation-seeds.ts --side=defense\` to
-- regenerate after catalog changes, then \`supabase db push\`.
--
-- One row per catalog alignment (front × coverage), bodies only — the
-- coverage's zones belong to the play, not the formation, and are re-derived
-- from semantic_key when a coach starts a play from a starter.
--
-- Touches ONLY kind='defense' seeds. Offense seeds are left alone: they
-- carry randomized player ids from a prior codegen run, so regenerating
-- them would churn every row for no behavioral gain.
--
-- These rows are STARTERS: they are surfaced read-only in the new-play
-- picker and cloned into a playbook lazily, on first use. Nothing is
-- backfilled into the 609 existing playbooks.`,
};

function emitMigration(seeds: Seed[], side: Side): string {
  const header = `${HEADERS[side]}

begin;

delete from public.formations
where is_seed = true and kind = '${side}';

insert into public.formations (playbook_id, is_seed, kind, semantic_key, sort_order, params)
values
`;

  const rows = seeds.map((s, i) => {
    const json = JSON.stringify(s.params);
    const escaped = escapeSqlString(json);
    const key = escapeSqlString(s.semanticKey);
    const suffix = i === seeds.length - 1 ? ";" : ",";
    return `  (null, true, '${side}', '${key}', ${s.sortOrder}, '${escaped}'::jsonb)${suffix}`;
  });

  return header + rows.join("\n") + "\n\ncommit;\n";
}

const DEFAULT_OUT: Record<Side, string> = {
  offense: "../supabase/migrations/20260526170000_regen_formation_seeds.sql",
  defense: "../supabase/migrations/20260716090000_regen_defense_formation_seeds.sql",
};

function main() {
  const sideArg = process.argv.find((a) => a.startsWith("--side="))?.split("=")[1];
  const side: Side = sideArg === "defense" ? "defense" : "offense";
  if (sideArg && sideArg !== "offense" && sideArg !== "defense") {
    console.error(`Unknown --side=${sideArg}. Expected "offense" or "defense".`);
    process.exit(1);
  }

  const outArg = process.argv.find((a) => a.startsWith("--out="));
  const out = outArg?.split("=")[1] ?? resolve(__dirname, DEFAULT_OUT[side]);

  const seeds = side === "defense" ? generateDefenseSeeds() : generateSeeds();
  if (seeds.length === 0) {
    console.error("No seeds generated. Aborting.");
    process.exit(1);
  }
  const sql = emitMigration(seeds, side);
  writeFileSync(out, sql, "utf8");
  console.log(`Wrote ${seeds.length} ${side} seed rows → ${out}`);
  const byVariant: Record<string, number> = {};
  for (const s of seeds) byVariant[s.variant] = (byVariant[s.variant] || 0) + 1;
  console.log("by variant:", byVariant);
}

main();
