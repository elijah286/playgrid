/**
 * Defensive tests for resolveFieldTheme.
 *
 * The renderer is the last line before a coach sees a play. An unknown
 * fieldBackground value used to crash the editor (BG_COLORS[key] was
 * undefined → reading .main on undefined threw). Now any unknown value
 * falls back to the green theme. This file pins the fallback so future
 * edits to the palette can't reintroduce the crash.
 */

import { describe, expect, it, vi } from "vitest";
import { resolveFieldTheme } from "./fieldTheme";

describe("resolveFieldTheme — known values", () => {
  it("green is the default", () => {
    const theme = resolveFieldTheme(undefined);
    expect(theme.bgMain).toBe("#2D8B4E");
  });

  it("explicit green", () => {
    expect(resolveFieldTheme("green").bgMain).toBe("#2D8B4E");
  });

  it("white", () => {
    expect(resolveFieldTheme("white").bgMain).toBe("#FFFFFF");
  });

  it("black", () => {
    expect(resolveFieldTheme("black").bgMain).toBe("#0A0A0A");
  });

  it("legacy gray maps to white", () => {
    expect(resolveFieldTheme("gray").bgMain).toBe("#FFFFFF");
  });

  it("null falls back to green", () => {
    expect(resolveFieldTheme(null).bgMain).toBe("#2D8B4E");
  });
});

describe("resolveFieldTheme — defense in depth", () => {
  it("unknown background falls back to green (does not throw)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    // Cast through unknown so TS doesn't complain about the bad value.
    const theme = resolveFieldTheme(("blue" as unknown) as Parameters<typeof resolveFieldTheme>[0]);
    expect(theme.bgMain).toBe("#2D8B4E");
    expect(theme.lineColor).toBeDefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("empty string falls back to green", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const theme = resolveFieldTheme(("" as unknown) as Parameters<typeof resolveFieldTheme>[0]);
    expect(theme.bgMain).toBe("#2D8B4E");
    warn.mockRestore();
  });

  it("returns a complete theme (no undefined fields) for any input", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const input of [undefined, null, "green", "white", "black", "gray", "purple", "fuchsia", "" as never]) {
      const theme = resolveFieldTheme(input as Parameters<typeof resolveFieldTheme>[0]);
      expect(theme.bgMain).toBeDefined();
      expect(theme.bgDark).toBeDefined();
      expect(theme.lineColor).toBeDefined();
      expect(theme.hashColor).toBeDefined();
      expect(theme.numberColor).toBeDefined();
      expect(theme.borderColor).toBeDefined();
      expect(theme.losColor).toBeDefined();
    }
    warn.mockRestore();
  });
});
