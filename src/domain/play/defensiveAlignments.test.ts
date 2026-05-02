/**
 * Defensive alignment catalog round-trip tests.
 *
 * Phase D1 of Coach Cal's defense composition framework. Mirrors the
 * `routeTemplates.test.ts` shape: assert that every catalog entry
 * satisfies the structural invariants per-defender assignments now
 * impose. The Cover-1 case from the screenshot bug ("show their zones"
 * rendered no zones) is the canonical example: catalog entries that
 * SAY they're zone-or-mixed must have zone IDs that resolve and at
 * least one defender that drops into a zone.
 *
 * Rules enforced:
 *   1. Every (front, coverage) pair is unique within a variant.
 *   2. Every zone with an `id` has a unique id within its alignment.
 *   3. Every per-defender `assignment.kind === "zone"` references a
 *      zoneId that exists in the alignment's `zones[]`.
 *   4. Cover 1 entries (across variants) must have at least one
 *      `zone_drop` defender — that's the FS playing deep middle. The
 *      original screenshot bug was the alignment-wide `manCoverage:
 *      true` flag treating the FS as man, so this test would have
 *      caught it.
 *   5. `getDefenderAssignmentDefault` returns a valid assignment for
 *      every defender in every entry (no undefined slipping through).
 */

import { describe, expect, it } from "vitest";
import {
  DEFENSIVE_ALIGNMENTS,
  type DefensiveAlignment,
  getDefenderAssignmentDefault,
  alignmentWithAssignments,
  findZoneById,
} from "./defensiveAlignments";

describe("DEFENSIVE_ALIGNMENTS catalog", () => {
  it("has at least one entry per variant we ship", () => {
    const variants = new Set(DEFENSIVE_ALIGNMENTS.map((a) => a.variant));
    expect(variants.has("tackle_11")).toBe(true);
    expect(variants.has("flag_7v7")).toBe(true);
    expect(variants.has("flag_5v5")).toBe(true);
  });

  it("every (variant, front, coverage) tuple is unique", () => {
    const seen = new Set<string>();
    for (const a of DEFENSIVE_ALIGNMENTS) {
      const key = `${a.variant}|${a.front}|${a.coverage}`.toLowerCase();
      expect(seen.has(key), `duplicate alignment: ${key}`).toBe(false);
      seen.add(key);
    }
  });

  it("every defender position is reasonable (not stacked, on field)", () => {
    for (const a of DEFENSIVE_ALIGNMENTS) {
      for (const p of a.players) {
        expect(Math.abs(p.x), `${a.front}/${a.coverage} ${p.id} off-field x`).toBeLessThan(25);
        expect(p.y, `${a.front}/${a.coverage} ${p.id} behind LOS`).toBeGreaterThanOrEqual(0);
        expect(p.y, `${a.front}/${a.coverage} ${p.id} ridiculous depth`).toBeLessThan(25);
      }
    }
  });
});

