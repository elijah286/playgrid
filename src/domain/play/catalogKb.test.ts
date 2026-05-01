/**
 * Goldens for buildCatalogKbChunks — the catalog → KB projection.
 *
 * The contract this enforces (AGENTS.md Rule 6 — Direction of truth):
 *   1. EVERY catalog entry produces exactly ONE chunk. No drops, no
 *      duplicates. (Catches "I added a route to routeTemplates.ts and
 *      forgot to update the seed migration".)
 *   2. Output is DETERMINISTIC. Same catalog state → same chunks.
 *      Re-running the build script produces a clean diff: only what
 *      actually changed in the catalog appears in the migration.
 *   3. Constraints (depth, side, break style) appear in the content
 *      verbatim. Cal can cite "12-yard slant" against the chunk and
 *      get rejected for the right reason.
 *   4. Subtopics don't collide ACROSS catalogs. A defense chunk and
 *      a route chunk can't both claim "scheme/route_slant".
 *   5. The source field marks every chunk as "catalog" — the build
 *      script uses this to know which rows it owns vs which are
 *      hand-authored (e.g. rules, conventions).
 */

import { describe, expect, it } from "vitest";
import { buildCatalogKbChunks } from "./catalogKb";
import { ROUTE_TEMPLATES } from "./routeTemplates";
import { DEFENSIVE_ALIGNMENTS } from "./defensiveAlignments";

describe("buildCatalogKbChunks — completeness", () => {
  it("emits exactly one chunk per UNIQUE route kbSubtopic (templates sharing a subtopic dedupe)", () => {
    // Multiple templates can intentionally share a kbSubtopic (Z-In is
    // a depth variant of In, both cite "route_in"). The projector
    // dedupes by subtopic, so chunk count = unique-subtopic count, not
    // template count. See AGENTS.md Rule 6 (KB direction of truth).
    const uniqueRouteSubtopics = new Set(ROUTE_TEMPLATES.map((t) => t.kbSubtopic));
    const chunks = buildCatalogKbChunks();
    const routeChunks = chunks.filter((c) => c.topic === "scheme");
    expect(routeChunks).toHaveLength(uniqueRouteSubtopics.size);
  });

  it("emits exactly one chunk per (front, coverage, variant) defensive alignment", () => {
    const chunks = buildCatalogKbChunks();
    const defenseChunks = chunks.filter((c) => c.topic === "scheme_defense");
    expect(defenseChunks).toHaveLength(DEFENSIVE_ALIGNMENTS.length);
  });

  it("every route template's kbSubtopic appears in the projected chunks", () => {
    const chunks = buildCatalogKbChunks();
    const routeSubtopics = new Set(
      chunks.filter((c) => c.topic === "scheme").map((c) => c.subtopic),
    );
    for (const t of ROUTE_TEMPLATES) {
      expect(
        routeSubtopics.has(t.kbSubtopic),
        `route template "${t.name}" → subtopic "${t.kbSubtopic}" not in projected chunks`,
      ).toBe(true);
    }
  });
});

describe("buildCatalogKbChunks — determinism", () => {
  it("produces identical output across two calls", () => {
    const a = buildCatalogKbChunks();
    const b = buildCatalogKbChunks();
    expect(b).toEqual(a);
  });

  it("emits chunks in stable sort order (topic, subtopic, variant) — plain string comparison", () => {
    // Plain string comparison (not localeCompare) so the test matches
    // the projector's sort exactly. localeCompare gives different
    // ordering near digit/underscore boundaries on different locales,
    // which would make migrations diff against themselves.
    const chunks = buildCatalogKbChunks();
    for (let i = 1; i < chunks.length; i++) {
      const prev = chunks[i - 1];
      const cur = chunks[i];
      const prevKey = `${prev.topic}\0${prev.subtopic}\0${prev.sportVariant ?? ""}`;
      const curKey = `${cur.topic}\0${cur.subtopic}\0${cur.sportVariant ?? ""}`;
      expect(curKey >= prevKey, `out-of-order at ${i}: ${prevKey} vs ${curKey}`).toBe(true);
    }
  });
});

