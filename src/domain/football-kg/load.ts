/**
 * Football Knowledge Graph — entry point.
 *
 * Aggregates all definitions, runs cross-reference validation, and
 * exposes typed lookups. Importers should get definitions through THIS
 * module so the validators run on import (in dev) or on test
 * (in CI / prod build).
 *
 * Phase 1a (this commit): schemas + loader + validation skeleton. The
 * `defs/` subdirectories are empty; population happens in Phase 1b.
 *
 * Sub-phase 1b will:
 *   - Populate defs/routes/, defs/formations/, defs/schemes/,
 *     defs/concepts/, defs/reactor-patterns/ from the existing catalog.
 *   - Each def file exports `default <DefName>`.
 *   - This module imports all of them via index files in each defs/ dir.
 */

import type { ConceptDef } from "./schemas/ConceptDef";
import { ConceptDefZ } from "./schemas/ConceptDef";
import type { DrillDef } from "./schemas/DrillDef";
import { DrillDefZ } from "./schemas/DrillDef";
import type { FormationDef } from "./schemas/FormationDef";
import { FormationDefZ } from "./schemas/FormationDef";
import type { ReactorPatternDef } from "./schemas/ReactorPatternDef";
import { ReactorPatternDefZ } from "./schemas/ReactorPatternDef";
import type { RouteDef } from "./schemas/RouteDef";
import { RouteDefZ } from "./schemas/RouteDef";
import type { SchemeDef } from "./schemas/SchemeDef";
import { SchemeDefZ } from "./schemas/SchemeDef";

/** Aggregate of all defs across families. Populated by the imports
 *  from each defs/ index file (added in Phase 1b). */
export type FootballKG = {
  concepts: ConceptDef[];
  formations: FormationDef[];
  routes: RouteDef[];
  schemes: SchemeDef[];
  reactorPatterns: ReactorPatternDef[];
  drills: DrillDef[];
};

/** An empty KG — used in tests + at module init before Phase 1b
 *  populates the defs/ subdirs. Replace with imports from defs/index.ts
 *  in Phase 1b. */
export const EMPTY_KG: FootballKG = {
  concepts: [],
  formations: [],
  routes: [],
  schemes: [],
  reactorPatterns: [],
  drills: [],
};

/* ------------------------------------------------------------------ */
/*  Validation                                                         */
/* ------------------------------------------------------------------ */

export type ValidationError = {
  family: string;
  id: string;
  message: string;
};

export type ValidationResult =
  | { ok: true }
  | { ok: false; errors: ValidationError[] };

