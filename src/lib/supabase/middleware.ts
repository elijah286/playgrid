import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  DEVICE_ID_COOKIE,
  SESSION_TOUCH_COOKIE,
  SESSION_TOUCH_INTERVAL_MS,
  touchUserSession,
} from "@/lib/auth/sessions";

/**
 * Paths accessible without authentication. Everything else is redirected
 * to /login when the caller has no Supabase session.
 *
 * New routes are protected by default — add here if they should be public.
 */
const PUBLIC_EXACT = new Set<string>([
  "/",
  "/login",
  "/privacy",
  "/terms",
  "/about",
  "/contact",
  "/pricing",
  "/examples",
  // Marketing surfaces — must be reachable by anonymous visitors and
  // crawlers. These are pre-auth landing pages; gating them on a session
  // would silently bounce every Google referral to /login.
  "/learn-more",
  "/coach-cal",
  "/faq",
  // SEO + PWA metadata routes: must be fetchable by crawlers (Googlebot,
  // Bingbot) and the browser's PWA install flow without a session.
  "/robots.txt",
  "/sitemap.xml",
  "/manifest.webmanifest",
  "/opengraph-image",
]);

const PUBLIC_PREFIXES = [
  "/invite/", // invite landing page (pre-login preview)
  "/auth/", // OAuth/PKCE callback — runs before a session exists
  "/api/contact",
  "/api/health",
  "/api/stripe/webhook", // Stripe → server. Must accept POSTs without a session.
  "/api/calendar/", // Cron + ICS feed: auth via bearer secret / signed token.
  "/monitoring", // Sentry tunnel
  // Example playbook viewing — pages enforce their own anon/member check
  // against the `is_public_example` flag, so anon visitors don't bounce.
  "/playbooks/",
  "/plays/",
  "/formations/new",
];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
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
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  let user: { id: string } | null = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    /* Bad Supabase URL/key or network; fall through and let public paths work */
  }

  const { pathname, search } = request.nextUrl;
  if (!user && !isPublicPath(pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(loginUrl);
  }

  // Concurrent-session tracking. Only meaningful for authenticated users on
  // navigations (not background asset fetches). The touch is throttled by a
  // cookie stamp so middleware stays cheap on hot paths.
  if (user && shouldTouchSession(request, pathname)) {
    const result = await maybeTouchSession({
      request,
      response: supabaseResponse,
      userId: user.id,
    });
    if (result === "revoked") {
      return signOutAndRedirect(request);
    }
  }

  return supabaseResponse;
}

function shouldTouchSession(request: NextRequest, pathname: string): boolean {
  // Only HTML navigations and server actions — skip static assets and the
  // Stripe webhook style API routes that are POST-only.
  if (pathname.startsWith("/_next/")) return false;
  if (pathname.startsWith("/api/stripe/webhook")) return false;
  if (pathname.startsWith("/monitoring")) return false;
  const last = request.cookies.get(SESSION_TOUCH_COOKIE)?.value;
  if (!last) return true;
  const ms = Number(last);
  if (!Number.isFinite(ms)) return true;
  return Date.now() - ms >= SESSION_TOUCH_INTERVAL_MS;
}

async function maybeTouchSession(input: {
  request: NextRequest;
  response: NextResponse;
  userId: string;
}): Promise<"ok" | "revoked"> {
  const deviceId = ensureDeviceId(input.request, input.response);
  const ip = clientIp(input.request);
  const userAgent = input.request.headers.get("user-agent");
  try {
    const result = await touchUserSession({
      userId: input.userId,
      deviceId,
      ip,
      userAgent,
    });
    if (result.kind === "revoked") return "revoked";
  } catch {
    // Best-effort: never block navigation if session bookkeeping fails.
    return "ok";
  }
  input.response.cookies.set(SESSION_TOUCH_COOKIE, String(Date.now()), {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return "ok";
}

function ensureDeviceId(request: NextRequest, response: NextResponse): string {
  const existing = request.cookies.get(DEVICE_ID_COOKIE)?.value;
  if (existing && existing.length >= 16) return existing;
  const fresh = crypto.randomUUID();
  response.cookies.set(DEVICE_ID_COOKIE, fresh, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365 * 2,
  });
  return fresh;
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
  for (const cookie of request.cookies.getAll()) {
    if (cookie.name.startsWith("sb-")) {
      res.cookies.delete(cookie.name);
    }
  }
  res.cookies.delete(SESSION_TOUCH_COOKIE);
  res.cookies.delete(DEVICE_ID_COOKIE);
  return res;
}
