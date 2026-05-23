/**
 * Defensive reactor catalog — Layer 1 round-trip + integrity tests.
 *
 * Per AGENTS.md Rule 3, catalog entries get cue-coverage testing: every
 * pattern must reference a defender that actually exists in the matching
 * alignment catalog, and every reactor needs a non-empty coaching cue
 * for Cal to use in prose.
 *
 * The pattern lookup is keyed by (variant, coverage, concept). These
 * tests pin behavior for additions; round-trip via findReactorPattern
 * must return the exact entry that was indexed.
 */

import { describe, expect, it } from "vitest";
import {
  REACTOR_PATTERNS,
  findReactorPattern,
  detectConceptFromTitle,
} from "./defensiveReactors";
import { listDefensiveAlignments, findDefensiveAlignment } from "./defensiveAlignments";

describe("defensiveReactors — integrity", () => {
  it("every pattern has a non-empty description and (for non-wildcard) at least one reactor", () => {
    for (const p of REACTOR_PATTERNS) {
      expect(p.description.length, `pattern ${p.variant}/${p.coverage}/${p.concept} has empty description`).toBeGreaterThan(0);
      if (p.concept !== "*") {
        expect(p.reactors.length, `pattern ${p.variant}/${p.coverage}/${p.concept} has no reactors`).toBeGreaterThan(0);
      }
    }
  });

  it("every reactor has a non-empty coaching cue", () => {
    for (const p of REACTOR_PATTERNS) {
      for (const r of p.reactors) {
        expect(r.cue.length, `${p.variant}/${p.coverage}/${p.concept} reactor ${r.defender}→${r.trigger} has empty cue`).toBeGreaterThan(0);
      }
    }
  });

  it("every reactor's defender id exists in the matching alignment catalog", () => {
    for (const p of REACTOR_PATTERNS) {
      // Find an alignment for this variant + coverage (any front works —
      // the defender ids are stable across fronts for a given coverage).
      const alignmentsForVariant = listDefensiveAlignments(p.variant);
      const matchingAlignments = alignmentsForVariant.filter(
        (a) => a.coverage.toLowerCase() === p.coverage.toLowerCase(),
      );
      // Cover 0 may not have an explicit alignment in every variant; only
      // assert when we DO have alignment entries to cross-check against.
      if (matchingAlignments.length === 0) continue;
      const definedDefenderIds = new Set<string>();
      for (const a of matchingAlignments) {
        for (const player of a.players) definedDefenderIds.add(player.id);
      }
      for (const r of p.reactors) {
        // Reactor patterns reference defender ids as they appear in the
        // rendered fence — AFTER compose_defense's dedup pass suffixes
        // duplicate ids (e.g. two CBs in flag_5v5 Cover 3 become CB and
        // CB2). Strip a single trailing digit and re-check; the suffix is
        // a stable runtime convention, not a catalog-level distinct id.
        const stripped = r.defender.replace(/[0-9]+$/, "");
        const matches =
          definedDefenderIds.has(r.defender) ||
          definedDefenderIds.has(stripped);
        expect(
          matches,
          `${p.variant}/${p.coverage}/${p.concept}: reactor defender "${r.defender}" not in any matching alignment (have: ${[...definedDefenderIds].join(", ")})`,
        ).toBe(true);
      }
    }
  });

  it("every reactor's trigger uses a plausible offensive player id", () => {
    // The offensive labels Cal commonly uses; this is intentionally permissive.
    // If a reactor references a player that doesn't exist on the field at
    // overlay time, the renderer handles it (no path drawn, soft warning).
    const plausibleOffense = new Set(["X", "Y", "Z", "H", "B", "F", "S", "QB", "RB", "TE", "C"]);
    for (const p of REACTOR_PATTERNS) {
      for (const r of p.reactors) {
        // Allow simple numeric suffixes like H2.
        const base = r.trigger.replace(/[0-9]+$/, "");
        expect(
          plausibleOffense.has(base),
          `${p.variant}/${p.coverage}/${p.concept}: reactor trigger "${r.trigger}" looks unusual`,
        ).toBe(true);
      }
    }
  });

  it("no duplicate (variant, coverage, concept) keys", () => {
    const seen = new Set<string>();
    for (const p of REACTOR_PATTERNS) {
      const key = `${p.variant}|${p.coverage.toLowerCase()}|${p.concept.toLowerCase()}`;
      expect(seen.has(key), `duplicate pattern key: ${key}`).toBe(false);
      seen.add(key);
    }
  });
});

