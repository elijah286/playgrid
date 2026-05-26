/**
 * Phase 1d.2 — Legacy-shape projections from the Football KG.
 *
 * The legacy catalog files (routeTemplates.ts, conceptCatalog.ts,
 * defensiveAlignments.ts, defensiveReactors.ts) each export arrays
 * + types + helper functions. As tools cut over to the KG, those
 * legacy files become thin re-exports — types and helpers stay, but
 * the DATA arrays get replaced with derivations from the KG.
 *
 * This module provides the derivation functions: KG entries (rich,
 * with id/family/variants/body/complexity/tags) project down to the
 * legacy-shape (whatever the legacy file declared).
 *
 * Byte-equality with the still-authoritative legacy data is enforced
 * by `defs/legacy-byte-equality.test.ts`. If the projections drift
 * from the legacy shape, those tests catch it before the tool cut.
 */

import { CONCEPTS } from "./defs/concepts";
import { REACTOR_PATTERNS } from "./defs/reactor-patterns";
import { ROUTES } from "./defs/routes";
import { SCHEMES } from "./defs/schemes";

/* ------------------------------------------------------------------ */
/*  Route templates                                                    */
/* ------------------------------------------------------------------ */

/** Mirror of `RouteTemplate` from src/domain/play/routeTemplates.ts.
 *  Re-declared here (as a type) to avoid a cross-module cycle between
 *  the legacy file and the KG. The legacy file imports this for its
 *  internal data, never the other way around. */
export type LegacyRouteTemplate = {
  name: string;
  aliases?: string[];
  directional?: boolean;
  points: Array<{ x: number; y: number }>;
  shapes?: Array<"straight" | "curve">;
  breakStyle: "none" | "sharp" | "rounded" | "multi";
  breakDir: "toward_qb" | "toward_sideline" | "vertical" | "varies";
  constraints: {
    depthRangeYds: { min: number; max: number };
    side: "toward_qb" | "toward_sideline" | "vertical" | "varies";
  };
  kbSubtopic: string;
  description: string;
};

/** Project the KG's ROUTES array into legacy `RouteTemplate[]` shape.
 *  Drops KG-only fields (id, family, variants, body, complexity, tags)
 *  and renames body → description to match the legacy convention.
 *
 *  Idempotent + pure: same KG input → same output. The legacy file's
 *  `ROUTE_TEMPLATES` const becomes a call to this function. */
export function projectRoutesToLegacy(): LegacyRouteTemplate[] {
  return ROUTES.map((r) => {
    const out: LegacyRouteTemplate = {
      name: r.name,
      points: r.points,
      breakStyle: r.breakStyle,
      breakDir: r.breakDir,
      constraints: r.constraints,
      kbSubtopic: r.kbSubtopic,
      description: r.body,
    };
    if (r.aliases) out.aliases = r.aliases;
    if (r.directional !== undefined) out.directional = r.directional;
    if (r.shapes) out.shapes = r.shapes;
    return out;
  });
}

/* ------------------------------------------------------------------ */
/*  Concepts                                                           */
/* ------------------------------------------------------------------ */

/** Mirror of `ConceptEntry` from src/domain/play/conceptCatalog.ts.
 *  See top-of-module note re: avoiding cycles. */
export type LegacyConceptEntry = {
  name: string;
  aliases?: string[];
  description: string;
  required: Array<{
    role: "outside_wr" | "slot" | "te" | "back" | "any";
    family: string;
    depthRangeYds: { min: number; max: number };
  }>;
  sameSideRequired?: boolean;
  complexity?: "basic" | "intermediate" | "advanced";
  structural?: {
    requiresCarry?: {
      player?: "qb" | "back" | "any";
      runTypes?: string[];
    };
    requiresRpoRead?: boolean;
    requiresBallPathSteps?: number;
    requiresBallPathReturnsToOrigin?: boolean;
  };
};

/** Project the KG's CONCEPTS array into legacy `ConceptEntry[]` shape.
 *  Drops KG-only fields. Renames body → description, pattern → required.
 *
 *  IMPORTANT: the KG has one extra concept (slant-flat) that wasn't in
 *  the legacy CONCEPT_CATALOG. This projection INCLUDES slant-flat —
 *  the legacy catalog's effective set grows by 1. That's intentional;
 *  slant-flat was already referenced by reactor patterns. Tests in
 *  `legacy-byte-equality.test.ts` confirm every LEGACY concept has a
 *  matching KG entry, and that slant-flat is the only addition. */
