import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { syncNativeSessionToServer } from "./serverSession";

const SESSION = {
  access_token: "access-123",
  refresh_token: "refresh-456",
};

describe("syncNativeSessionToServer", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("POSTs the tokens to the native-session route", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
    });

    await syncNativeSessionToServer(SESSION);

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(url).toBe("/auth/native-session");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      access_token: "access-123",
      refresh_token: "refresh-456",
    });
  });

  it("throws on a non-ok response so the caller surfaces a sign-in error", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 401,
    });

    await expect(syncNativeSessionToServer(SESSION)).rejects.toThrow(/401/);
  });

  it("no-ops (no fetch) when tokens are missing", async () => {
    await syncNativeSessionToServer(null);
    await syncNativeSessionToServer(undefined);
    await syncNativeSessionToServer({
      access_token: "",
      refresh_token: "",
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});
