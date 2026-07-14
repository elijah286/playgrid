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
    await expect(setAppBadge(4)).resolves.toBeUndefined();
    expect(set).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
  });

  it("sets the absolute count on native", async () => {
    setNative(true);
    await setAppBadge(3);
    expect(set).toHaveBeenCalledWith({ count: 3 });
    expect(clear).not.toHaveBeenCalled();
  });

  it("clears the icon when the count is 0", async () => {
    setNative(true);
    await setAppBadge(0);
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
    await setAppBadge(2);
    expect(set).not.toHaveBeenCalled();
  });

  it("clearAppBadge clears the icon", async () => {
    setNative(true);
    await clearAppBadge();
    expect(clear).toHaveBeenCalledTimes(1);
  });
});