describe("buildCatalogKbChunks — content shape", () => {
  it("route chunks include the canonical description verbatim", () => {
    const chunks = buildCatalogKbChunks();
    const slantTemplate = ROUTE_TEMPLATES.find((t) => t.name === "Slant");
    expect(slantTemplate).toBeDefined();
    const slantChunk = chunks.find((c) => c.subtopic === slantTemplate!.kbSubtopic);
    expect(slantChunk).toBeDefined();
    expect(slantChunk!.content).toContain(slantTemplate!.description);
  });

  it("route chunks include the depth range", () => {
    const chunks = buildCatalogKbChunks();
    const slantChunk = chunks.find((c) => c.subtopic === "route_slant");
    expect(slantChunk).toBeDefined();
    // Slant constraint is [3, 7] yards.
    expect(slantChunk!.content).toMatch(/Depth: 3-7 yards/);
  });

  it("route chunks include the side (inside/outside/vertical)", () => {
    const chunks = buildCatalogKbChunks();
    const slantChunk = chunks.find((c) => c.subtopic === "route_slant");
    expect(slantChunk!.content.toLowerCase()).toMatch(/breaks inside/);
    const outChunk = chunks.find((c) => c.subtopic === "route_out");
    expect(outChunk!.content.toLowerCase()).toMatch(/breaks outside/);
    const goChunk = chunks.find((c) => c.subtopic === "route_go");
    expect(goChunk!.content.toLowerCase()).toMatch(/vertical/);
  });

  it("route chunks list aliases when the template has them", () => {
    const chunks = buildCatalogKbChunks();
    const goChunk = chunks.find((c) => c.subtopic === "route_go");
    // Go has aliases Fly, Streak, Vertical, 9.
    expect(goChunk!.content).toMatch(/Also called:.*Fly/);
  });

  it("defense chunks include personnel + coverage mode", () => {
    const chunks = buildCatalogKbChunks();
    const cover3Chunks = chunks.filter(
      (c) => c.topic === "scheme_defense" && c.subtopic.includes("cover_3"),
    );
    expect(cover3Chunks.length).toBeGreaterThan(0);
    for (const c of cover3Chunks) {
      expect(c.content).toMatch(/Personnel: \d+ defenders/);
      expect(c.content).toMatch(/Coverage mode:/);
    }
  });

  it("defense chunks are variant-scoped (sportVariant set)", () => {
    const chunks = buildCatalogKbChunks();
    for (const c of chunks.filter((c) => c.topic === "scheme_defense")) {
      expect(c.sportVariant, `${c.subtopic} should have a variant`).not.toBeNull();
    }
  });

  it("route chunks are variant-agnostic (sportVariant null)", () => {
    const chunks = buildCatalogKbChunks();
    for (const c of chunks.filter((c) => c.topic === "scheme")) {
      expect(c.sportVariant, `${c.subtopic} should be variant-agnostic`).toBeNull();
    }
  });
});

describe("buildCatalogKbChunks — provenance", () => {
  it("every chunk is sourced from 'catalog'", () => {
    const chunks = buildCatalogKbChunks();
    for (const c of chunks) {
      expect(c.source, `${c.subtopic} should have source: 'catalog'`).toBe("catalog");
    }
  });

  it("every chunk has a sourceNote pointing at the source file", () => {
    const chunks = buildCatalogKbChunks();
    for (const c of chunks) {
      expect(c.sourceNote, `${c.subtopic} sourceNote missing`).toMatch(/src\/domain\/play/);
    }
  });

  it("every chunk is marked authoritative + needsReview=false (catalog == source of truth)", () => {
    const chunks = buildCatalogKbChunks();
    for (const c of chunks) {
      expect(c.authoritative).toBe(true);
      expect(c.needsReview).toBe(false);
    }
  });
});

describe("buildCatalogKbChunks — non-overlap (Rule 6 enforcement)", () => {
  it("no two chunks share the same (topic, subtopic, sportVariant) key", () => {
    const chunks = buildCatalogKbChunks();
    const seen = new Map<string, string>();
    for (const c of chunks) {
      const key = `${c.topic}\0${c.subtopic}\0${c.sportVariant ?? ""}`;
      const prior = seen.get(key);
      expect(
        prior,
        `duplicate chunk key "${key}": "${prior}" and "${c.title}" both claim it`,
      ).toBeUndefined();
      seen.set(key, c.title);
    }
  });

  it("subtopic prefixes are namespaced (route_*, defense_*) — no cross-catalog collision", () => {
    const chunks = buildCatalogKbChunks();
    for (const c of chunks) {
      if (c.topic === "scheme") {
        expect(c.subtopic, `route subtopic should start with "route_": ${c.subtopic}`).toMatch(/^route_/);
      }
      if (c.topic === "scheme_defense") {
        expect(c.subtopic, `defense subtopic should start with "defense_": ${c.subtopic}`).toMatch(/^defense_/);
      }
    }
  });
});