describe("Per-defender assignments (Phase D1)", () => {
  it("every zone in an alignment with a `zone` assignment has an id", () => {
    for (const a of DEFENSIVE_ALIGNMENTS) {
      const playersHaveZone = a.players.some(
        (p) => p.assignment?.kind === "zone",
      );
      if (!playersHaveZone) continue;
      const zones = a.zones ?? [];
      // If any defender references a zone, every zone in the array must
      // be addressable — otherwise the renderer can't pick which zone to
      // draw for that defender.
      for (const z of zones) {
        expect(
          typeof z.id === "string" && z.id.length > 0,
          `${a.front}/${a.coverage} has a zone with no id (label="${z.label}") but at least one defender references zones by id`,
        ).toBe(true);
      }
    }
  });

  it("zone IDs are unique within each alignment", () => {
    for (const a of DEFENSIVE_ALIGNMENTS) {
      const ids = (a.zones ?? []).map((z) => z.id).filter(Boolean) as string[];
      const seen = new Set<string>();
      for (const id of ids) {
        expect(seen.has(id), `${a.front}/${a.coverage} duplicate zone id "${id}"`).toBe(false);
        seen.add(id);
      }
    }
  });

  it("every `zone` assignment resolves to a zone in the alignment", () => {
    for (const a of DEFENSIVE_ALIGNMENTS) {
      for (const p of a.players) {
        if (p.assignment?.kind !== "zone") continue;
        const zone = findZoneById(a, p.assignment.zoneId);
        expect(
          zone,
          `${a.front}/${a.coverage} defender ${p.id} references unknown zoneId "${p.assignment.zoneId}"`,
        ).not.toBeNull();
      }
    }
  });

  it("Cover 1 (FS robber) renders the FS as a zone defender, not man — the screenshot-bug regression", () => {
    // The screenshot bug: coach asked "show their zones?" on a
    // 4-3 Over / Cover 1 and the renderer showed no zones because the
    // alignment was flagged manCoverage:true wholesale. The new model
    // says Cover 1 is "all man EXCEPT FS who has the deep middle" —
    // i.e., the FS specifically must be a zone defender.
    const cover1Entries = DEFENSIVE_ALIGNMENTS.filter(
      (a) => a.coverage.toLowerCase().replace(/\s+/g, "") === "cover1",
    );
    expect(cover1Entries.length, "expected Cover 1 entries to exist").toBeGreaterThan(0);
    for (const a of cover1Entries) {
      const fs = a.players.find((p) => p.id === "FS");
      expect(fs, `${a.front}/${a.coverage} missing FS player`).toBeDefined();
      const assignment = getDefenderAssignmentDefault(fs!, a);
      expect(
        assignment.kind,
        `${a.front}/${a.coverage} FS should drop into deep middle zone (Cover 1 robber), not be man`,
      ).toBe("zone");
    }
  });

  it("Cover 0 (no help) has no zone defenders — pure man with maybe a spy", () => {
    const cover0 = DEFENSIVE_ALIGNMENTS.filter(
      (a) => a.coverage.toLowerCase().replace(/\s+/g, "") === "cover0",
    );
    for (const a of cover0) {
      for (const p of a.players) {
        const assignment = getDefenderAssignmentDefault(p, a);
        expect(
          assignment.kind === "man" || assignment.kind === "spy" || assignment.kind === "blitz",
          `${a.front}/${a.coverage} defender ${p.id} should be man/spy/blitz in Cover 0, got ${assignment.kind}`,
        ).toBe(true);
      }
    }
  });

  it("getDefenderAssignmentDefault returns a defined kind for every defender in every entry", () => {
    for (const a of DEFENSIVE_ALIGNMENTS) {
      for (const p of a.players) {
        const assignment = getDefenderAssignmentDefault(p, a);
        expect(
          assignment.kind,
          `${a.front}/${a.coverage} defender ${p.id} resolved to undefined kind`,
        ).toMatch(/^(zone|man|blitz|spy)$/);
      }
    }
  });

  it("alignmentWithAssignments mirrors players when strength=left and preserves assignments", () => {
    const a = DEFENSIVE_ALIGNMENTS.find((x) => x.coverage === "Cover 3" && x.variant === "flag_7v7")!;
    const right = alignmentWithAssignments(a, "right");
    const left = alignmentWithAssignments(a, "left");
    expect(right.length).toBe(left.length);
    for (let i = 0; i < right.length; i++) {
      expect(left[i].x).toBe(-right[i].x);
      expect(left[i].assignment).toEqual(right[i].assignment);
    }
  });
});

describe("Coverage-shape sanity", () => {
  function entriesWithCoverage(coverage: string): DefensiveAlignment[] {
    const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");
    return DEFENSIVE_ALIGNMENTS.filter((a) => norm(a.coverage) === norm(coverage));
  }

  it("Cover 3 entries have exactly 3 deep zones", () => {
    for (const a of entriesWithCoverage("Cover 3")) {
      const deepZones = (a.zones ?? []).filter((z) => z.label.toLowerCase().startsWith("deep"));
      expect(
        deepZones.length,
        `${a.front}/${a.coverage} should have 3 deep zones, has ${deepZones.length}`,
      ).toBe(3);
    }
  });

  it("Cover 2 entries have exactly 2 deep zones", () => {
    for (const a of entriesWithCoverage("Cover 2")) {
      const deepZones = (a.zones ?? []).filter((z) =>
        z.label.toLowerCase().startsWith("deep") && !z.label.toLowerCase().includes("(m)"),
      );
      expect(
        deepZones.length,
        `${a.front}/${a.coverage} should have 2 deep zones, has ${deepZones.length}`,
      ).toBe(2);
    }
  });
});
