/**
 * Phase 1d.1 — Byte-equality verifiers (KG vs legacy authoritative files).
 *
 * Goal: catch any drift between the migrated KG entries and the still-
 * authoritative legacy catalog files BEFORE Phase 1d cuts the tools to
 * read from the KG. If these tests pass, then routing tools at the KG
 * data instead of the legacy files is a no-op for behavior.
 *
 * If they FAIL, the migration has a bug — either the KG entry's data
 * differs from the legacy entry (data drift) OR the comparison is
 * incomplete (test bug). Fix the data, NEVER the test, unless the test
 * is genuinely wrong.
 *
 * Comparison strategy: each test extracts the LEGACY-SHAPE projection
 * from the KG entry (dropping KG-only fields like id, family, variants,
 * body, complexity, tags), then asserts the KG-projected entry matches
 * the legacy entry exactly. Order of array entries is preserved by ID
 * lookup (KG entries by id, legacy entries by their natural name).
 */

import { describe, expect, it } from "vitest";
import { ROUTES } from "./routes";
import { SCHEMES } from "./schemes";
import { CONCEPTS } from "./concepts";
import { REACTOR_PATTERNS } from "./reactor-patterns";
import { ROUTE_TEMPLATES } from "@/domain/play/routeTemplates";
import { DEFENSIVE_ALIGNMENTS } from "@/domain/play/defensiveAlignments";
import { CONCEPT_CATALOG } from "@/domain/play/conceptCatalog";
import { REACTOR_PATTERNS as LEGACY_REACTOR_PATTERNS } from "@/domain/play/defensiveReactors";

/* ------------------------------------------------------------------ */
/*  Routes                                                             */
/* ------------------------------------------------------------------ */

describe("KG routes match legacy ROUTE_TEMPLATES byte-for-byte (Phase 1d gate)", () => {
  // Same count first. If counts differ, the migration missed entries.
  it("same number of routes", () => {
    expect(ROUTES.length).toBe(ROUTE_TEMPLATES.length);
  });

  // For each KG route, find the legacy entry with matching name and
  // compare the legacy-shape projection. The legacy file's TS shape:
  //   { name, aliases?, directional?, points, shapes?, breakStyle,
  //     breakDir, constraints, kbSubtopic, description }
  // We project the KG entry to the same shape and assert deep equality.
  it.each(ROUTES.map((r) => [r.name, r]))(
    "KG route %s matches legacy ROUTE_TEMPLATES entry",
    (name: string, kgRoute) => {
      const legacy = ROUTE_TEMPLATES.find((t) => t.name === name);
      expect(legacy, `no legacy route named "${name}"`).toBeDefined();
      if (!legacy) return;

      const projected: typeof legacy = {
        name: kgRoute.name,
        ...(kgRoute.aliases ? { aliases: kgRoute.aliases } : {}),
        ...(kgRoute.directional !== undefined ? { directional: kgRoute.directional } : {}),
        points: kgRoute.points,
        ...(kgRoute.shapes ? { shapes: kgRoute.shapes } : {}),
        breakStyle: kgRoute.breakStyle,
        breakDir: kgRoute.breakDir,
        constraints: kgRoute.constraints,
        kbSubtopic: kgRoute.kbSubtopic,
        description: kgRoute.body,
      };
      // Legacy file may have `directional: false` explicitly OR omit the
      // field — both mean the same thing. Normalize by stripping
      // directional === false from both sides for comparison.
      const stripFalseDirectional = <T extends { directional?: boolean }>(o: T): T => {
        if (o.directional === false) {
          const copy = { ...o };
          delete copy.directional;
          return copy;
        }
        return o;
      };
      expect(stripFalseDirectional(projected)).toEqual(stripFalseDirectional(legacy));
    },
  );
});

/* ------------------------------------------------------------------ */
/*  Defensive Schemes                                                  */
/* ------------------------------------------------------------------ */

