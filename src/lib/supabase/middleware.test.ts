import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// The eviction path depends on getUser returning a user and the
// session-touch reporting "revoked". Mock both seams; keep the real
// session constants so middleware's cookie names stay correct.
vi.mock("@/lib/supabase/get-user-with-timeout", () => ({
  getUserWithTimeout: vi.fn(),
}));
vi.mock("@/lib/auth/sessions", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/sessions")>(
    "@/lib/auth/sessions",
  );
  return { ...actual, touchUserSession: vi.fn() };
});

import { updateSession } from "@/lib/supabase/middleware";
import { getUserWithTimeout } from "@/lib/supabase/get-user-with-timeout";
import { touchUserSession } from "@/lib/auth/sessions";

const SUPABASE_AUTH_COOKIE = "sb-abcdef-auth-token";

function makeRequest(host: string): NextRequest {
  const req = new NextRequest(`https://${host}/home`, {
    headers: { host, "user-agent": "Mozilla/5.0 (Macintosh)" },
  });
  // A domain-scoped Supabase auth cookie, as written post-2026-05-22.
  req.cookies.set(SUPABASE_AUTH_COOKIE, "jwt-value");
  // No touch-throttle cookie → middleware performs the session touch.
  return req;
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  vi.mocked(getUserWithTimeout).mockResolvedValue({
    kind: "ok",
    user: { id: "user-1" } as never,
  });
  vi.mocked(touchUserSession).mockResolvedValue({
    kind: "revoked",
    reason: "cap_kicked",
  });
});

describe("updateSession eviction (signed_out_elsewhere)", () => {
  it("expires the domain-scoped Supabase auth cookie on an xogridmaker host", async () => {
    const res = await updateSession(makeRequest("www.xogridmaker.com"));

    expect(res.headers.get("location")).toContain(
      "/login?reason=signed_out_elsewhere",
    );

    const setCookies = res.headers.getSetCookie();
    const authExpiry = setCookies.find((c) =>
      c.startsWith(`${SUPABASE_AUTH_COOKIE}=`),
    );
    // Regression: a host-only delete leaves the `.xogridmaker.com`-scoped
    // cookie alive, so the /login page still renders as authed. The expiry
    // MUST carry the domain so the sign-out actually sticks.
    expect(authExpiry).toBeDefined();
    expect(authExpiry).toMatch(/Domain=\.xogridmaker\.com/i);
    expect(authExpiry).toMatch(/Max-Age=0/i);
  });

  it("expires host-only on a non-xogridmaker host (localhost / native shell)", async () => {
    const res = await updateSession(makeRequest("localhost:3000"));

    const setCookies = res.headers.getSetCookie();
    const authExpiry = setCookies.find((c) =>
      c.startsWith(`${SUPABASE_AUTH_COOKIE}=`),
    );
    expect(authExpiry).toBeDefined();
    expect(authExpiry).not.toMatch(/Domain=/i);
  });
});

describe("updateSession device-id cookie", () => {
  it("scopes a freshly-minted device id to .xogridmaker.com so apex and www share it", async () => {
    // Not revoked this time — just a normal authed navigation that mints
    // the device id for the first time.
    vi.mocked(touchUserSession).mockResolvedValue({ kind: "ok" });
    const res = await updateSession(makeRequest("xogridmaker.com"));

    const setCookies = res.headers.getSetCookie();
    const deviceCookie = setCookies.find((c) =>
      c.startsWith("xog_device_id="),
    );
    expect(deviceCookie).toBeDefined();
    // The fix: without a domain, the apex→www canonical redirect mints a
    // second device id and trips the 1-desktop cap → false eviction.
    expect(deviceCookie).toMatch(/Domain=\.xogridmaker\.com/i);
  });
});
