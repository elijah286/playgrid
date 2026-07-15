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
 * The store trusts a same-origin probe over the (WKWebView-unreliable)
 * navigator.onLine flag — AND debounces it: a single failed probe (e.g. one
 * timeout under transient device congestion) must NOT flip the whole app to
 * offline. That false-offline is what stranded users during the precache
 * storm. Recovery is still immediate on the first success.
 */

const fetchMock = vi.fn();
const fail = () => fetchMock.mockRejectedValue(new TypeError("Load failed"));
const ok = () => fetchMock.mockResolvedValue({ ok: true, status: 200 });

beforeEach(() => {
  __resetConnectivityForTests();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true); // the lying flag
});

afterEach(() => {
  __resetConnectivityForTests();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("connectivity debounce (native shell)", () => {
  beforeEach(() => vi.mocked(isNativeApp).mockReturnValue(true));

  it("does NOT flip offline on a SINGLE failed probe", async () => {
    fail();
    subscribeConnectivity(() => {});
    await probeConnectivity();
    // One blip is not enough — stay online pending confirmation.
    expect(getConnectivitySnapshot()).toBe(true);
  });

  it("flips offline after TWO consecutive failed probes", async () => {
    fail();
    subscribeConnectivity(() => {});
    await probeConnectivity();
    await probeConnectivity();
    expect(getConnectivitySnapshot()).toBe(false);
  });

  it("a success between failures resets the streak (stays online)", async () => {
    ok();
    subscribeConnectivity(() => {});
    await probeConnectivity(); // settle the initial subscribe probe (ok)
    fail();
    await probeConnectivity(); // 1st fail
    ok();
    await probeConnectivity(); // success resets the streak
    fail();
    await probeConnectivity(); // 1st fail again — still just one
    expect(getConnectivitySnapshot()).toBe(true);
  });

  it("auto-confirms via the scheduled re-probe (no manual second call)", async () => {
    vi.useFakeTimers();
    fail();
    subscribeConnectivity(() => {});
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    // First failed probe scheduled a confirmation re-probe; still online.
    expect(getConnectivitySnapshot()).toBe(true);
    await vi.advanceTimersByTimeAsync(1300); // fire the confirm re-probe
    expect(getConnectivitySnapshot()).toBe(false);
  });

  it("recovers to online IMMEDIATELY on the first successful probe", async () => {
    fail();
    subscribeConnectivity(() => {});
    await probeConnectivity();
    await probeConnectivity();
    expect(getConnectivitySnapshot()).toBe(false); // confirmed offline
    ok();
    await probeConnectivity();
    expect(getConnectivitySnapshot()).toBe(true); // one success is enough
  });

  it("treats ANY http response as online — even an error status", async () => {
    ok();
    subscribeConnectivity(() => {});
    await probeConnectivity(); // settle the initial subscribe probe (ok)
    fail();
    await probeConnectivity();
    await probeConnectivity();
    expect(getConnectivitySnapshot()).toBe(false);
    // 401/500 still proves the network path works → online on first success.
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    await probeConnectivity();
    expect(getConnectivitySnapshot()).toBe(true);
  });

  it("trusts the OS offline event immediately (bypasses the debounce)", async () => {
    ok();
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
  beforeEach(() => vi.mocked(isNativeApp).mockReturnValue(false));

  it("does NOT probe on subscribe — web browsers report onLine correctly", () => {
    subscribeConnectivity(() => {});
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getConnectivitySnapshot()).toBe(true);
  });

  it("trusts the online/offline events without probing on web", () => {
    subscribeConnectivity(() => {});
    window.dispatchEvent(new Event("offline"));
    expect(getConnectivitySnapshot()).toBe(false);
    window.dispatchEvent(new Event("online"));
    expect(getConnectivitySnapshot()).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