describe("KG schemes match legacy DEFENSIVE_ALIGNMENTS byte-for-byte (Phase 1d gate)", () => {
  it("same number of schemes", () => {
    expect(SCHEMES.length).toBe(DEFENSIVE_ALIGNMENTS.length);
  });

  // The legacy DefensiveAlignment shape:
  //   { front, coverage, variant, description, manCoverage?,
  //     players, zones }
  // Project KG SchemeDef → same shape (single variant from variants[0],
  // defenders → players).
  it.each(SCHEMES.map((s) => [`${s.front} ${s.coverage} (${s.variants[0]})`, s]))(
    "KG scheme %s matches legacy",
    (label: string, kgScheme) => {
      const legacy = DEFENSIVE_ALIGNMENTS.find(
        (a) =>
          a.variant === kgScheme.variants[0] &&
          a.front === kgScheme.front &&
          a.coverage === kgScheme.coverage,
      );
      expect(legacy, `no legacy alignment for ${label}`).toBeDefined();
      if (!legacy) return;

      // Build the projected legacy-shape object.
      const projected = {
        front: kgScheme.front,
        coverage: kgScheme.coverage,
        variant: kgScheme.variants[0],
        description: kgScheme.body,
        ...(kgScheme.manCoverage ? { manCoverage: kgScheme.manCoverage } : {}),
        players: kgScheme.defenders.map((d) => ({
          id: d.id,
          x: d.x,
          y: d.y,
          assignment: d.assignment,
        })),
        zones: kgScheme.zones,
      };

      // Legacy `description` is sometimes longer than KG `body` (we
      // split into description+body in some entries). Compare the
      // STRUCTURAL fields strictly + assert legacy description is
      // CONTAINED in KG body (since body is always the full prose).
      // Strictly compare the structural fields:
      expect(projected.front).toBe(legacy.front);
      expect(projected.coverage).toBe(legacy.coverage);
      expect(projected.variant).toBe(legacy.variant);
      expect(projected.players).toEqual(legacy.players);
      // Cover 0 schemes (F7 and F6) omit the zones field in the legacy
      // file but KG has zones: [] explicitly. Normalize undefined →
      // empty array on the legacy side for byte-equality.
      expect(projected.zones).toEqual(legacy.zones ?? []);
      expect(projected.manCoverage).toEqual(legacy.manCoverage);
      // Description equality is best-effort — both should describe the
      // same scheme but the legacy file's multi-line concatenation may
      // include extra whitespace. Normalize whitespace + compare.
      const norm = (s: string) => s.replace(/\s+/g, " ").trim();
      expect(norm(projected.description)).toBe(norm(legacy.description));
    },
  );
});

/* ------------------------------------------------------------------ */
/*  Concepts                                                           */
/* ------------------------------------------------------------------ */

describe("KG concepts match legacy CONCEPT_CATALOG byte-for-byte (Phase 1d gate)", () => {
  // KG has 21 concepts, legacy has 20 (KG added slant-flat which
  // was referenced by reactors but absent from CONCEPT_CATALOG).
  // For byte-equality we compare every legacy concept against its KG
  // counterpart, but not the other direction (slant-flat won't have
  // a legacy match — that's intentional).
  it("every legacy concept has a KG counterpart", () => {
    const kgNames = new Set(CONCEPTS.map((c) => c.name.toLowerCase()));
    for (const legacy of CONCEPT_CATALOG) {
      expect(
        kgNames.has(legacy.name.toLowerCase()),
        `legacy concept "${legacy.name}" missing from KG`,
      ).toBe(true);
    }
  });

  it("includes slant-flat (added during migration; previously absent from legacy CONCEPT_CATALOG)", () => {
    // Post Phase 1d cut: CONCEPT_CATALOG = projectConceptsToLegacy(CONCEPTS),
    // so they have equal length. Pre-cut this assertion checked "KG +1 vs
    // legacy"; the residual value is confirming slant-flat survived the
    // migration into the live catalog.
    const slantFlat = CONCEPTS.find((c) => c.id === "slant-flat");
    expect(slantFlat).toBeDefined();
    expect(slantFlat?.name).toBe("Slant-Flat");
  });

  // For each LEGACY concept, find the KG entry and project to legacy
  // shape: { name, aliases?, description, required, sameSideRequired?,
  //          complexity?, structural? }
  it.each(CONCEPT_CATALOG.map((c) => [c.name, c]))(
    "KG concept %s matches legacy",
    (name: string, legacy) => {
      const kg = CONCEPTS.find((c) => c.name === name);
      expect(kg, `KG concept "${name}" missing`).toBeDefined();
      if (!kg) return;

      // pattern → required (same shape, renamed field).
      expect(kg.pattern).toEqual(legacy.required);
      // Aliases (both optional).
      expect(kg.aliases ?? []).toEqual(legacy.aliases ?? []);
      // complexity.
      expect(kg.complexity).toEqual(legacy.complexity);
      // sameSideRequired (both optional booleans).
      expect(kg.sameSideRequired ?? false).toEqual(legacy.sameSideRequired ?? false);
      // structural.
      expect(kg.structural).toEqual(legacy.structural);
      // description equality (normalized whitespace).
      const norm = (s: string) => s.replace(/\s+/g, " ").trim();
      expect(norm(kg.body)).toBe(norm(legacy.description));
    },
  );
});

