import { afterEach, describe, expect, it, vi } from "vitest";
import {
  __resetReloadGuardsForTest,
  isReloadBlocked,
  registerReloadGuard,
  triggerAppReload,
} from "./reloadGuard";

afterEach(() => {
  __resetReloadGuardsForTest();
  document.documentElement.className = "";
});

describe("isReloadBlocked", () => {
  it("is false with no guards registered", () => {
    expect(isReloadBlocked()).toBe(false);
  });

  it("is true while a registered guard returns true", () => {
    const unregister = registerReloadGuard(() => true);
    expect(isReloadBlocked()).toBe(true);
    unregister();
    expect(isReloadBlocked()).toBe(false);
  });

  it("reflects the guard's live value", () => {
    let editing = false;
    registerReloadGuard(() => editing);
    expect(isReloadBlocked()).toBe(false);
    editing = true;
    expect(isReloadBlocked()).toBe(true);
  });

  it("is blocked when any one of several guards blocks", () => {
    registerReloadGuard(() => false);
    registerReloadGuard(() => true);
    expect(isReloadBlocked()).toBe(true);
  });

  it("ignores a throwing guard and lets the others decide", () => {
    registerReloadGuard(() => {
      throw new Error("boom");
    });
    expect(isReloadBlocked()).toBe(false);
    registerReloadGuard(() => true);
    expect(isReloadBlocked()).toBe(true);
  });

  it("is blocked when the fullscreen Cal thread lock is up", () => {
    document.documentElement.classList.add("messages-mobile-lock");
    expect(isReloadBlocked()).toBe(true);
  });
});

describe("triggerAppReload", () => {
  it("reloads when nothing blocks", () => {
    const reload = vi.fn();
    const original = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...original, reload },
    });
    try {
      triggerAppReload();
      expect(reload).toHaveBeenCalledTimes(1);
    } finally {
      Object.defineProperty(window, "location", {
        configurable: true,
        value: original,
      });
    }
  });

  it("does not reload while a guard blocks", () => {
    const reload = vi.fn();
    const original = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...original, reload },
    });
    registerReloadGuard(() => true);
    try {
      triggerAppReload();
      expect(reload).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(window, "location", {
        configurable: true,
        value: original,
      });
    }
  });
});
