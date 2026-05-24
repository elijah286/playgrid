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

describe("Phase 1b migrated schemes — coverage", () => {
  it("has all 19 schemes from the legacy DEFENSIVE_ALIGNMENTS catalog", () => {
    expect(FOOTBALL_KG.schemes.length).toBe(19);
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

  it("variant coverage matches the legacy catalog (t11:7, f7:6, f6:4, f5:2)", () => {
    const byVariant: Record<string, number> = {};
    for (const s of FOOTBALL_KG.schemes) {
      for (const v of s.variants) byVariant[v] = (byVariant[v] ?? 0) + 1;
    }
    expect(byVariant.tackle_11).toBe(7);
    expect(byVariant.flag_7v7).toBe(6);
    expect(byVariant.flag_6v6).toBe(4);
    expect(byVariant.flag_5v5).toBe(2);
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

  it("has all 26 routes from the legacy catalog", () => {
    expect(FOOTBALL_KG.routes.length).toBe(26);
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