/* ------------------------------------------------------------------ */
/*  Reactor patterns                                                   */
/* ------------------------------------------------------------------ */

describe("KG reactor patterns match legacy REACTOR_PATTERNS byte-for-byte (Phase 1d gate)", () => {
  // KG dropped one wildcard pattern (T11 Cover 0) so the count
  // differs by 1. Verify the structural mapping for every legacy
  // pattern that DOES have a KG counterpart.
  it("does NOT include T11 Cover 0 wildcard (dropped during migration — empty reactor array)", () => {
    // Post Phase 1d cut: LEGACY_REACTOR_PATTERNS = projectReactorPatternsToLegacy(REACTOR_PATTERNS),
    // so they have equal length. Pre-cut this assertion checked "KG -1
    // vs legacy"; the residual value is confirming the T11 Cover 0
    // wildcard pattern stays out of the KG.
    const t11Cover0 = REACTOR_PATTERNS.find(
      (r) => r.variant === "tackle_11" && r.conceptId === "*",
    );
    expect(t11Cover0).toBeUndefined();
  });

  // Build a lookup: legacy (variant + coverage + concept) → pattern.
  // For each KG pattern, find the legacy entry that matches its
  // variant + scheme's coverage + concept name. Compare reactors arrays.
  it.each(REACTOR_PATTERNS.map((r) => [r.name, r]))(
    "KG reactor %s matches legacy",
    (name: string, kg) => {
      const scheme = SCHEMES.find((s) => s.id === kg.schemeId);
      expect(scheme, `KG scheme "${kg.schemeId}" missing for reactor "${name}"`).toBeDefined();
      if (!scheme) return;

      // For wildcard conceptId, the legacy entry's concept is also "*".
      // For named concepts, map kg.conceptId → name via the concepts catalog.
      let legacyConceptName: string;
      if (kg.conceptId === "*") {
        legacyConceptName = "*";
      } else {
        const concept = CONCEPTS.find((c) => c.id === kg.conceptId);
        expect(concept, `KG concept "${kg.conceptId}" missing for reactor "${name}"`).toBeDefined();
        if (!concept) return;
        legacyConceptName = concept.name;
      }

      const legacy = LEGACY_REACTOR_PATTERNS.find(
        (p) =>
          p.variant === kg.variant &&
          p.coverage === scheme.coverage &&
          p.concept === legacyConceptName,
      );
      expect(legacy, `no legacy reactor matches ${kg.variant} / ${scheme.coverage} / ${legacyConceptName}`).toBeDefined();
      if (!legacy) return;

      expect(kg.reactors).toEqual(legacy.reactors);
      const norm = (s: string) => s.replace(/\s+/g, " ").trim();
      expect(norm(kg.body)).toBe(norm(legacy.description));
    },
  );
});
