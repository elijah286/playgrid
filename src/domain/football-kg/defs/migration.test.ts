/**
 * Phase 1b acceptance test — every migrated def passes schema + cross-ref
 * validation.
 *
 * As each family migrates from src/domain/play/* → src/domain/football-kg/
 * defs/, this test re-runs the unified validator on the full FOOTBALL_KG.
 * Failures here mean a migrated entry's data shape drifted from its
 * schema, or a cross-reference dangles (e.g. a concept referencing a
 * formation that wasn't migrated yet).
 *
 * This is the byte-equality safety net before Phase 1c's auto-generator
 * round-trips the data back to the legacy catalog format. If this test
 * passes, the KG holds valid data; if 1c's snapshot test passes, the
 * legacy output reproduces.
 */

import { describe, expect, it } from "vitest";
import { FOOTBALL_KG } from "./index";
import { validateKG } from "../load";

describe("Phase 1b migrated KG — validation", () => {
  it("passes schema + cross-ref + geometry-invariant validation", () => {
    const result = validateKG(FOOTBALL_KG);
    if (!result.ok) {
      // Surface the errors for debugging in CI logs.
      throw new Error(
        `FOOTBALL_KG validation failed (${result.errors.length} errors):\n` +
          result.errors.map((e) => `  - [${e.family}/${e.id}] ${e.message}`).join("\n"),
      );
    }
    expect(result.ok).toBe(true);
  });
});

describe("Phase 1b migrated reactor patterns — coverage", () => {
  it("has 47 reactor patterns (30 migrated + 12 flag_6v6 added 2026-05-28 + 5 flag_7v7 Cover 2 added 2026-05-29; legacy had 31, T11 Cover 0 excluded)", () => {
    expect(FOOTBALL_KG.reactorPatterns.length).toBe(47);
  });

  it("every reactor pattern has a unique id", () => {
    const ids = FOOTBALL_KG.reactorPatterns.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every reactor pattern's schemeId resolves to a real scheme", () => {
    const schemeIds = new Set(FOOTBALL_KG.schemes.map((s) => s.id));
    for (const r of FOOTBALL_KG.reactorPatterns) {
      expect(
        schemeIds.has(r.schemeId),
        `reactor ${r.id}: schemeId "${r.schemeId}" not in schemes`,
      ).toBe(true);
    }
  });

  it("every reactor pattern's conceptId resolves to a real concept (or is '*' wildcard)", () => {
    const conceptIds = new Set(FOOTBALL_KG.concepts.map((c) => c.id));
    for (const r of FOOTBALL_KG.reactorPatterns) {
      if (r.conceptId === "*") continue;
      expect(
        conceptIds.has(r.conceptId),
        `reactor ${r.id}: conceptId "${r.conceptId}" not in concepts`,
      ).toBe(true);
    }
  });

  it("variant coverage matches the catalog (f7:19 — incl. 5 Cover 2 added 2026-05-29, t11:4, f5:12, f6:12 added 2026-05-28)", () => {
    const byVariant: Record<string, number> = {};
    for (const r of FOOTBALL_KG.reactorPatterns) {
      byVariant[r.variant] = (byVariant[r.variant] ?? 0) + 1;
    }
    expect(byVariant.flag_7v7).toBe(19);
    expect(byVariant.tackle_11).toBe(4);
    expect(byVariant.flag_5v5).toBe(12);
    expect(byVariant.flag_6v6).toBe(12);
  });

  it("Cover 0 wildcard pattern exists for flag_7v7", () => {
    const wildcard = FOOTBALL_KG.reactorPatterns.find(
      (r) => r.variant === "flag_7v7" && r.conceptId === "*",
    );
    expect(wildcard).toBeDefined();
    expect(wildcard!.schemeId).toBe("f7-cover-0");
  });
});

