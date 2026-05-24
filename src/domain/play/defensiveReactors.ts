/**
 * Defensive reactor catalog — Layer 1 (per AGENTS.md).
 *
 * When a defense is overlaid onto a known offensive concept, certain
 * defenders react to specific receivers in characteristic ways (HL jumps
 * the slant, M carries the seam, FS robs the dig). This catalog encodes
 * those (coverage × concept) reactions so compose_defense can populate
 * defender movement automatically — without this catalog, defenders sit
 * static in their zones and the coach has no teaching value beyond the
 * alignment.
 *
 * Per the user's design decision (2026-05-20), only KEY REACTORS get
 * explicit paths — defenders whose movement is the teaching point.
 * Other defenders stay in their catalog zone. This keeps the diagram
 * readable; over-drawing every defender's micro-movement clutters the
 * field and loses the point.
 *
 * Pattern lookup is keyed by (variant, coverage, concept). Concept names
 * align with CONCEPT_CATALOG entries — "Flood", "Mesh", "Slant-Flat",
 * "Smash", "Four Verticals", "Curl-Flat".
 *
 * Coordinate system matches CoachDiagram: x = yards from center (negative
 * left, positive right), y = yards downfield. Reactor paths are computed
 * at render time by `reactivePathFor` in specRenderer.ts — this catalog
 * stores INTENT (which defender reacts to whom with what behavior),
 * not geometry.
 *
 * Adding a new pattern:
 *   1. Pick the (variant, coverage, concept) triple.
 *   2. List ONLY the defenders whose reaction is the teaching point.
 *   3. For each, name the trigger (offensive player id) and behavior.
 *   4. Add a short cue Cal can include in the prose (one line per reactor).
 *
 * Adding a new behavior: extend the `ReactorBehavior` union AND the
 * matching branch in `reactivePathFor` (specRenderer.ts:509). The
 * TypeScript exhaustive switch catches mismatches at compile time.
 */

import type { SportVariant } from "./types";

export type ReactorBehavior =
  | "jump_route"
  | "carry_vertical"
  | "follow_to_flat"
  | "wall_off"
  | "robber";

export type ReactorAssignment = {
  /** Catalog defender id (e.g. "HL", "M", "CB"). Must match a defender
   *  in the matching alignment's players[]. */
  defender: string;
  /** Offensive player id that triggers the reaction (e.g. "X", "H", "Z"). */
  trigger: string;
  behavior: ReactorBehavior;
  /** One-line coaching cue surfaced in defense prose. Should describe
   *  the read and the action a coach would say to that defender. */
  cue: string;
};

export type ReactorPattern = {
  variant: SportVariant;
  /** Coverage name as it appears in the alignment catalog ("Tampa 2",
   *  "Cover 3", "Cover 1", "Cover 0"). Match is exact, case-insensitive. */
  coverage: string;
  /** Concept name as it appears in CONCEPT_CATALOG ("Flood", "Mesh", etc.). */
  concept: string;
  /** Plain-English summary Cal can echo back. */
  description: string;
  reactors: ReactorAssignment[];
};

// ── Reactor patterns ────────────────────────────────────────────────────
//
// Sourced from the Football Knowledge Graph (Phase 1d, 2026-05-24). The
// reactor pattern entries used to live inline here as TypeScript const
// declarations; they now live as KG defs in
// src/domain/football-kg/defs/reactor-patterns.ts and are projected to
// legacy shape via `projectReactorPatternsToLegacy()`. Byte-equality
// with the prior inline data is verified by
// src/domain/football-kg/defs/legacy-byte-equality.test.ts.
//
// Note: the KG dropped one wildcard pattern (T11 Cover 0) that had an
// empty reactor array AND no T11 Cover 0 alignment to reference. No
// movement information was lost in the migration.

import { projectReactorPatternsToLegacy } from "@/domain/football-kg/legacy-projections";

export const REACTOR_PATTERNS: ReactorPattern[] = projectReactorPatternsToLegacy() as unknown as ReactorPattern[];

// ── Legacy inline entries removed 2026-05-24 — see Football KG ──────────

/**
 * Find a reactor pattern for (variant, coverage, concept). Matches are
 * case-insensitive on coverage and concept. Returns null when no pattern
 * exists — the caller should fall back to static defender placement.
 *
 * Cover 0 entries use concept="*" as a wildcard since the reactor set
 * is uniform across concepts (all-out blitz, no deep help).
 */
export function findReactorPattern(
  variant: SportVariant,
  coverage: string,
  concept: string,
): ReactorPattern | null {
  const cov = coverage.trim().toLowerCase();
  const con = concept.trim().toLowerCase();
  if (!cov || !con) return null;
  // Exact concept match first.
  for (const p of REACTOR_PATTERNS) {
    if (p.variant !== variant) continue;
    if (p.coverage.toLowerCase() !== cov) continue;
    if (p.concept.toLowerCase() === con) return p;
  }
  // Wildcard fallback (Cover 0 mainly).
  for (const p of REACTOR_PATTERNS) {
    if (p.variant !== variant) continue;
    if (p.coverage.toLowerCase() !== cov) continue;
    if (p.concept === "*") return p;
  }
  return null;
}

/**
 * Best-effort concept detection from a freehand CoachDiagram fence's
 * `title` string. Returns the canonical concept name when it appears in
 * the title (case-insensitive substring match), or null when no known
 * concept name is present.
 *
 * Examples of titles we match:
 *   - "Flood Right" → "Flood"
 *   - "Mesh Concept" → "Mesh"
 *   - "Spread Slant-Flat" → "Slant-Flat"
 *   - "Four Verticals 3x1" → "Four Verticals"
 *
 * Returns null for "Stack Left Levels" (no listed concept), "Noah", etc.
 */
const KNOWN_CONCEPTS = [
  "Four Verticals",
  "Slant-Flat",
  "Curl-Flat",
  "Flood",
  "Sail",        // alias of Flood
  "Mesh",
  "Smash",
  "Snag",
  "Levels",
  "Y-Cross",
  "Dagger",
  "Drive",
  "Stick",
];
const CONCEPT_ALIAS: Readonly<Record<string, string>> = {
  Sail: "Flood",
};

export function detectConceptFromTitle(title: string | undefined): string | null {
  if (!title) return null;
  const t = title.toLowerCase();
  // Longest match first so "Four Verticals" beats "Verticals".
  const sorted = [...KNOWN_CONCEPTS].sort((a, b) => b.length - a.length);
  for (const c of sorted) {
    if (t.includes(c.toLowerCase())) {
      return CONCEPT_ALIAS[c] ?? c;
    }
  }
  return null;
}
