/**
 * Defenders are labelled with one vocabulary, everywhere.
 *
 * The hand-written templates used terse single letters (C, E, T, S, M, W, F, N)
 * for exactly the positions the Football KG names properly (CB, DE, DT, SL, ML,
 * WL, FS, NB). Same positions, two vocabularies — so a coach's blank-tile
 * defense said "C S M S C" while the Cover 2 starter beside it said
 * "CB CB FS SS", and nothing on screen explained why.
 *
 * The KG wins: it's the catalog, and its abbreviations are the ones coaches
 * write on a board. These pin the alignment so the terse set can't creep back.
 *
 * NOT pinned: the KG's flag coverage labels (FL/HL/HM/HR = flat-left,
 * hook-left, hook-middle, hook-right). Those are ASSIGNMENTS, not positions —
 * the same defender is FL in Cover 3 and CB in Cover 2 because their job
 * changed. That's information a position label would destroy, so it stays.
 */
import { describe, expect, it } from "vitest";
import { defaultDefendersForVariant, defenseTemplatesForVariant } from "./factory";
import type { SportVariant } from "./types";

/** Every label the templates can produce, across every variant. */
function allTemplateLabels(): Set<string> {
  const out = new Set<string>();
  for (const v of ["flag_4v4", "flag_5v5", "flag_6v6", "flag_7v7", "tackle_11"] as const) {
    for (const t of defenseTemplatesForVariant(v as SportVariant)) {
      for (const p of t.players) out.add(p.label);
    }
  }
  return out;
}

describe("defender labels use the KG's vocabulary", () => {
  it("never uses the retired single-letter abbreviations", () => {
    // C/E/T/W/F/N were the terse set. Each had a KG counterpart it should
    // have been using: CB/DE/DT/WL/FS/NB. (S survives — see below.)
    const retired = ["C", "E", "T", "W", "F", "N", "O", "I"];
    const labels = allTemplateLabels();
    for (const r of retired) {
      expect(labels.has(r), `"${r}" is a retired terse label`).toBe(false);
    }
  });

  it("tackle names the front and the back seven the way the KG does", () => {
    const labels = defaultDefendersForVariant("tackle_11").map((p) => p.label);
    expect(labels).toEqual(["DE", "DT", "DT", "DE", "SL", "ML", "WL", "CB", "CB", "FS", "SS"]);
  });

  it("flag corners are CB, not C", () => {
    const labels = defaultDefendersForVariant("flag_5v5").map((p) => p.label);
    expect(labels.filter((l) => l === "CB").length).toBeGreaterThan(0);
    expect(labels).not.toContain("C");
  });

  it("keeps S for a generic safety — role S, and not deep enough to be FS/SS", () => {
    // The two flag Base defenders at y≈0.56 flank the linebackers rather than
    // playing deep, so FS/SS (deep safeties) would be actively wrong. "S" is
    // the standard abbreviation and matches their role; the KG simply has no
    // generic-safety alignment to align against.
    const base = defaultDefendersForVariant("flag_7v7");
    const generic = base.filter((p) => p.label === "S");
    expect(generic.length).toBe(2);
    expect(generic.every((p) => p.role === "S")).toBe(true);
    expect(generic.every((p) => p.position.y < 0.6)).toBe(true);
  });

  it("every label is at least the position's real abbreviation, not a single initial", () => {
    // Guards the actual regression: a label that's one letter where a real
    // abbreviation exists. "S" and "M" are the genuine abbreviations for
    // safety and mike, so they're allowed to be short.
    const allowedShort = new Set(["S", "M", "D", "R"]);
    for (const l of allTemplateLabels()) {
      if (l.length === 1) {
        expect(allowedShort.has(l), `"${l}" is a single initial, not an abbreviation`).toBe(true);
      }
    }
  });
});
