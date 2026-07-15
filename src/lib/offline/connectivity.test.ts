// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/native/isNativeApp", () => ({
  isNativeApp: vi.fn(),
}));

import {
  __resetConnectivityForTests,
  getConnectivitySnapshot,
  probeConnectivity,
  subscribeConnectivity,
} from "@/lib/offline/connectivity";
import { isNativeApp } from "@/lib/native/isNativeApp";

/**
 * Regression tests for the 2026-07-15 "Something went wrong on playbook
 * tap" bug: WKWebView reports navigator.onLine === true on airplane-mode
 * cold launches, so anything routing on the raw flag sent offline coaches
 * to network-only routes. The store must trust the probe over the flag.
 */

const fetchMock = vi.fn();

beforeEach(() => {
  __resetConnectivityForTests();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  // The lying flag: browser claims online.
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
});

afterEach(() => {
  __resetConnectivityForTests();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("connectivity store (native shell)", () => {
  beforeEach(() => {
    vi.mocked(isNativeApp).mockReturnValue(true);
  });

  it("flips offline when the probe fails even though navigator.onLine is true", async () => {
    fetchMock.mockRejectedValue(new TypeError("Load failed"));
    const changes: boolean[] = [];
    subscribeConnectivity(() => changes.push(getConnectivitySnapshot()));

    await probeConnectivity();

    expect(getConnectivitySnapshot()).toBe(false);
    expect(changes).toContain(false);
  });

  it("treats ANY http response as online — even an error status", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Load failed"));
    await probeConnectivity();
    expect(getConnectivitySnapshot()).toBe(false);

    // 401/500 still proves the network path works.
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    await probeConnectivity();
    expect(getConnectivitySnapshot()).toBe(true);
  });

  it("probes on subscribe in the native shell (initial flag is not trusted)", async () => {
    fetchMock.mockRejectedValue(new TypeError("Load failed"));
    subscribeConnectivity(() => {});
    // allow the fire-and-forget initial probe to settle
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await vi.waitFor(() => expect(getConnectivitySnapshot()).toBe(false));
  });

  it("verifies the online event with a probe instead of trusting it", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
    subscribeConnectivity(() => {});
    // settle the initial subscribe-time probe so the event probe below is a
    // fresh fetch, not the shared in-flight one
    await probeConnectivity();
    fetchMock.mockClear();
    fetchMock.mockRejectedValue(new TypeError("still offline"));

    window.dispatchEvent(new Event("online"));

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await vi.waitFor(() => expect(getConnectivitySnapshot()).toBe(false));
  });

  it("trusts the offline event immediately", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
    subscribeConnectivity(() => {});
    window.dispatchEvent(new Event("offline"));
    expect(getConnectivitySnapshot()).toBe(false);
  });

  it("shares a single in-flight probe across concurrent callers", async () => {
    let resolveFetch: (v: unknown) => void = () => {};
    fetchMock.mockImplementation(
      () => new Promise((resolve) => (resolveFetch = resolve)),
    );
    const a = probeConnectivity();
    const b = probeConnectivity();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveFetch({ ok: true, status: 200 });
    await Promise.all([a, b]);
    expect(getConnectivitySnapshot()).toBe(true);
  });
});

describe("connectivity store (plain web)", () => {
  beforeEach(() => {
    vi.mocked(isNativeApp).mockReturnValue(false);
  });

  it("does NOT probe on subscribe — web browsers report onLine correctly", () => {
    subscribeConnectivity(() => {});
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getConnectivitySnapshot()).toBe(true);
  });

  it("trusts the online event without probing on web", () => {
    subscribeConnectivity(() => {});
    window.dispatchEvent(new Event("offline"));
    expect(getConnectivitySnapshot()).toBe(false);
    window.dispatchEvent(new Event("online"));
    expect(getConnectivitySnapshot()).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
