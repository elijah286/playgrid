/**
 * Catalog → KB chunks projection (Phase 5 of the SFPA architecture).
 *
 * Walks the typed catalogs (routes, defensive alignments, offensive
 * formations) and emits canonical KB chunks suitable for the
 * `rag_documents` table. The build script
 * (scripts/build-catalog-kb.ts) consumes this output and writes a
 * Supabase migration that UPSERTs the chunks.
 *
 * Direction-of-truth (AGENTS.md Rule 6): catalogs are upstream of the
 * KB for catalog-derived topics. The KB is regenerated from this
 * function, never hand-edited for these subtopics. Hand-authored
 * content for OTHER subtopics (rules, age tiers, conventions, team
 * notes) is unaffected.
 *
 * What this exists to fix:
 *   - Today, KB seed migrations (e.g. 0144_seed_routes_global.sql)
 *     manually mirror the descriptions in routeTemplates.ts. They
 *     drift the moment a coach edits a template without remembering
 *     to also update the seed. Cal then cites stale prose — coaches
 *     see "12-15 yards" in chat for a route the renderer draws at 13.
 *   - Phase 5 makes catalogs the single source. Templates change →
 *     run the build script → the migration regenerates → the KB
 *     matches code by construction.
 *
 * The projector is PURE: same catalog state → same chunks. This is
 * also the property the projector tests assert (deterministic output).
 */

import { ROUTE_TEMPLATES, type RouteTemplate } from "./routeTemplates";
import { DEFENSIVE_ALIGNMENTS, type DefensiveAlignment } from "./defensiveAlignments";

/**
 * KB chunk shape. Mirrors the `rag_documents` table columns the build
 * script writes via INSERT. Optional columns the script defaults are
 * omitted here.
 */
export type CatalogKbChunk = {
  /** "global" — catalog-derived chunks apply to every coach. */
  scope: "global";
  /** Topic taxonomy. "scheme" for routes; "scheme_defense" for defenses. */
  topic: "scheme" | "scheme_defense" | "scheme_offense";
  /** Stable id within the topic (e.g. "route_slant", "defense_4-3_over_cover_3"). */
  subtopic: string;
  /** Display title shown to coaches in cited results. */
  title: string;
  /** Body content. Includes structured fields (depth, side) so retrieval
   *  surfaces the right answer when a coach asks "how deep is a slant?". */
  content: string;
  /** Variant filter. null = applies to all variants. Catalog routes
   *  apply universally; defensive alignments are variant-specific. */
  sportVariant: "tackle_11" | "flag_7v7" | "flag_5v5" | null;
  /** Provenance label. Always "catalog" for projector output — the build
   *  script uses this to tell catalog-derived rows apart from
   *  hand-authored ones (so it can re-run without trampling other rows). */
  source: "catalog";
  /** Stable provenance note pointing at the source code. Future-you reading
   *  this in a SQL console should know exactly where the chunk came from. */
  sourceNote: string;
  /** True for catalog-derived: the catalog is the source of truth. */
  authoritative: true;
  /** False for catalog-derived: machine-generated, not pending human review. */
  needsReview: false;
};

/**
 * Project the entire catalog set into KB chunks. Output is sorted by
 * (topic, subtopic, sportVariant) using PLAIN STRING COMPARISON so the
 * sort key is byte-stable across runs and platforms — `localeCompare`
 * varies subtly by locale and gives different ordering than `<` on
 * underscore-vs-digit boundaries (e.g. "4_4" vs "46"), which would make
 * generated migrations diff against themselves on different machines.
 *
 * Multiple templates may share a `kbSubtopic` deliberately (Z-In and In
 * both cite "route_in" because Z-In is a depth variant of the same
 * scheme, not a separate route). The projector DEDUPES by
 * (topic, subtopic, sportVariant): the first template wins, downstream
 * templates contribute nothing to the KB. This reflects the catalog's
 * intent — kbSubtopic IS the KB identity, regardless of how many
 * templates reference it.
 */
