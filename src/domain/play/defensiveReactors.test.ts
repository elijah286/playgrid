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
  // Cover 1, Cover 0. "Cover 2" was added 2026-05-29 — a coach overlaid
  // Cover 2 on a Flood Right play and the defenders moved generically
  // (static zone-drops) because no flag_7v7 Cover 2 reactor existed, so
  // findReactorPattern returned null and the universal zone-drop fallback
  // fired. Pin that each coverage has at least one 7v7 reactor pattern.
  const PRIMARY_COVERAGES = ["Tampa 2", "Cover 2", "Cover 3", "Cover 1", "Cover 0"];
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

describe("defensiveReactors — flag_7v7 Cover 2 (reactor bug 2026-05-29)", () => {
  // A coach asked Cal to "install a cover 2 defense and show me how the
  // defenders should move as this play develops" over a Flood Right play.
  // The defenders moved generically (uniform static zone-drops) instead of
  // reacting to the routes, because flag_7v7 had Tampa 2 / Cover 3 / Cover 1
  // / Cover 0 reactors but NO Cover 2 — so findReactorPattern("flag_7v7",
  // "Cover 2", "Flood") returned null and the universal zone-drop fallback
  // fired. This block brings Cover 2 to parity with Tampa 2 (the other 7v7
  // zone shell) across the same five core pass concepts.
  //
  // Trigger ids match the canonical flag_7v7 skeleton (and the coach's
  // play): {X, Z outside · S, H slots · B back} — there is NO @Y in 7v7
  // (Y belongs to the 5v5/4v4 roster), so reactors reference the receivers
  // the renderer can actually resolve at overlay time.
  const REQUIRED_CONCEPTS = [
    "Flood",
    "Smash",
    "Four Verticals",
    "Mesh",
    "Slant-Flat",
  ] as const;

  for (const concept of REQUIRED_CONCEPTS) {
    it(`has a flag_7v7 Cover 2 reactor pattern for ${concept}`, () => {
      const r = findReactorPattern("flag_7v7", "Cover 2", concept);
      expect(r, `no flag_7v7 Cover 2 pattern for ${concept}`).not.toBeNull();
      if (!r) return;
      expect(r.variant).toBe("flag_7v7");
      expect(r.coverage).toBe("Cover 2");
      expect(r.concept).toBe(concept);
      expect(r.reactors.length, `Cover 2/${concept} has no reactors`).toBeGreaterThan(0);
    });
  }

  it("Cover 2 vs Flood reacts to the three-level stretch (the coach's exact case)", () => {
    // The reported play: @Z go (deep), @S out/sail (intermediate), @B flat
    // (low) — a textbook flood to the strong side. Cover 2's answer is a
    // three-defender triangle: corner caps the flat, hook undercuts the
    // sail, deep-half safety tops the vertical (no middle help in Cover 2).
    const r = findReactorPattern("flag_7v7", "Cover 2", "Flood");
    expect(r).not.toBeNull();
    if (!r) return;

    const deepHelp = r.reactors.find((rt) => rt.trigger === "Z" && rt.behavior === "carry_vertical");
    expect(deepHelp, "Cover 2 vs Flood must carry @Z's go (deep-half safety tops it)").toBeDefined();

    const sail = r.reactors.find((rt) => rt.trigger === "S");
    expect(sail, "Cover 2 vs Flood must react to @S's sail/out (the high-low route)").toBeDefined();

    const flat = r.reactors.find((rt) => rt.trigger === "B" && rt.behavior === "follow_to_flat");
    expect(flat, "Cover 2 vs Flood must cap @B's flat (the corner is the flat defender)").toBeDefined();

    // None of the reactors may reference @Y — it doesn't exist in the 7v7
    // roster, so it would silently fail to resolve at overlay time.
    expect(r.reactors.some((rt) => rt.trigger === "Y")).toBe(false);
  });

  it("every Cover 2 reactor trigger resolves against the canonical 7v7 roster", () => {
    // {X, Z, S, H, B, C} — the receivers a flag_7v7 play actually carries.
    const SEVEN_V_SEVEN_RECEIVERS = new Set(["X", "Z", "S", "H", "B", "C"]);
    const cover2 = REACTOR_PATTERNS.filter(
      (p) => p.variant === "flag_7v7" && p.coverage === "Cover 2",
    );
    expect(cover2.length).toBeGreaterThan(0);
    for (const p of cover2) {
      for (const rt of p.reactors) {
        expect(
          SEVEN_V_SEVEN_RECEIVERS.has(rt.trigger),
          `Cover 2/${p.concept}: trigger "${rt.trigger}" is not in the 7v7 roster`,
        ).toBe(true);
      }
    }
  });
});

describe("defensiveReactors — flag_6v6 coverage parity (catalog completeness)", () => {
  // flag_6v6 shipped with ZERO reactor patterns (2026-05-28 audit). With no
  // pattern, compose_defense overlays static dots on every 6v6 play and the
  // defense never visibly reacts to the concept — the gap the coach surfaced
  // ("show how skill players move in response to a developing play").
  //
  // This ratchet brings 6v6 to parity with the flag_5v5 catalog: the two
  // stock 6v6 coverages — Cover 3 (zone) and Cover 1 (man-free) — must each
  // react to the six core pass concepts.
  //
  // The 6v6 offensive roster is {QB, C, X, H, Z, B}: one slot @H and a back
  // @B. There is NO @Y or @S in 6v6 (see conceptMatch.test.ts), so reactor
  // triggers reference @X/@Z/@H/@B/@C — the real receivers the renderer can
  // resolve at overlay time.
  const REQUIRED_6V6_COVERAGES = ["Cover 3", "Cover 1"] as const;
  const REQUIRED_6V6_CONCEPTS = [
    "Smash",
    "Slant-Flat",
    "Mesh",
    "Flood",
    "Snag",
    "Four Verticals",
  ] as const;

  for (const coverage of REQUIRED_6V6_COVERAGES) {
    for (const concept of REQUIRED_6V6_CONCEPTS) {
      it(`has a flag_6v6 ${coverage} reactor pattern for ${concept}`, () => {
        const r = findReactorPattern("flag_6v6", coverage, concept);
        expect(r, `no flag_6v6 ${coverage} pattern for ${concept}`).not.toBeNull();
        if (!r) return;
        expect(r.variant).toBe("flag_6v6");
        expect(r.coverage).toBe(coverage);
        expect(r.concept).toBe(concept);
        expect(
          r.reactors.length,
          `flag_6v6 ${coverage}/${concept} has no reactors`,
        ).toBeGreaterThan(0);
      });
    }
  }
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
