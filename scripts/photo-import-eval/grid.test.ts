import { describe, expect, it } from "vitest";
import { gridLayout, parseRegionFlag, DEFAULT_REGION } from "./grid";

describe("gridLayout", () => {
  it("produces rows*cols cells labeled Play 1..N in reading order", () => {
    const entries = gridLayout(4, 4);
    expect(entries).toHaveLength(16);
    expect(entries[0].label).toBe("Play 1");
    expect(entries[15].label).toBe("Play 16");
    // Play 5 starts row 2: same x as Play 1, lower y.
    expect(entries[4].bbox.x).toBeCloseTo(entries[0].bbox.x, 5);
    expect(entries[4].bbox.y).toBeGreaterThan(entries[0].bbox.y);
  });

  it("keeps every bbox inside [0,1] even with margins", () => {
    for (const e of gridLayout(4, 4, DEFAULT_REGION, 0.2)) {
      expect(e.bbox.x).toBeGreaterThanOrEqual(0);
      expect(e.bbox.y).toBeGreaterThanOrEqual(0);
      expect(e.bbox.x + e.bbox.w).toBeLessThanOrEqual(1.000001);
      expect(e.bbox.y + e.bbox.h).toBeLessThanOrEqual(1.000001);
    }
  });

  it("cells cover the content region (with margin overlap)", () => {
    const region = { top: 0.1, bottom: 0.9, left: 0.1, right: 0.9 };
    const entries = gridLayout(2, 2, region, 0);
    expect(entries[0].bbox).toMatchObject({ x: 0.1, y: 0.1 });
    expect(entries[0].bbox.w).toBeCloseTo(0.4, 5);
    expect(entries[0].bbox.h).toBeCloseTo(0.4, 5);
    const last = entries[3].bbox;
    expect(last.x + last.w).toBeCloseTo(0.9, 5);
    expect(last.y + last.h).toBeCloseTo(0.9, 5);
  });

  it("rejects degenerate grids and regions", () => {
    expect(() => gridLayout(0, 4)).toThrow();
    expect(() => gridLayout(4, 4, { top: 0.9, bottom: 0.1, left: 0, right: 1 })).toThrow();
  });
});

describe("parseRegionFlag", () => {
  it("parses four comma-separated numbers", () => {
    expect(parseRegionFlag("0.1, 0.9, 0.05, 0.95")).toEqual({ top: 0.1, bottom: 0.9, left: 0.05, right: 0.95 });
  });
  it("rejects malformed input", () => {
    expect(() => parseRegionFlag("0.1,0.9")).toThrow();
    expect(() => parseRegionFlag("a,b,c,d")).toThrow();
  });
});
