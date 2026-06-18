import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  DEVICE_ID_COOKIE,
  SESSION_TOUCH_COOKIE,
  SESSION_TOUCH_INTERVAL_MS,
  touchUserSession,
} from "@/lib/auth/sessions";
import { getUserWithTimeout } from "@/lib/supabase/get-user-with-timeout";
import { cookieDomainForHost } from "@/lib/supabase/cookie-domain";

/**
 * Paths accessible without authentication. Everything else is redirected
 * to /login when the caller has no Supabase session.
 *
 * New routes are protected by default — add here if they should be public.
 */
const PUBLIC_EXACT = new Set<string>([
  "/",
  "/login",
  "/signed-out",
  "/privacy",
  "/terms",
  "/about",
  "/contact",
  "/pricing",
  "/examples",
  // Marketing surfaces — must be reachable by anonymous visitors and
  // crawlers. These are pre-auth landing pages; gating them on a session
  // would silently bounce every Google referral to /login.
  "/coach-cal",
  "/flag-football-playbook",
  "/faq",
  // SEO + PWA metadata routes: must be fetchable by crawlers (Googlebot,
  // Bingbot) and the browser's PWA install flow without a session.
  "/robots.txt",
  "/sitemap.xml",
  "/manifest.webmanifest",
  "/opengraph-image",
]);

const PUBLIC_PREFIXES = [
  // Learning Center — Football Library + product tutorials. Must be
  // crawlable by Googlebot/Bingbot and reachable by anonymous visitors
  // landing from search. Pages enforce their own per-feature gates.
  "/learn/",
  "/invite/", // invite landing page (pre-login preview)
  "/auth/", // OAuth/PKCE callback — runs before a session exists
  "/api/contact",
  "/api/health",
  "/api/push/refresh", // Dormant-device token refresh. Auth via per-device secret, not a session. (Also covers /api/push/refresh-stale.)
  "/api/push/admin-notices", // Cron: push unpushed admin notices. Auth via bearer CRON_SECRET.
  "/api/stripe/webhook", // Stripe → server. Must accept POSTs without a session.
  "/api/iap/apple/notifications", // Apple App Store Server Notifications → server. POSTs without a session; Apple signs the payload.
  "/api/calendar/", // Cron + ICS feed: auth via bearer secret / signed token.
  "/api/digest/", // Cron: auth via bearer CRON_SECRET.
  "/api/reengagement/", // Cron: auth via bearer CRON_SECRET.
  "/api/email/unsubscribe", // RFC 8058 one-click: mail clients POST without a session. Verifies HMAC token.
  "/api/trash/purge", // Cron: auth via bearer CRON_SECRET.
  "/api/auth/purge-unconfirmed", // Cron: auth via bearer CRON_SECRET.
  "/monitoring", // Sentry tunnel
  // Example playbook viewing — pages enforce their own anon/member check
  // against the `is_public_example` flag, so anon visitors don't bounce.
  "/playbooks/",
  "/plays/",
  "/formations/new",
];

// Next.js file-based metadata routes are emitted at EVERY route segment
// (e.g. /opengraph-image, /about/opengraph-image, /pricing/opengraph-image,
// /apple-icon). Link-preview crawlers (iMessage, Slack, Facebook) and the
// browser's icon fetch hit these without a session — gating them on auth
// redirects the crawler to /login, which it renders as HTML instead of the
// image. The result is a broken preview (or, for iMessage, a fallback page
// screenshot). Match by suffix so nested segments are covered too.
const METADATA_IMAGE_SUFFIXES = [
  "/opengraph-image",
  "/twitter-image",
  "/icon",
  "/apple-icon",
];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  if (METADATA_IMAGE_SUFFIXES.some((s) => pathname.endsWith(s))) return true;
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p));
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return supabaseResponse;
  }

  // Scope Supabase auth cookies to `.xogridmaker.com` (apex) so the apex
  // and www subdomain share a session. Without this, a Stripe success_url
  // redirect that lands on a different host than the one the user logged
  // in on silently logs them out. See cookieDomainForHost for why this
  // is conditional on the request host.
  const cookieDomain = cookieDomainForHost(
    request.headers.get("x-forwarded-host") ?? request.headers.get("host"),
  );

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        supabaseResponse = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) => {
          // When scoping to .xogridmaker.com, also evict any pre-existing
          // host-only cookie of the same name so it can't shadow the new
          // domain-wide one on the next request. See client.ts for the
          // matching browser-side eviction and the 2026-05-22 rollout
          // history.
          if (cookieDomain) {
            supabaseResponse.cookies.set(name, "", {
              ...options,
              domain: undefined,
              maxAge: 0,
            });
          }
          supabaseResponse.cookies.set(name, value, {
            ...options,
            ...(cookieDomain ? { domain: cookieDomain } : {}),
          });
        });
      },
    },
  });

  let user: { id: string } | null = null;
  let authTimedOut = false;
  try {
    const result = await getUserWithTimeout(supabase);
    if (result.kind === "timeout") {
      authTimedOut = true;
    } else {
      user = result.user;
    }
  } catch {
    /* Bad Supabase URL/key or network; fall through and let public paths work */
  }

  const { pathname, search } = request.nextUrl;
  // On timeout, let the request through without enforcing the auth gate.
  // The page will render in whatever logged-out state it can; the next
  // request from the now-loaded page retries the refresh and recovers.
  // Better to flash a logged-out shell than stall the tab indefinitely.
  if (!authTimedOut && !user && !isPublicPath(pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(loginUrl);
  }

  // Concurrent-session tracking. Only meaningful for authenticated users on
  // navigations (not background asset fetches). The touch is throttled by a
  // cookie stamp so middleware stays cheap on hot paths.
  if (user && shouldTouchSession(request, pathname)) {
    const authSessionId = await currentAuthSessionId(supabase);
    const result = await maybeTouchSession({
      request,
      response: supabaseResponse,
      userId: user.id,
      authSessionId,
    });
    if (result === "revoked") {
      return signOutAndRedirect(request);
    }
    // maybeTouchSession wrote the canonical domain-scoped device id via
    // ensureDeviceId. Evict the legacy host-only twin as the response's
    // FINAL mutation — it has to come after every cookies.set() call (the
    // touch stamp included), because each .set() re-serializes the
    // Set-Cookie headers and would otherwise clobber this raw eviction.
    if (cookieDomain) {
      appendHostOnlyDeletion(supabaseResponse, DEVICE_ID_COOKIE);
    }
  }

  return supabaseResponse;
}

