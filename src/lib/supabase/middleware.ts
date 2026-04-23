import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

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
  // SEO + PWA metadata routes: must be fetchable by crawlers (Googlebot,
  // Bingbot) and the browser's PWA install flow without a session.
  "/robots.txt",
  "/sitemap.xml",
  "/manifest.webmanifest",
  "/opengraph-image",
]);

const PUBLIC_PREFIXES = [
  "/invite/", // invite landing page (pre-login preview)
  "/api/contact",
  "/api/health",
  "/api/stripe/webhook", // Stripe → server. Must accept POSTs without a session.
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

  return supabaseResponse;
}