describe("Phase 1b migrated concepts — coverage", () => {
  it("has 21 concepts (20 from legacy catalog + slant-flat added 2026-05-24 for reactor cross-ref)", () => {
    expect(FOOTBALL_KG.concepts.length).toBe(21);
  });

  it("every concept has a unique id", () => {
    const ids = FOOTBALL_KG.concepts.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every concept has a defaultFormation pointing at a real formation", () => {
    const formationIds = new Set(FOOTBALL_KG.formations.map((f) => f.id));
    for (const c of FOOTBALL_KG.concepts) {
      expect(
        formationIds.has(c.defaultFormation.id),
        `concept ${c.id}: defaultFormation "${c.defaultFormation.id}" not in formations`,
      ).toBe(true);
    }
  });

  it("every altFormation reference resolves to a real formation", () => {
    const formationIds = new Set(FOOTBALL_KG.formations.map((f) => f.id));
    for (const c of FOOTBALL_KG.concepts) {
      for (const alt of c.altFormations ?? []) {
        expect(
          formationIds.has(alt.id),
          `concept ${c.id}: altFormations "${alt.id}" not in formations`,
        ).toBe(true);
      }
    }
  });

  it("pass concepts have non-empty pattern (matcher requirements)", () => {
    const passConcepts = ["curl-flat", "smash", "stick", "snag", "four-verticals", "mesh", "flood", "drive", "levels", "y-cross", "dagger"];
    for (const id of passConcepts) {
      const c = FOOTBALL_KG.concepts.find((x) => x.id === id);
      expect(c, `pass concept ${id} missing`).toBeDefined();
      expect(c!.pattern.length, `${id}: pass concept must have pattern entries`).toBeGreaterThan(0);
    }
  });

  it("run/RPO concepts have structural requirements", () => {
    const runConcepts = ["qb-draw", "bubble-rpo", "jet-reverse", "sweep", "dive", "power", "counter", "draw", "flea-flicker"];
    for (const id of runConcepts) {
      const c = FOOTBALL_KG.concepts.find((x) => x.id === id);
      expect(c, `run/RPO concept ${id} missing`).toBeDefined();
      expect(c!.structural, `${id}: run/RPO concept must have structural requirements`).toBeDefined();
    }
  });

  it("Flood has sameSideRequired set", () => {
    const flood = FOOTBALL_KG.concepts.find((c) => c.id === "flood");
    expect(flood?.sameSideRequired).toBe(true);
  });

  it("Power restricts to tackle_11 (gap-scheme run with pulling guards)", () => {
    const power = FOOTBALL_KG.concepts.find((c) => c.id === "power");
    expect(power?.variants).toEqual(["tackle_11"]);
  });

  it("capability gates are set on concepts that need them", () => {
    const expectations: Array<[string, string]> = [
      ["qb-draw", "qbRun"],
      ["bubble-rpo", "rpoRead"],
      ["bubble-rpo", "handoff"],
      ["jet-reverse", "trickPlay"],
      ["sweep", "handoff"],
      ["flea-flicker", "trickPlay"],
    ];
    for (const [id, cap] of expectations) {
      const c = FOOTBALL_KG.concepts.find((x) => x.id === id);
      expect(c, `concept ${id} missing`).toBeDefined();
      expect(c!.requiresCapabilities ?? [], `${id} should require capability "${cap}"`).toContain(cap);
    }
  });
});

describe("Phase 1b migrated formations — coverage", () => {
  // 17 canonical formations carried over from offensiveSynthesize.ts's
  // parseFormationName rules + the recent flag-specific additions
  // (Diamond, Tight Diamond, I-Formation flag).

  it("has at least 17 formations (full migrated catalog)", () => {
    expect(FOOTBALL_KG.formations.length).toBeGreaterThanOrEqual(17);
  });

  it("every formation has a unique id", () => {
    const ids = FOOTBALL_KG.formations.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every formation has at least one of: spec, customShape, positions", () => {
    for (const f of FOOTBALL_KG.formations) {
      const hasMode = !!f.spec || !!f.customShape || !!f.positions;
      expect(hasMode, `formation ${f.id} has no spec, customShape, or positions`).toBe(true);
    }
  });

  it("custom-shape formations (Diamond, Tight Diamond, Stack-I) all exist", () => {
    const shapes = FOOTBALL_KG.formations
      .filter((f) => f.customShape)
      .map((f) => f.customShape);
    expect(shapes).toContain("diamond");
    expect(shapes).toContain("tight_diamond");
    expect(shapes).toContain("stack_i");
  });

  it("legacy parametric formations are present (spread, doubles, trips, bunch, empty, pro-i)", () => {
    const ids = new Set(FOOTBALL_KG.formations.map((f) => f.id));
    for (const expected of ["spread", "doubles", "trips", "bunch", "empty", "pro-i"]) {
      expect(ids.has(expected), `formation "${expected}" missing from migration`).toBe(true);
    }
  });

  it("tackle-only formations (Pro I, Pro Set, Wishbone, T, Pistol) restrict to tackle_11", () => {
    const tackleOnly = ["pro-i", "pro-set", "wishbone", "t-formation", "pistol"];
    for (const id of tackleOnly) {
      const f = FOOTBALL_KG.formations.find((x) => x.id === id);
      expect(f, `${id} missing`).toBeDefined();
      expect(f!.variants).toEqual(["tackle_11"]);
    }
  });

  it("flag-context I-Formation is flag-only (does NOT appear in tackle_11)", () => {
    const flagI = FOOTBALL_KG.formations.find((f) => f.id === "i-formation-flag");
    expect(flagI).toBeDefined();
    expect(flagI!.variants).not.toContain("tackle_11");
  });
});

