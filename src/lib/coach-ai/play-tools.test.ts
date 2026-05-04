/**
 * Hard-vs-soft render-warning classification.
 *
 * Hard warnings block the save (Cal asked for something the catalog can't
 * deliver — saving would silently substitute). Soft warnings let the save
 * proceed but surface to Cal in the success response so it can mention the
 * dropped element to the coach. The split matches AGENTS.md's spec-path
 * rule that ONLY formation_fallback / defense_unknown / route_template_missing
 * are hard, plus formation_player_count_mismatch (synthesizer bug) and
 * sanitizer_dropped (corrupt geometry caught at the last line of defense).
 *
 * Regression target (2026-05-04): Cal-recreated Trips Right Levels and
 * Shotgun Spread Slant emitted assignments for "Y" in formations whose
 * synthesizer roster is X/Z/H/S — no Y. The previous code promoted
 * assignment_player_missing to a hard error, blocking the save. The
 * soft classification matches the legacy CoachDiagram path, which
 * silently dropped routes whose carrier wasn't on the field.
 */

import { describe, expect, it } from "vitest";
import { HARD_RENDER_WARNINGS, isHardWarning } from "./play-tools";
import type { RenderWarning } from "@/domain/play/specRenderer";

describe("render-warning hard/soft classification", () => {
  it("classifies catalog-substitution warnings as HARD", () => {
    const hardCodes: RenderWarning["code"][] = [
      "formation_fallback",
      "formation_player_count_mismatch",
      "defense_unknown",
      "route_template_missing",
      "sanitizer_dropped",
    ];
    for (const code of hardCodes) {
      const w: RenderWarning = { code, message: "x" };
      expect(isHardWarning(w), `${code} should be HARD`).toBe(true);
      expect(HARD_RENDER_WARNINGS.has(code)).toBe(true);
    }
  });

  it("classifies missing-reference warnings as SOFT (play saves, dropped element surfaced to Cal)", () => {
    const softCodes: RenderWarning["code"][] = [
      "assignment_player_missing",
      "defender_assignment_player_missing",
      "defender_zone_unknown",
      "defender_man_target_missing",
    ];
    for (const code of softCodes) {
      const w: RenderWarning = { code, message: "x" };
      expect(isHardWarning(w), `${code} should be SOFT`).toBe(false);
    }
  });
});
