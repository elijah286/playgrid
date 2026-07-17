import { afterEach, describe, expect, it, vi } from "vitest";

const set = vi.fn(async () => {});
const clear = vi.fn(async () => {});
const checkPermissions = vi.fn(async () => ({ display: "granted" }));
const requestPermissions = vi.fn(async () => ({ display: "granted" }));

vi.mock("@capawesome/capacitor-badge", () => ({
  Badge: { set, clear, checkPermissions, requestPermissions },
}));

import { setAppBadge, clearAppBadge } from "./appBadge";

function setNative(isNative: boolean) {
  (globalThis as unknown as { window: unknown }).window = {
    Capacitor: { isNativePlatform: () => isNative },
  };
}

afterEach(() => {
  vi.clearAllMocks();
  checkPermissions.mockResolvedValue({ display: "granted" });
  delete (globalThis as unknown as { window?: unknown }).window;
});

describe("setAppBadge", () => {
  it("no-ops (never touches the plugin) when not in the native app", async () => {
    setNative(false);
    await expect(setAppBadge(4)).resolves.toBe(false);
    expect(set).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
  });

  it("sets the absolute count on native", async () => {
    setNative(true);
    await expect(setAppBadge(3)).resolves.toBe(true);
    expect(set).toHaveBeenCalledWith({ count: 3 });
    expect(clear).not.toHaveBeenCalled();
  });

  it("clears the icon when the count is 0", async () => {
    setNative(true);
    await expect(setAppBadge(0)).resolves.toBe(true);
    expect(clear).toHaveBeenCalledTimes(1);
    expect(set).not.toHaveBeenCalled();
  });

  it("clamps negatives to a clear and truncates fractions", async () => {
    setNative(true);
    await setAppBadge(-5);
    expect(clear).toHaveBeenCalledTimes(1);
    await setAppBadge(2.9);
    expect(set).toHaveBeenCalledWith({ count: 2 });
  });

  it("requests badge permission if not yet granted, then sets", async () => {
    setNative(true);
    checkPermissions.mockResolvedValueOnce({ display: "prompt" });
    await setAppBadge(1);
    expect(requestPermissions).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith({ count: 1 });
  });

  it("does not set when badge permission is denied", async () => {
    setNative(true);
    checkPermissions.mockResolvedValueOnce({ display: "denied" });
    requestPermissions.mockResolvedValueOnce({ display: "denied" });
    await expect(setAppBadge(2)).resolves.toBe(false);
    expect(set).not.toHaveBeenCalled();
  });

  it("clearAppBadge clears the icon", async () => {
    setNative(true);
    await expect(clearAppBadge()).resolves.toBe(true);
    expect(clear).toHaveBeenCalledTimes(1);
  });

  // The stuck-badge case (iOS <= 1.0.1). The JS package is in the web bundle —
  // the app loads the live site — so the dynamic import RESOLVES; it's the
  // native bridge that rejects, because the plugin isn't compiled into that
  // binary. Returning false here is what tells NativeBadgeSync the icon is out
  // of its hands and a server-side reconcile is the only way to clear it.
  // If this ever silently returned true, the badge would stay stuck forever.
  it("returns false when the native plugin is missing from the build", async () => {
    setNative(true);
    clear.mockRejectedValueOnce(new Error('Badge does not have an implementation of "clear".'));
    await expect(setAppBadge(0)).resolves.toBe(false);

    set.mockRejectedValueOnce(new Error('Badge does not have an implementation of "set".'));
    await expect(setAppBadge(5)).resolves.toBe(false);
  });
});