function shouldTouchSession(request: NextRequest, pathname: string): boolean {
  // Only HTML navigations and server actions — skip static assets and the
  // Stripe webhook style API routes that are POST-only.
  if (pathname.startsWith("/_next/")) return false;
  if (pathname.startsWith("/api/stripe/webhook")) return false;
  if (pathname.startsWith("/api/iap/apple/")) return false;
  if (pathname.startsWith("/monitoring")) return false;
  const last = request.cookies.get(SESSION_TOUCH_COOKIE)?.value;
  if (!last) return true;
  const ms = Number(last);
  if (!Number.isFinite(ms)) return true;
  return Date.now() - ms >= SESSION_TOUCH_INTERVAL_MS;
}

/** Upper bound on how long middleware will wait for the session-touch DB
 *  round-trip. The touch is best-effort bookkeeping — when an iOS tab
 *  resumes after long idle the underlying TCP connection is often stale
 *  and the await can hang for tens of seconds rather than rejecting,
 *  during which the tab paints white. Treat a timeout as ok and skip the
 *  cookie stamp so the next request retries. */
const SESSION_TOUCH_TIMEOUT_MS = 2000;

async function maybeTouchSession(input: {
  request: NextRequest;
  response: NextResponse;
  userId: string;
  authSessionId: string | null;
}): Promise<"ok" | "revoked"> {
  const deviceId = ensureDeviceId(input.request, input.response);
  const ip = clientIp(input.request);
  const userAgent = input.request.headers.get("user-agent");
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    const result = await Promise.race<TouchOutcome>([
      touchUserSession({
        userId: input.userId,
        deviceId,
        ip,
        userAgent,
        authSessionId: input.authSessionId,
      }).then((r) => ({ kind: "result" as const, result: r })),
      new Promise<TouchOutcome>((resolve) => {
        timer = setTimeout(
          () => resolve({ kind: "timeout" }),
          SESSION_TOUCH_TIMEOUT_MS,
        );
      }),
    ]);
    if (result.kind === "timeout") {
      // Skip the cookie stamp so the next request retries instead of
      // throttling itself out for the next minute.
      return "ok";
    }
    if (result.result.kind === "revoked") return "revoked";
  } catch {
    // Best-effort: never block navigation if session bookkeeping fails.
    return "ok";
  } finally {
    if (timer) clearTimeout(timer);
  }
  input.response.cookies.set(SESSION_TOUCH_COOKIE, String(Date.now()), {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return "ok";
}

type TouchOutcome =
  | { kind: "result"; result: Awaited<ReturnType<typeof touchUserSession>> }
  | { kind: "timeout" };

/**
 * Read the Supabase `session_id` claim from the request's current access
 * token. It's stable across token refreshes within a single sign-in and
 * fresh on every new sign-in, so touchUserSession uses it to tell a genuine
 * re-auth (reclaim the device's slot) apart from a kicked session that's
 * still navigating (stay signed out). Best-effort: returns null if the
 * session or token can't be read — getUser() already validated the caller,
 * so this only decodes the (already-trusted) token to pull one claim.
 */
async function currentAuthSessionId(
  supabase: ReturnType<typeof createServerClient>,
): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return null;
    const claims = decodeJwtPayload(token);
    const sid = claims?.["session_id"];
    return typeof sid === "string" && sid.length > 0 ? sid : null;
  } catch {
    return null;
  }
}

