/**
 * Theme reads must be total — they run inside the root layout (ThemeProvider
 * hydration + effect), so a throw escapes to global-error.tsx and replaces
 * the whole document. On a cold WKWebView launch `matchMedia` can be missing
 * or throw; these helpers must degrade to "no dark preference" instead of
 * taking the root down. This is the offline first-boot hardening.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import {
  applyColorSchemeToDocument,
  colorSchemeQuery,
  systemPrefersDark,
} from "./colorModeStorage";
import { subscribeColorScheme } from "./themeStore";

const realMatchMedia = window.matchMedia;

afterEach(() => {
  window.matchMedia = realMatchMedia;
  document.documentElement.classList.remove("dark");
});

describe("theme reads survive a hostile matchMedia (cold WKWebView launch)", () => {
  it("colorSchemeQuery returns null instead of throwing when matchMedia throws", () => {
    window.matchMedia = () => {
      throw new Error("matchMedia unavailable during cold boot");
    };
    expect(() => colorSchemeQuery()).not.toThrow();
    expect(colorSchemeQuery()).toBeNull();
    expect(systemPrefersDark()).toBe(false);
  });

  it("colorSchemeQuery returns null when matchMedia is missing entirely", () => {
    // @ts-expect-error simulate an API-less WebView
    window.matchMedia = undefined;
    expect(colorSchemeQuery()).toBeNull();
    expect(systemPrefersDark()).toBe(false);
  });

  it("applyColorSchemeToDocument does not throw (and stays light) when matchMedia throws", () => {
    window.matchMedia = () => {
      throw new Error("boom");
    };
    expect(() => applyColorSchemeToDocument("system")).not.toThrow();
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("explicit dark still applies without consulting matchMedia", () => {
    window.matchMedia = () => {
      throw new Error("must not be called for explicit pref");
    };
    expect(() => applyColorSchemeToDocument("dark")).not.toThrow();
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("subscribeColorScheme (useSyncExternalStore subscribe) never throws when matchMedia throws", () => {
    window.matchMedia = () => {
      throw new Error("boom");
    };
    let unsubscribe: (() => void) | undefined;
    expect(() => {
      unsubscribe = subscribeColorScheme(() => {});
    }).not.toThrow();
    expect(() => unsubscribe?.()).not.toThrow();
  });

  it("subscribeColorScheme still wires the media listener when matchMedia works", () => {
    const add = vi.fn();
    const remove = vi.fn();
    window.matchMedia = () =>
      ({
        matches: true,
        addEventListener: add,
        removeEventListener: remove,
      }) as unknown as MediaQueryList;
    expect(systemPrefersDark()).toBe(true);
    const unsub = subscribeColorScheme(() => {});
    expect(add).toHaveBeenCalledWith("change", expect.any(Function));
    unsub();
    expect(remove).toHaveBeenCalledWith("change", expect.any(Function));
  });
});
