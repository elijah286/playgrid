import { describe, expect, it } from "vitest";
import {
  accentGradient,
  accentUi,
  DEFAULT_PLAYBOOK_ACCENT,
  hexLuminance,
  isLightAccent,
} from "./playbook-accent";

describe("playbook-accent", () => {
  it("default accent is brand orange", () => {
    expect(DEFAULT_PLAYBOOK_ACCENT).toBe("#F26522");
  });

  describe("hexLuminance", () => {
    it("orders black < mid < white", () => {
      expect(hexLuminance("#000000")).toBeLessThan(hexLuminance("#808080"));
      expect(hexLuminance("#808080")).toBeLessThan(hexLuminance("#FFFFFF"));
    });

    it("returns the mid-tone fallback for non-hex input", () => {
      expect(hexLuminance("not-a-color")).toBe(0.5);
      expect(hexLuminance("#fff")).toBe(0.5); // 3-digit shorthand isn't supported
    });

    it("tolerates a missing leading #", () => {
      expect(hexLuminance("FFFFFF")).toBeCloseTo(hexLuminance("#FFFFFF"));
    });
  });

  describe("isLightAccent", () => {
    it("treats white as light (dark text) and black as dark (white text)", () => {
      expect(isLightAccent("#FFFFFF")).toBe(true);
      expect(isLightAccent("#000000")).toBe(false);
    });

    it("keeps white text on the default brand orange", () => {
      // The banners render white on orange; regression guard so a luminance
      // tweak can't silently flip it to dark text.
      expect(isLightAccent(DEFAULT_PLAYBOOK_ACCENT)).toBe(false);
    });

    it("uses dark text on a pale accent", () => {
      expect(isLightAccent("#FFFF00")).toBe(true); // pure yellow — clearly light
      expect(isLightAccent("#DDDDDD")).toBe(true); // light gray
    });
  });

  describe("accentGradient", () => {
    it("builds the 135° three-stop gradient", () => {
      expect(accentGradient("#123456")).toBe(
        "linear-gradient(135deg, #123456 0%, #123456dd 55%, #123456a8 100%)",
      );
    });
  });

  describe("accentUi", () => {
    it("bundles white-on-dark classes for the default orange", () => {
      const ui = accentUi(DEFAULT_PLAYBOOK_ACCENT);
      expect(ui).toEqual({
        isLightBg: false,
        onAccent: "text-white",
        onAccentMuted: "text-white/80",
        onAccentHover: "hover:bg-white/15",
        gradient: accentGradient(DEFAULT_PLAYBOOK_ACCENT),
      });
    });

    it("bundles dark-on-light classes for a pale accent", () => {
      const ui = accentUi("#FFFFFF");
      expect(ui.isLightBg).toBe(true);
      expect(ui.onAccent).toBe("text-slate-900");
      expect(ui.onAccentMuted).toBe("text-slate-700");
      expect(ui.onAccentHover).toBe("hover:bg-black/10");
    });
  });
});
