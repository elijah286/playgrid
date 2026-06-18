import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// CURRENT_BUILD_ID is read from process.env.NEXT_PUBLIC_BUILD_ID at module
// load, so each test imports the module fresh after stubbing the env.
async function loadWithBuildId(buildId: string | undefined) {
  vi.resetModules();
  if (buildId === undefined) {
    vi.stubEnv("NEXT_PUBLIC_BUILD_ID", "");
  } else {
    vi.stubEnv("NEXT_PUBLIC_BUILD_ID", buildId);
  }
  return import("./deployVersion");
}

function mockVersionResponse(body: unknown, { ok = true } = {}) {
  return vi.fn().mockResolvedValue({
    ok,
    json: async () => body,
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("isNewDeployAvailable", () => {
  it("returns true when the live build id differs from the loaded bundle", async () => {
    const { isNewDeployAvailable } = await loadWithBuildId("build-A");
    vi.stubGlobal("fetch", mockVersionResponse({ buildId: "build-B" }));
    await expect(isNewDeployAvailable()).resolves.toBe(true);
  });

  it("returns false when the live build id matches", async () => {
    const { isNewDeployAvailable } = await loadWithBuildId("build-A");
    vi.stubGlobal("fetch", mockVersionResponse({ buildId: "build-A" }));
    await expect(isNewDeployAvailable()).resolves.toBe(false);
  });

  it("returns false without hitting the network when the bundle id is 'dev'", async () => {
    const { isNewDeployAvailable } = await loadWithBuildId("dev");
    const fetchMock = mockVersionResponse({ buildId: "build-B" });
    vi.stubGlobal("fetch", fetchMock);
    await expect(isNewDeployAvailable()).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns false when the live server reports 'dev'", async () => {
    const { isNewDeployAvailable } = await loadWithBuildId("build-A");
    vi.stubGlobal("fetch", mockVersionResponse({ buildId: "dev" }));
    await expect(isNewDeployAvailable()).resolves.toBe(false);
  });

  it("returns false on a non-OK response", async () => {
    const { isNewDeployAvailable } = await loadWithBuildId("build-A");
    vi.stubGlobal(
      "fetch",
      mockVersionResponse({ buildId: "build-B" }, { ok: false }),
    );
    await expect(isNewDeployAvailable()).resolves.toBe(false);
  });

  it("returns false when the payload has no usable build id", async () => {
    const { isNewDeployAvailable } = await loadWithBuildId("build-A");
    vi.stubGlobal("fetch", mockVersionResponse({}));
    await expect(isNewDeployAvailable()).resolves.toBe(false);
  });

  it("returns false when the fetch rejects (offline / timeout)", async () => {
    const { isNewDeployAvailable } = await loadWithBuildId("build-A");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down")),
    );
    await expect(isNewDeployAvailable()).resolves.toBe(false);
  });
});