/** Run zod schema validation on every def, then cross-reference checks. */
export function validateKG(kg: FootballKG): ValidationResult {
  const errors: ValidationError[] = [];

  // 1. Schema validation per family.
  const checkSchema = <T>(
    family: string,
    items: T[],
    schema: { safeParse: (val: unknown) => { success: boolean; error?: { issues: Array<{ path: PropertyKey[]; message: string }> } } },
    getId: (item: T) => string,
  ) => {
    for (const item of items) {
      const result = schema.safeParse(item);
      if (!result.success) {
        for (const issue of result.error?.issues ?? []) {
          errors.push({
            family,
            id: getId(item),
            message: `schema: ${issue.path.join(".")}: ${issue.message}`,
          });
        }
      }
    }
  };
  checkSchema("concept", kg.concepts, ConceptDefZ, (c) => c.id);
  checkSchema("formation", kg.formations, FormationDefZ, (f) => f.id);
  checkSchema("route", kg.routes, RouteDefZ, (r) => r.id);
  checkSchema("scheme", kg.schemes, SchemeDefZ, (s) => s.id);
  checkSchema("reactor-pattern", kg.reactorPatterns, ReactorPatternDefZ, (r) => r.id);
  checkSchema("drill", kg.drills, DrillDefZ, (d) => d.id);

  // 2. Duplicate-id detection within each family.
  const checkUnique = <T>(
    family: string,
    items: T[],
    getId: (item: T) => string,
  ) => {
    const seen = new Set<string>();
    for (const item of items) {
      const id = getId(item);
      if (seen.has(id)) {
        errors.push({
          family,
          id,
          message: `duplicate id "${id}" within ${family} family`,
        });
      }
      seen.add(id);
    }
  };
  checkUnique("concept", kg.concepts, (c) => c.id);
  checkUnique("formation", kg.formations, (f) => f.id);
  checkUnique("route", kg.routes, (r) => r.id);
  checkUnique("scheme", kg.schemes, (s) => s.id);
  checkUnique("reactor-pattern", kg.reactorPatterns, (r) => r.id);
  checkUnique("drill", kg.drills, (d) => d.id);

  // 3. Cross-reference checks.
  const formationIds = new Set(kg.formations.map((f) => f.id));
  const routeIds = new Set(kg.routes.map((r) => r.id));
  const conceptIds = new Set(kg.concepts.map((c) => c.id));
  const schemeIds = new Set(kg.schemes.map((s) => s.id));

  // 3a. Concept references resolve.
  for (const c of kg.concepts) {
    if (!formationIds.has(c.defaultFormation.id)) {
      errors.push({
        family: "concept",
        id: c.id,
        message: `defaultFormation.id "${c.defaultFormation.id}" doesn't exist in formations`,
      });
    }
    for (const alt of c.altFormations ?? []) {
      if (!formationIds.has(alt.id)) {
        errors.push({
          family: "concept",
          id: c.id,
          message: `altFormations[].id "${alt.id}" doesn't exist in formations`,
        });
      }
    }
    for (const assignment of c.assignments) {
      if (assignment.action.kind === "route") {
        if (!routeIds.has(assignment.action.routeId)) {
          errors.push({
            family: "concept",
            id: c.id,
            message: `assignments[player=${assignment.player}].action.routeId "${assignment.action.routeId}" doesn't exist in routes`,
          });
        }
      }
      // Recurse into nested "carry.then" and "motion.thenAction" actions.
      // Future work: full recursive walker. For now, depth-1 covers all
      // existing concepts.
      if (assignment.action.kind === "carry" && assignment.action.then?.kind === "route") {
        if (!routeIds.has(assignment.action.then.routeId)) {
          errors.push({
            family: "concept",
            id: c.id,
            message: `assignments[player=${assignment.player}].action.carry.then.routeId "${assignment.action.then.routeId}" doesn't exist in routes`,
          });
        }
      }
      if (assignment.action.kind === "motion" && assignment.action.thenAction?.kind === "route") {
        if (!routeIds.has(assignment.action.thenAction.routeId)) {
          errors.push({
            family: "concept",
            id: c.id,
            message: `assignments[player=${assignment.player}].action.motion.thenAction.routeId "${assignment.action.thenAction.routeId}" doesn't exist in routes`,
          });
        }
      }
    }
  }

  // 3b. Reactor patterns reference resolve.
  for (const r of kg.reactorPatterns) {
    if (!schemeIds.has(r.schemeId)) {
      errors.push({
        family: "reactor-pattern",
        id: r.id,
        message: `schemeId "${r.schemeId}" doesn't exist in schemes`,
      });
    }
    if (r.conceptId !== "*" && !conceptIds.has(r.conceptId)) {
      errors.push({
        family: "reactor-pattern",
        id: r.id,
        message: `conceptId "${r.conceptId}" doesn't exist in concepts (and isn't the wildcard "*")`,
      });
    }
    // Verify reactor defender ids exist in the referenced scheme.
    const scheme = kg.schemes.find((s) => s.id === r.schemeId);
    if (scheme) {
      const schemeDefenderIds = new Set(scheme.defenders.map((d) => d.id));
      for (const reactor of r.reactors) {
        // Strip a trailing digit (CB2 → CB) since the scheme catalog
        // stores bare ids; the renderer suffixes on output. A reactor
        // can reference "CB" (the bare role) OR "CB2" (the suffixed
        // form for the second defender of that role).
        const stripped = reactor.defender.replace(/[0-9]+$/, "");
        if (!schemeDefenderIds.has(reactor.defender) && !schemeDefenderIds.has(stripped)) {
          errors.push({
            family: "reactor-pattern",
            id: r.id,
            message: `reactors[].defender "${reactor.defender}" doesn't exist in scheme "${r.schemeId}" (have: ${[...schemeDefenderIds].join(", ")})`,
          });
        }
      }
    }
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

/* ------------------------------------------------------------------ */
/*  Lookup helpers                                                     */
/* ------------------------------------------------------------------ */

/** Find a concept by id or by name/alias (case-insensitive). */
export function findConcept(kg: FootballKG, query: string): ConceptDef | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  for (const c of kg.concepts) {
    if (c.id === q) return c;
    if (c.name.toLowerCase() === q) return c;
    for (const alias of c.aliases ?? []) {
      if (alias.toLowerCase() === q) return c;
    }
  }
  return null;
}

/** Find a formation by id or by name/alias. */
export function findFormation(kg: FootballKG, query: string): FormationDef | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  for (const f of kg.formations) {
    if (f.id === q) return f;
    if (f.name.toLowerCase() === q) return f;
    for (const alias of f.aliases ?? []) {
      if (alias.toLowerCase() === q) return f;
    }
  }
  return null;
}

/** Find a route by id or by name/alias. */
export function findRoute(kg: FootballKG, query: string): RouteDef | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  for (const r of kg.routes) {
    if (r.id === q) return r;
    if (r.name.toLowerCase() === q) return r;
    for (const alias of r.aliases ?? []) {
      if (alias.toLowerCase() === q) return r;
    }
  }
  return null;
}

/** Find a defensive scheme by id or by front+coverage combination. */
export function findScheme(kg: FootballKG, query: { id?: string; front?: string; coverage?: string }): SchemeDef | null {
  if (query.id) {
    const found = kg.schemes.find((s) => s.id === query.id);
    if (found) return found;
  }
  if (query.front && query.coverage) {
    const fNorm = query.front.toLowerCase();
    const cNorm = query.coverage.toLowerCase();
    const found = kg.schemes.find(
      (s) => s.front.toLowerCase() === fNorm && s.coverage.toLowerCase() === cNorm,
    );
    if (found) return found;
  }
  return null;
}

/** Find a reactor pattern matching (variant, scheme, concept). Returns the
 *  exact match if one exists; falls back to the "*" wildcard for the
 *  scheme + variant combo. */
export function findReactorPattern(
  kg: FootballKG,
  query: { variant: string; schemeId: string; conceptId: string },
): ReactorPatternDef | null {
  // Exact match first.
  for (const r of kg.reactorPatterns) {
    if (r.variant !== query.variant) continue;
    if (r.schemeId !== query.schemeId) continue;
    if (r.conceptId === query.conceptId) return r;
  }
  // Wildcard fallback.
  for (const r of kg.reactorPatterns) {
    if (r.variant !== query.variant) continue;
    if (r.schemeId !== query.schemeId) continue;
    if (r.conceptId === "*") return r;
  }
  return null;
}