describe("Phase 1b migrated schemes — coverage", () => {
  it("has all 23 schemes from the legacy DEFENSIVE_ALIGNMENTS catalog", () => {
    expect(FOOTBALL_KG.schemes.length).toBe(23);
  });

  it("every scheme has a unique id", () => {
    const ids = FOOTBALL_KG.schemes.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every scheme has at least one defender", () => {
    for (const s of FOOTBALL_KG.schemes) {
      expect(s.defenders.length, `scheme ${s.id} has no defenders`).toBeGreaterThan(0);
    }
  });

  it("variant coverage matches the catalog (t11:7, f7:7, f6:4, f5:5)", () => {
    const byVariant: Record<string, number> = {};
    for (const s of FOOTBALL_KG.schemes) {
      for (const v of s.variants) byVariant[v] = (byVariant[v] ?? 0) + 1;
    }
    expect(byVariant.tackle_11).toBe(7);
    expect(byVariant.flag_7v7).toBe(7);
    expect(byVariant.flag_6v6).toBe(4);
    expect(byVariant.flag_5v5).toBe(5);
  });

  it("every zone-assignment references a zone defined on the same scheme", () => {
    for (const s of FOOTBALL_KG.schemes) {
      const zoneIds = new Set(s.zones.map((z) => z.id));
      for (const d of s.defenders) {
        if (d.assignment.kind === "zone") {
          expect(
            zoneIds.has(d.assignment.zoneId),
            `scheme ${s.id}: defender @${d.id} references zone "${d.assignment.zoneId}" but scheme defines [${[...zoneIds].join(", ")}]`,
          ).toBe(true);
        }
      }
    }
  });
});

describe("Phase 1b migrated routes — coverage", () => {
  // Per-route assertions that match the legacy routeTemplates.ts contract.
  // If a route's geometry drifts during a refactor, this catches it.

  it("has all 29 routes from the legacy catalog", () => {
    expect(FOOTBALL_KG.routes.length).toBe(29);
  });

  it("every route has a unique id", () => {
    const ids = FOOTBALL_KG.routes.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every route has a unique kbSubtopic OR is an explicit reuse (z-out → route_out, z-in → route_in, spot → route_snag, sit → route_stick, stop-and-go → route_hitch_and_go)", () => {
    // The legacy catalog has intentional kbSubtopic reuse for variant routes
    // (Z-Out shares route_out's KB chunk). Pin the known cases so a careless
    // future edit doesn't silently shadow a chunk.
    const knownReuses = new Set([
      "z-out",        // → route_out
      "z-in",         // → route_in
      "spot",         // → route_snag
      "sit",          // → route_stick
      "stop-and-go",  // → route_hitch_and_go
    ]);
    const subtopicCounts = new Map<string, string[]>();
    for (const r of FOOTBALL_KG.routes) {
      const list = subtopicCounts.get(r.kbSubtopic) ?? [];
      list.push(r.id);
      subtopicCounts.set(r.kbSubtopic, list);
    }
    for (const [subtopic, ids] of subtopicCounts) {
      if (ids.length === 1) continue;
      // Duplicate subtopic — verify each "extra" entry is a known reuse.
      const primaryIds = ids.filter((id) => !knownReuses.has(id));
      expect(
        primaryIds.length,
        `kbSubtopic "${subtopic}" has multiple primary route ids [${primaryIds.join(", ")}] — only known variant reuses (z-out, z-in, spot, sit, stop-and-go) are allowed to share a subtopic`,
      ).toBeLessThanOrEqual(1);
    }
  });

  it("every route has at least 2 waypoints (start + finish)", () => {
    for (const r of FOOTBALL_KG.routes) {
      expect(r.points.length, `route ${r.id} has only ${r.points.length} waypoints`).toBeGreaterThanOrEqual(2);
    }
  });

  it("routes with shapes have shapes.length === points.length - 1", () => {
    for (const r of FOOTBALL_KG.routes) {
      if (r.shapes) {
        expect(
          r.shapes.length,
          `route ${r.id}: shapes(${r.shapes.length}) must equal points(${r.points.length}) - 1`,
        ).toBe(r.points.length - 1);
      }
    }
  });

  it("every route's body field is substantive (no stub descriptions)", () => {
    // Phase 1b acceptance: every migrated route carries the legacy
    // description as its body so the Phase 1c KB generator has prose
    // to seed. A stub here means the migration was lazy.
    for (const r of FOOTBALL_KG.routes) {
      expect(r.body.length, `route ${r.id} has a stub body (${r.body.length} chars)`).toBeGreaterThan(60);
    }
  });
});
