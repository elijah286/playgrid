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

  it("ALSO emits a raw host-only expiry for the auth cookie (legacy pre-domain cookie)", async () => {
    const res = await updateSession(makeRequest("www.xogridmaker.com"));

    const setCookies = res.headers.getSetCookie();
    const authWrites = setCookies.filter((c) =>
      c.startsWith(`${SUPABASE_AUTH_COOKIE}=`),
    );
    // Domain-scoped expiry kills the post-2026-05-22 cookie...
    expect(
      authWrites.some((c) => /Domain=\.xogridmaker\.com/i.test(c)),
    ).toBe(true);
    // ...and a raw host-only expiry (no Domain) kills any legacy cookie a
    // pre-domain browser still carries. Without it, sign-out doesn't stick.
    expect(
      authWrites.some(
        (c) => /Max-Age=0/i.test(c) && !/Domain=/i.test(c),
      ),
    ).toBe(true);
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
    const deviceCookie = setCookies.find(
      (c) => c.startsWith("xog_device_id=") && !/Max-Age=0/i.test(c),
    );
    expect(deviceCookie).toBeDefined();
    // The fix: without a domain, the apex→www canonical redirect mints a
    // second device id and trips the 1-desktop cap → false eviction.
    expect(deviceCookie).toMatch(/Domain=\.xogridmaker\.com/i);
  });

  it("re-scopes an EXISTING host-only device id and evicts the legacy cookie (the Chrome-loop bug)", async () => {
    // The Timothy case: a browser that signed in before the 2026-05-29 fix
    // still carries a HOST-ONLY xog_device_id. The original fix early-returned
    // on any existing id, so it never upgraded these browsers — the host-only
    // cookie kept coexisting with the domain-scoped one minted on the apex→www
    // redirect, the id flapped per-request, and the 1-desktop cap looped the
    // user through "signed in on another device" → "Welcome back" forever.
    vi.mocked(touchUserSession).mockResolvedValue({ kind: "ok" });
    const req = makeRequest("www.xogridmaker.com");
    req.cookies.set("xog_device_id", "legacy-host-only-device-id-1234");
    const res = await updateSession(req);

    const setCookies = res.headers.getSetCookie();
    const deviceWrites = setCookies.filter((c) =>
      c.startsWith("xog_device_id="),
    );

    // 1) The canonical id is (re)written domain-scoped, preserving the value.
    const domainWrite = deviceWrites.find((c) =>
      /Domain=\.xogridmaker\.com/i.test(c),
    );
    expect(domainWrite).toBeDefined();
    expect(domainWrite).toContain("legacy-host-only-device-id-1234");
    expect(domainWrite).not.toMatch(/Max-Age=0/i);

    // 2) The legacy host-only variant is expired via a RAW header (no Domain),
    //    which is the only way it actually reaches the browser — two
    //    cookies.set() calls for the same name collapse to one.
    const hostOnlyEviction = deviceWrites.find(
      (c) => /Max-Age=0/i.test(c) && !/Domain=/i.test(c),
    );
    expect(hostOnlyEviction).toBeDefined();
  });

  it("passes an authSessionId through to touchUserSession (re-auth reclaim wiring)", async () => {
    // The reclaim discriminator lives in touchUserSession; middleware's job is
    // to feed it the request's current session id. We can't mint a valid token
    // here, so it resolves to null — but the key must be present, or the
    // latest-sign-in-wins reclaim can never fire in prod.
    vi.mocked(touchUserSession).mockResolvedValue({ kind: "ok" });
    await updateSession(makeRequest("www.xogridmaker.com"));

    expect(touchUserSession).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        authSessionId: null,
      }),
    );
  });

  it("does NOT emit a host-only eviction on localhost / native shell", async () => {
    vi.mocked(touchUserSession).mockResolvedValue({ kind: "ok" });
    const req = makeRequest("localhost:3000");
    req.cookies.set("xog_device_id", "legacy-host-only-device-id-1234");
    const res = await updateSession(req);

    const setCookies = res.headers.getSetCookie();
    const deviceWrites = setCookies.filter((c) =>
      c.startsWith("xog_device_id="),
    );
    // Off the xogridmaker domain there is no domain/host-only split to
    // reconcile, so we must not gratuitously expire the device id.
    const eviction = deviceWrites.find((c) => /Max-Age=0/i.test(c));
    expect(eviction).toBeUndefined();
  });
});