/** Decode a JWT's payload segment without verifying its signature (the token
 *  was already validated by getUser). Edge-runtime safe — uses atob +
 *  TextDecoder rather than Buffer. */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4 ? "=".repeat(4 - (b64.length % 4)) : "";
    const bin = atob(b64 + pad);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// Emit a HOST-ONLY cookie deletion as a raw Set-Cookie header.
//
// Why raw: NextResponse.cookies is keyed by name, so two `.set(name, ...)`
// calls for the same cookie collapse into a single Set-Cookie (last wins).
// That means you cannot write a domain-scoped cookie AND delete the
// host-only variant of the same name through the cookies API — the delete
// is silently dropped. Appending the deletion as a raw header bypasses the
// map (the domain-scoped cookie is keyed separately by the browser, so the
// two coexist and only the host-only one is expired here).
//
// IMPORTANT: NextResponse.cookies.set() RE-SERIALIZES every Set-Cookie
// header from its internal map on each call, which clobbers any raw header
// appended earlier. So this MUST be called as the final mutation on the
// response — after every cookies.set() — or the eviction silently vanishes.
function appendHostOnlyDeletion(response: NextResponse, name: string): void {
  response.headers.append(
    "set-cookie",
    `${name}=; Path=/; Max-Age=0; SameSite=Lax`,
  );
}

function ensureDeviceId(request: NextRequest, response: NextResponse): string {
  const existing = request.cookies.get(DEVICE_ID_COOKIE)?.value;
  const value =
    existing && existing.length >= 16 ? existing : crypto.randomUUID();
  const cookieDomain = cookieDomainForHost(
    request.headers.get("x-forwarded-host") ?? request.headers.get("host"),
  );
  // Canonical: a single `.xogridmaker.com`-scoped device id so the apex and
  // the www host share ONE id (the auth cookies are domain-scoped too — see
  // server.ts). Re-write it on EVERY pass, not just when minting fresh: a
  // browser that still carries the pre-2026-05-29 host-only cookie otherwise
  // never gets upgraded, so the apex→www canonical redirect mints a second
  // (domain-scoped) id alongside it. The browser then sends BOTH, middleware
  // reads whichever wins that request, and the device id flaps per-request —
  // tripping the 1-desktop session cap in a loop ("signed in on another
  // device" → "Welcome back" forever). The legacy host-only twin is evicted
  // separately, as the response's final mutation — see appendHostOnlyDeletion
  // and the eviction at the tail of updateSession.
  response.cookies.set(DEVICE_ID_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365 * 2,
    ...(cookieDomain ? { domain: cookieDomain } : {}),
  });
  return value;
}

function clientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return request.headers.get("x-real-ip");
}

function signOutAndRedirect(request: NextRequest): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "?reason=signed_out_elsewhere";
  const res = NextResponse.redirect(url);
  // Clear Supabase auth cookies, the throttle stamp, and the device id.
  // Dropping the device id is intentional: when the user signs back in
  // they'll get a fresh row instead of immediately re-hitting this revoked
  // one and looping. The kicked row stays in the audit log either way.
  //
  // The auth cookies are written domain-scoped to `.xogridmaker.com`, so a
  // host-only `delete()` does NOT remove them — the browser kept sending
  // them and the /login page still rendered as authed (avatar + inbox
  // badge) even though we'd just "signed out". Expire both the host-only
  // and the domain-scoped variant so the sign-out actually sticks.
  const cookieDomain = cookieDomainForHost(
    request.headers.get("x-forwarded-host") ?? request.headers.get("host"),
  );
  // Domain-scoped expiry kills the post-2026-05-22 cookie; a raw host-only
  // deletion kills any legacy pre-domain cookie the browser still carries.
  // The two can't both go through res.cookies.set — the map collapses
  // same-name writes — so the host-only one is a raw header. And because
  // res.cookies.set() RE-SERIALIZES all Set-Cookie headers on each call,
  // every domain expiry must be written FIRST, then the raw host-only
  // deletions appended LAST in one batch, or the earlier raw headers get
  // clobbered. Without this, a stale host-only cookie survives sign-out and
  // the /login page still renders as authed.
  const names = [
    ...request.cookies
      .getAll()
      .filter((c) => c.name.startsWith("sb-"))
      .map((c) => c.name),
    SESSION_TOUCH_COOKIE,
    DEVICE_ID_COOKIE,
  ];
  for (const name of names) {
    if (cookieDomain) {
      res.cookies.set(name, "", { path: "/", domain: cookieDomain, maxAge: 0 });
    } else {
      res.cookies.delete(name);
    }
  }
  if (cookieDomain) {
    for (const name of names) appendHostOnlyDeletion(res, name);
  }
  return res;
}
