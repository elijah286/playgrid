/**
 * Save-time content-validation gates.
 *
 * Each test is a minimal CoachDiagram exercising one gate. Failure
 * modes from coaches go here as NEGATIVE cases (currently buggy →
 * expected after fix), then the validator hardens until it passes.
 *
 * Surfaced 2026-05-04 by a Flag 5v5 playbook where Cal saved 11 plays
 * via `create_play` and shipped:
 *   - 5 plays with `routes: []` (zero post-snap action — Cal authored
 *     players but no routes)
 *   - 1 play with 2 of 4 routes (jet sweep with C+H drawn but B's
 *     motion + Z's carry missing — prose described all four)
 *   - 1 play with H + S both deriving yellow (color clash)
 * The chat-time validator catches the color clash + a similar
 * coverage check, but `create_play` saved them anyway because those
 * gates only ran inside the chat-time `validateDiagrams`. These tests
 * pin the rules at a layer every write path goes through.
 */

import { describe, expect, it } from "vitest";
import {
  validateColorClash,
  validateCenterEligibility,
  validateOffensiveCoverage,
  validatePlayContent,
} from "./play-content-validate";
import type { CoachDiagram } from "@/features/coach-ai/coachDiagramConverter";
import { defaultSettingsForVariant } from "@/domain/playbook/settings";

describe("validateColorClash", () => {
  it("rejects two slot players (H + S both → yellow)", () => {
    const diagram: CoachDiagram = {
      variant: "flag_5v5",
      players: [
        { id: "Q", x: 0, y: -3, team: "O" },
        { id: "C", x: 0, y: 0, team: "O" },
        { id: "Z", x: 10, y: 0, team: "O" },
        { id: "H", x: 5, y: -1, team: "O" },
        { id: "S", x: 7, y: -1, team: "O" },
      ],
      routes: [],
    };
    const errors = validateColorClash(diagram);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/@H.*@S|@S.*@H/);
    expect(errors[0]).toMatch(/yellow/i);
  });

  it("rejects two X's (X + X2 both → red)", () => {
    const errors = validateColorClash({
      players: [
        { id: "Q", x: 0, y: -3, team: "O" },
        { id: "X", x: -10, y: 0, team: "O" },
        { id: "X2", x: 10, y: 0, team: "O" },
      ],
    });
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(errors[0]).toMatch(/red/i);
  });

  it("ALLOWS distinct skill labels (X + Y + Z + H + B)", () => {
    const errors = validateColorClash({
      players: [
        { id: "Q", x: 0, y: -3, team: "O" },
        { id: "X", x: -10, y: 0, team: "O" },
        { id: "Y", x: 5, y: 0, team: "O" },
        { id: "Z", x: 10, y: 0, team: "O" },
        { id: "H", x: 7, y: -1, team: "O" },
        { id: "B", x: 0, y: -5, team: "O" },
      ],
    });
    expect(errors).toHaveLength(0);
  });

  it("ALLOWS QB + C sharing structural defaults (white/black)", () => {
    const errors = validateColorClash({
      players: [
        { id: "Q", x: 0, y: -3, team: "O" },
        { id: "C", x: 0, y: 0, team: "O" },
      ],
    });
    expect(errors).toHaveLength(0);
  });

  it("explicit color override resolves a clash", () => {
    const errors = validateColorClash({
      players: [
        { id: "Q", x: 0, y: -3, team: "O" },
        { id: "H", x: 5, y: -1, team: "O" },
        { id: "S", x: 7, y: -1, team: "O", color: "#A855F7" }, // purple override
      ],
    });
    expect(errors).toHaveLength(0);
  });
});