export function buildCatalogKbChunks(): CatalogKbChunk[] {
  const all: CatalogKbChunk[] = [
    ...ROUTE_TEMPLATES.map(routeTemplateToChunk),
    ...DEFENSIVE_ALIGNMENTS.map(defensiveAlignmentToChunk),
  ];

  // Dedupe by (topic, subtopic, sportVariant). First occurrence wins —
  // routes are catalog-ordered with the canonical entry before its
  // variants (In before Z-In, Out before Z-Out), so first-wins picks
  // the right chunk.
  const dedupedByKey = new Map<string, CatalogKbChunk>();
  for (const chunk of all) {
    const key = chunkKey(chunk);
    if (!dedupedByKey.has(key)) dedupedByKey.set(key, chunk);
  }

  return Array.from(dedupedByKey.values()).sort((a, b) => {
    const ka = chunkKey(a);
    const kb = chunkKey(b);
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
}

/** Stable sort/identity key. Null sportVariant sorts as empty string,
 *  putting variant-agnostic chunks (routes) before variant-specific
 *  chunks (defenses). */
function chunkKey(c: CatalogKbChunk): string {
  return `${c.topic}\0${c.subtopic}\0${c.sportVariant ?? ""}`;
}

function routeTemplateToChunk(template: RouteTemplate): CatalogKbChunk {
  const { depthRangeYds, side } = template.constraints;
  const depthLine =
    depthRangeYds.min === depthRangeYds.max
      ? `Depth: ${depthRangeYds.min} yards.`
      : `Depth: ${depthRangeYds.min}-${depthRangeYds.max} yards from the LOS.`;
  const sideLine = `Direction: ${humanizeSide(side)}.`;
  const breakLine = `Break shape: ${template.breakStyle}.`;
  const aliasLine =
    template.aliases && template.aliases.length > 0
      ? `Also called: ${template.aliases.join(", ")}.`
      : "";

  // Compose content. Structured lines first so retrieval matches "how
  // deep is a slant?" type queries; canonical description after for the
  // coaching narrative.
  const content = [
    template.description,
    "",
    depthLine,
    sideLine,
    breakLine,
    aliasLine,
  ]
    .filter((line) => line !== "")
    .join("\n");

  return {
    scope: "global",
    topic: "scheme",
    subtopic: template.kbSubtopic,
    title: `Route: ${template.name}`,
    content,
    sportVariant: null,
    source: "catalog",
    sourceNote: `Generated from src/domain/play/routeTemplates.ts (${template.name}).`,
    authoritative: true,
    needsReview: false,
  };
}

function defensiveAlignmentToChunk(alignment: DefensiveAlignment): CatalogKbChunk {
  const playerCount = alignment.players.length;
  const zoneCount = alignment.zones?.length ?? 0;
  const coverageMode = alignment.manCoverage ? "man" : zoneCount > 0 ? "zone" : "mixed/unspecified";

  const content = [
    alignment.description,
    "",
    `Personnel: ${playerCount} defenders.`,
    `Coverage mode: ${coverageMode}.`,
    zoneCount > 0
      ? `Zones: ${alignment.zones!.map((z) => z.label).join(", ")}.`
      : alignment.manCoverage
      ? "Assignment-based — defenders track receivers."
      : "",
  ]
    .filter((l) => l !== "")
    .join("\n");

  return {
    scope: "global",
    topic: "scheme_defense",
    subtopic: defenseSubtopic(alignment),
    title: `Defense: ${alignment.front} — ${alignment.coverage}`,
    content,
    sportVariant: alignment.variant,
    source: "catalog",
    sourceNote: `Generated from src/domain/play/defensiveAlignments.ts (${alignment.front} / ${alignment.coverage} / ${alignment.variant}).`,
    authoritative: true,
    needsReview: false,
  };
}

function defenseSubtopic(alignment: DefensiveAlignment): string {
  const slug = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  return `defense_${slug(alignment.front)}_${slug(alignment.coverage)}_${alignment.variant}`;
}

function humanizeSide(side: RouteTemplate["constraints"]["side"]): string {
  switch (side) {
    case "toward_qb":
      return "breaks inside, toward the QB / middle of the field";
    case "toward_sideline":
      return "breaks outside, toward the sideline";
    case "vertical":
      return "stays vertical (no significant lateral commit)";
    case "varies":
      return "varies by formation (no fixed direction)";
  }
}