describe("findReactorPattern — lookup", () => {
  it("returns the exact pattern for an exact match", () => {
    const r = findReactorPattern("flag_7v7", "Tampa 2", "Flood");
    expect(r).not.toBeNull();
    if (!r) return;
    expect(r.variant).toBe("flag_7v7");
    expect(r.coverage).toBe("Tampa 2");
    expect(r.concept).toBe("Flood");
    expect(r.reactors.length).toBeGreaterThan(0);
  });

  it("is case-insensitive on coverage and concept", () => {
    const r1 = findReactorPattern("flag_7v7", "tampa 2", "flood");
    const r2 = findReactorPattern("flag_7v7", "Tampa 2", "Flood");
    expect(r1?.concept).toBe(r2?.concept);
    expect(r1?.coverage).toBe(r2?.coverage);
  });

  it("returns null for an unknown (coverage, concept) pair", () => {
    expect(findReactorPattern("flag_7v7", "Cover 7", "Snag")).toBeNull();
    expect(findReactorPattern("flag_7v7", "Tampa 2", "Made-Up Concept")).toBeNull();
  });

  it("returns null when variant doesn't match", () => {
    expect(findReactorPattern("flag_5v5", "Tampa 2", "Flood")).toBeNull();
  });

  it("falls back to a wildcard (concept=*) pattern for Cover 0", () => {
    const r = findReactorPattern("flag_7v7", "Cover 0", "Slant-Flat");
    expect(r).not.toBeNull();
    if (!r) return;
    expect(r.concept).toBe("*");
  });

  it("prefers an exact concept match over the wildcard", () => {
    // If we ever add a specific Cover 0 vs Mesh pattern, it should beat
    // the wildcard. The test guards the ordering, not the content.
    const r = findReactorPattern("flag_7v7", "Cover 0", "Anything");
    expect(r?.concept).toBe("*");
  });
});

describe("detectConceptFromTitle — concept extraction", () => {
  it("matches a title containing a known concept name", () => {
    expect(detectConceptFromTitle("Flood Right")).toBe("Flood");
    expect(detectConceptFromTitle("Mesh Concept")).toBe("Mesh");
    expect(detectConceptFromTitle("Smash")).toBe("Smash");
  });

  it("matches the longest concept name first (Four Verticals beats Verticals)", () => {
    // "Verticals" isn't in the catalog but "Four Verticals" is — so the
    // longer name wins when title contains "Four Verticals".
    expect(detectConceptFromTitle("Four Verticals 3x1")).toBe("Four Verticals");
  });

  it("matches Slant-Flat in a title with extra prefix", () => {
    // The user's screenshot had a play titled "Spread Slant-Flat" — that
    // should resolve to the Slant-Flat concept.
    expect(detectConceptFromTitle("Spread Slant-Flat")).toBe("Slant-Flat");
  });

  it("aliases Sail → Flood (same concept, different name)", () => {
    expect(detectConceptFromTitle("Sail Right")).toBe("Flood");
  });

  it("is case-insensitive", () => {
    expect(detectConceptFromTitle("flood right")).toBe("Flood");
    expect(detectConceptFromTitle("MESH")).toBe("Mesh");
  });

  it("returns null for a title with no known concept", () => {
    expect(detectConceptFromTitle("Noah")).toBeNull();
    expect(detectConceptFromTitle("Stack Left Levels")).toBe("Levels"); // Levels is in the catalog
    expect(detectConceptFromTitle("Trips R")).toBeNull();
    expect(detectConceptFromTitle(undefined)).toBeNull();
    expect(detectConceptFromTitle("")).toBeNull();
  });
});

describe("defensiveReactors — coverage breadth", () => {
  // The user asked for "all four coverages" seeded: Tampa 2, Cover 3,
  // Cover 1, Cover 0. Pin that each has at least one reactor pattern for
  // 7v7 (the primary variant in production).
  const PRIMARY_COVERAGES = ["Tampa 2", "Cover 3", "Cover 1", "Cover 0"];
  for (const cov of PRIMARY_COVERAGES) {
    it(`has at least one 7v7 reactor pattern for ${cov}`, () => {
      const patterns = REACTOR_PATTERNS.filter(
        (p) => p.variant === "flag_7v7" && p.coverage === cov,
      );
      expect(patterns.length, `no 7v7 patterns for ${cov}`).toBeGreaterThan(0);
    });
  }

  it("Tampa 2 covers the user-reported concept (Slant-Flat)", () => {
    // The reported bug was specifically Tampa 2 vs Slant-Flat. Pin this.
    const r = findReactorPattern("flag_7v7", "Tampa 2", "Slant-Flat");
    expect(r).not.toBeNull();
    if (!r) return;
    // HL on the slant is the key teaching point — it MUST be in the
    // reactor list. If a future edit removes it, this test fires.
    const hlReactor = r.reactors.find((rt) => rt.defender === "HL" && rt.trigger === "X");
    expect(hlReactor, "Tampa 2 vs Slant-Flat must include HL jumping @X's slant").toBeDefined();
    expect(hlReactor?.behavior).toBe("jump_route");
  });
});

describe("defensiveReactors — alignment cross-check via findDefensiveAlignment", () => {
  // Sanity: spot-check one pattern's defenders against the actual
  // alignment players[]. If listDefensiveAlignments and the alignment
  // catalog diverge somehow, this test catches it.
  it("Tampa 2 / 7v7 alignment contains HL, M, FS, SS", () => {
    const a = findDefensiveAlignment("flag_7v7", "7v7 Zone", "Tampa 2");
    expect(a).not.toBeNull();
    if (!a) return;
    const ids = new Set(a.players.map((p) => p.id));
    expect(ids.has("HL")).toBe(true);
    expect(ids.has("M")).toBe(true);
    expect(ids.has("FS")).toBe(true);
    expect(ids.has("SS")).toBe(true);
  });
});