describe("validateCenterEligibility", () => {
  it("rejects @C route in 7v7 (centerIsEligible:false)", () => {
    const settings = defaultSettingsForVariant("flag_7v7");
    const errors = validateCenterEligibility(
      {
        variant: "flag_7v7",
        players: [
          { id: "Q", x: 0, y: -5, team: "O" },
          { id: "C", x: 0, y: 0, team: "O" },
        ],
        routes: [{ from: "C", path: [[0, 5]] }],
      },
      settings,
      "flag_7v7",
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/@C has a route/i);
  });

  it("ALLOWS @C route in 5v5 (centerIsEligible:true)", () => {
    const settings = defaultSettingsForVariant("flag_5v5");
    const errors = validateCenterEligibility(
      {
        variant: "flag_5v5",
        players: [
          { id: "Q", x: 0, y: -3, team: "O" },
          { id: "C", x: 0, y: 0, team: "O" },
        ],
        routes: [{ from: "C", path: [[5, 5]] }],
      },
      settings,
      "flag_5v5",
    );
    expect(errors).toHaveLength(0);
  });
});

describe("validateOffensiveCoverage", () => {
  it("rejects a flag_5v5 play with zero routes (the screenshot bug)", () => {
    const settings = defaultSettingsForVariant("flag_5v5");
    const errors = validateOffensiveCoverage(
      {
        variant: "flag_5v5",
        players: [
          { id: "Q", x: 0, y: -3, team: "O" },
          { id: "C", x: 0, y: 0, team: "O" },
          { id: "X", x: -12, y: 0, team: "O" },
          { id: "Y", x: -7, y: 0, team: "O" },
          { id: "Z", x: 12, y: 0, team: "O" },
        ],
        routes: [],
      },
      "flag_5v5",
      settings,
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/missing actions/i);
    // All 4 non-QB players named in the rejection.
    for (const id of ["@C", "@X", "@Y", "@Z"]) {
      expect(errors[0]).toContain(id);
    }
  });

  it("rejects a jet sweep where @B motion + @Z carry are missing (prose-vs-diagram drift)", () => {
    // The exact flavor the coach hit: only C + H have routes; B and Z
    // are silent even though the prose narrates motion + handoff.
    const settings = defaultSettingsForVariant("flag_5v5");
    const errors = validateOffensiveCoverage(
      {
        variant: "flag_5v5",
        players: [
          { id: "Q", x: 0, y: -3, team: "O" },
          { id: "C", x: 0, y: 0, team: "O" },
          { id: "B", x: 5, y: -3, team: "O" },
          { id: "Z", x: 12, y: 0, team: "O" },
          { id: "H", x: 8, y: -1, team: "O" },
        ],
        routes: [
          { from: "C", path: [[-5, 2]] },
          { from: "H", path: [[3, 5]] },
        ],
      },
      "flag_5v5",
      settings,
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("@B");
    expect(errors[0]).toContain("@Z");
  });

  it("ACCEPTS a complete flag_5v5 play (all 4 non-QB players covered)", () => {
    const settings = defaultSettingsForVariant("flag_5v5");
    const errors = validateOffensiveCoverage(
      {
        variant: "flag_5v5",
        players: [
          { id: "Q", x: 0, y: -3, team: "O" },
          { id: "C", x: 0, y: 0, team: "O" },
          { id: "X", x: -12, y: 0, team: "O" },
          { id: "Y", x: -7, y: 0, team: "O" },
          { id: "Z", x: 12, y: 0, team: "O" },
        ],
        routes: [
          { from: "C", path: [[-5, 2]] },
          { from: "X", path: [[-12, 6]] },
          { from: "Y", path: [[-3, 5]] },
          { from: "Z", path: [[12, 7]] },
        ],
      },
      "flag_5v5",
      settings,
    );
    expect(errors).toHaveLength(0);
  });

  it("counts pre-snap motion (motion array, empty path) as a valid action", () => {
    // Pure-motion shift player — the `motion` field is non-empty even
    // though `path` is []. Still counts as having an action.
    const settings = defaultSettingsForVariant("flag_5v5");
    const errors = validateOffensiveCoverage(
      {
        variant: "flag_5v5",
        players: [
          { id: "Q", x: 0, y: -3, team: "O" },
          { id: "C", x: 0, y: 0, team: "O" },
          { id: "X", x: -12, y: 0, team: "O" },
          { id: "Y", x: -7, y: 0, team: "O" },
          { id: "Z", x: 12, y: 0, team: "O" },
        ],
        routes: [
          { from: "C", path: [[-5, 2]] },
          { from: "X", path: [[-12, 6]] },
          { from: "Y", motion: [[-2, 0]], path: [] },
          { from: "Z", path: [[12, 7]] },
        ],
      },
      "flag_5v5",
      settings,
    );
    expect(errors).toHaveLength(0);
  });

  it("EXEMPTS @C in flag_7v7 (centerIsEligible:false)", () => {
    const settings = defaultSettingsForVariant("flag_7v7");
    const errors = validateOffensiveCoverage(
      {
        variant: "flag_7v7",
        players: [
          { id: "Q", x: 0, y: -5, team: "O" },
          { id: "C", x: 0, y: 0, team: "O" },
          { id: "X", x: -12, y: 0, team: "O" },
          { id: "Y", x: -6, y: 0, team: "O" },
          { id: "Z", x: 12, y: 0, team: "O" },
          { id: "H", x: 6, y: 0, team: "O" },
          { id: "B", x: 3, y: -3, team: "O" },
        ],
        routes: [
          { from: "X", path: [[-12, 6]] },
          { from: "Y", path: [[-3, 8]] },
          { from: "Z", path: [[12, 7]] },
          { from: "H", path: [[7, 4]] },
          { from: "B", path: [[2, 1]] },
        ],
      },
      "flag_7v7",
      settings,
    );
    expect(errors).toHaveLength(0);
  });

  it("does not fire on tackle_11 (linemen legitimately block)", () => {
    const settings = defaultSettingsForVariant("tackle_11");
    const errors = validateOffensiveCoverage(
      {
        variant: "tackle_11",
        players: [
          { id: "Q", x: 0, y: -5, team: "O" },
          { id: "LT", x: -3, y: 0, team: "O" },
          { id: "LG", x: -1.5, y: 0, team: "O" },
          { id: "C", x: 0, y: 0, team: "O" },
          { id: "RG", x: 1.5, y: 0, team: "O" },
          { id: "RT", x: 3, y: 0, team: "O" },
          { id: "X", x: -12, y: 0, team: "O" },
        ],
        routes: [{ from: "X", path: [[-12, 8]] }],
      },
      "tackle_11",
      settings,
    );
    expect(errors).toHaveLength(0);
  });

  it("skips defense plays", () => {
    const errors = validateOffensiveCoverage(
      {
        variant: "flag_5v5",
        players: [
          { id: "FS", x: 0, y: 12, team: "D" },
          { id: "CB", x: -10, y: 5, team: "D" },
        ],
      },
      "flag_5v5",
      defaultSettingsForVariant("flag_5v5"),
      "defense",
    );
    expect(errors).toHaveLength(0);
  });
});

describe("validatePlayContent — aggregator", () => {
  it("returns ok:false when ANY gate fails", () => {
    const result = validatePlayContent(
      {
        variant: "flag_5v5",
        players: [
          { id: "Q", x: 0, y: -3, team: "O" },
          { id: "C", x: 0, y: 0, team: "O" },
          { id: "H", x: 5, y: -1, team: "O" },
          { id: "S", x: 7, y: -1, team: "O" }, // clash with H
        ],
        routes: [
          { from: "C", path: [[3, 2]] },
          { from: "H", path: [[5, 4]] },
          { from: "S", path: [[7, 4]] },
        ],
      },
      "flag_5v5",
      defaultSettingsForVariant("flag_5v5"),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => /color clash/i.test(e))).toBe(true);
  });

  it("returns ok:true on a clean diagram", () => {
    const result = validatePlayContent(
      {
        variant: "flag_5v5",
        players: [
          { id: "Q", x: 0, y: -3, team: "O" },
          { id: "C", x: 0, y: 0, team: "O" },
          { id: "X", x: -12, y: 0, team: "O" },
          { id: "Y", x: -7, y: 0, team: "O" },
          { id: "Z", x: 12, y: 0, team: "O" },
        ],
        routes: [
          { from: "C", path: [[-5, 2]] },
          { from: "X", path: [[-12, 6]] },
          { from: "Y", path: [[-3, 5]] },
          { from: "Z", path: [[12, 7]] },
        ],
      },
      "flag_5v5",
      defaultSettingsForVariant("flag_5v5"),
    );
    expect(result.ok).toBe(true);
  });
});