export function projectConceptsToLegacy(): LegacyConceptEntry[] {
  return CONCEPTS.map((c) => {
    const out: LegacyConceptEntry = {
      name: c.name,
      description: c.body,
      required: c.pattern,
    };
    if (c.aliases) out.aliases = c.aliases;
    if (c.sameSideRequired !== undefined) out.sameSideRequired = c.sameSideRequired;
    if (c.complexity) out.complexity = c.complexity;
    if (c.structural) out.structural = c.structural;
    return out;
  });
}

/* ------------------------------------------------------------------ */
/*  Defensive alignments (schemes)                                     */
/* ------------------------------------------------------------------ */

/** Mirror of `DefensiveAlignment` from src/domain/play/defensiveAlignments.ts. */
export type LegacyDefensiveAlignment = {
  front: string;
  coverage: string;
  variant: "tackle_11" | "flag_7v7" | "touch_7v7" | "flag_6v6" | "flag_5v5" | "flag_4v4";
  description: string;
  manCoverage?: boolean;
  players: Array<{
    id: string;
    x: number;
    y: number;
    assignment:
      | { kind: "zone"; zoneId: string }
      | { kind: "man"; target?: string }
      | { kind: "blitz"; gap?: string }
      | { kind: "spy"; target?: string };
  }>;
  zones: Array<{
    id: string;
    kind: "rectangle" | "ellipse";
    center: [number, number];
    size: [number, number];
    label: string;
  }>;
  /** Coaching context. Optional — populated when the KG scheme
   *  declares it. The library defense page surfaces these as the
   *  "When to call it" + "Known weaknesses" sections. */
  whenToUse?: string;
  weaknesses?: string[];
};

/** Project the KG's SCHEMES array into legacy `DefensiveAlignment[]` shape. */
export function projectSchemesToLegacy(): LegacyDefensiveAlignment[] {
  return SCHEMES.map((s) => {
    const variant = s.variants[0];
    if (variant === "other") {
      throw new Error(`Scheme ${s.id} has variant "other" which is not a legacy DefensiveAlignment variant`);
    }
    const out: LegacyDefensiveAlignment = {
      front: s.front,
      coverage: s.coverage,
      variant,
      description: s.body,
      players: s.defenders.map((d) => ({
        id: d.id,
        x: d.x,
        y: d.y,
        assignment: d.assignment,
      })),
      zones: s.zones,
    };
    if (s.manCoverage !== undefined) out.manCoverage = s.manCoverage;
    if (s.whenToUse !== undefined) out.whenToUse = s.whenToUse;
    if (s.weaknesses !== undefined) out.weaknesses = s.weaknesses;
    return out;
  });
}

/* ------------------------------------------------------------------ */
/*  Reactor patterns                                                   */
/* ------------------------------------------------------------------ */

/** Mirror of `ReactorPattern` from src/domain/play/defensiveReactors.ts.
 *  The legacy uses (variant, coverage string, concept string) for
 *  lookup; the KG uses (variant, schemeId, conceptId) for cross-refs.
 *  This projection resolves the KG ids back to legacy strings. */
export type LegacyReactorPattern = {
  variant: "tackle_11" | "flag_7v7" | "touch_7v7" | "flag_6v6" | "flag_5v5" | "flag_4v4";
  coverage: string;
  concept: string;
  description: string;
  reactors: Array<{
    defender: string;
    trigger: string;
    behavior: "jump_route" | "carry_vertical" | "follow_to_flat" | "wall_off" | "robber";
    cue: string;
  }>;
};

/** Project the KG's REACTOR_PATTERNS array into legacy shape.
 *  Resolves schemeId → coverage and conceptId → concept name via the
 *  schemes + concepts arrays. Throws if a referenced id is missing —
 *  the load.ts validator catches this earlier; this is belt-and-
 *  suspenders. */
export function projectReactorPatternsToLegacy(): LegacyReactorPattern[] {
  const schemeById = new Map(SCHEMES.map((s) => [s.id, s]));
  const conceptById = new Map(CONCEPTS.map((c) => [c.id, c]));
  return REACTOR_PATTERNS.map((r) => {
    const scheme = schemeById.get(r.schemeId);
    if (!scheme) {
      throw new Error(`Reactor pattern ${r.id} references unknown scheme "${r.schemeId}"`);
    }
    let conceptName: string;
    if (r.conceptId === "*") {
      conceptName = "*";
    } else {
      const concept = conceptById.get(r.conceptId);
      if (!concept) {
        throw new Error(`Reactor pattern ${r.id} references unknown concept "${r.conceptId}"`);
      }
      conceptName = concept.name;
    }
    const variant = r.variant;
    if (variant === "other") {
      throw new Error(`Reactor pattern ${r.id} has variant "other" which is not a legacy ReactorPattern variant`);
    }
    return {
      variant,
      coverage: scheme.coverage,
      concept: conceptName,
      description: r.body,
      reactors: r.reactors,
    };
  });
}
