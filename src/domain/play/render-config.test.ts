/**
 * Tests for the shared field-aspect helpers.
 *
 * Pins the variant-specific aspect ratios so a coach editing the
 * formula in render-config.ts will surface ALL render surfaces that
 * depend on it (editor, game-mode, formation editor, chat embed)
 * via test failure rather than via "the chat looks subtly different
 * from the editor" coach reports.
 */

import { describe, expect, it } from "vitest";
import { createEmptyPlayDocument } from "./factory";
import {
  VIEWPORT_LENGTH_YDS,
  NARROW_FIELD_ASPECT,
  fieldAspectFor,
  fieldAspectForWidth,
} from "./render-config";

describe("render-config — known constants", () => {
  it("VIEWPORT_LENGTH_YDS is 25 (the standard 25-yard display window)", () => {
    expect(VIEWPORT_LENGTH_YDS).toBe(25);
  });

  it("NARROW_FIELD_ASPECT matches flag_7v7's natural aspect (the editor's default cap)", () => {
    expect(NARROW_FIELD_ASPECT).toBeCloseTo(30 / (25 * 0.75), 5); // 1.6
  });
});

describe("fieldAspectForWidth — variant-by-variant", () => {
  it("flag_5v5 (25yd width) → ~1.33:1", () => {
    expect(fieldAspectForWidth(25)).toBeCloseTo(25 / 18.75, 5);
  });

  it("flag_7v7 (30yd width) → 1.6:1 (the 16:10 sweet spot)", () => {
    expect(fieldAspectForWidth(30)).toBeCloseTo(1.6, 5);
  });

  it("tackle_11 (53yd width) → ~2.83:1", () => {
    expect(fieldAspectForWidth(53)).toBeCloseTo(53 / 18.75, 5);
  });

  it("falls back to 16:10 for invalid input (NaN, 0, negative)", () => {
    expect(fieldAspectForWidth(NaN)).toBeCloseTo(1.6, 5);
    expect(fieldAspectForWidth(0)).toBeCloseTo(1.6, 5);
    expect(fieldAspectForWidth(-1)).toBeCloseTo(1.6, 5);
  });
});

describe("fieldAspectFor — uses doc's sportProfile", () => {
  it("returns the doc's variant aspect", () => {
    const doc = createEmptyPlayDocument();
    expect(fieldAspectFor(doc)).toBeCloseTo(
      doc.sportProfile.fieldWidthYds / 18.75,
      5,
    );
  });

  it("falls back to 16:10 when sportProfile is corrupted", () => {
    const corrupt = { sportProfile: { fieldWidthYds: NaN } } as unknown as Parameters<typeof fieldAspectFor>[0];
    expect(fieldAspectFor(corrupt)).toBeCloseTo(1.6, 5);
  });

  it("falls back to 16:10 when sportProfile is missing entirely", () => {
    const corrupt = {} as Parameters<typeof fieldAspectFor>[0];
    expect(fieldAspectFor(corrupt)).toBeCloseTo(1.6, 5);
  });
});

describe("render-config — single-source-of-truth invariant", () => {
  // If the formula in render-config.ts ever drifts (someone changes
  // 0.75 to 0.7), this test catches it AND every render-surface that
  // imports the helper updates atomically. Before the extraction, this
  // formula was duplicated in 4 files and could drift independently.
  it("flag_7v7 aspect is exactly 16:10 (1.6) — sentinel value the formula must preserve", () => {
    expect(fieldAspectForWidth(30)).toBe(1.6);
  });
});
