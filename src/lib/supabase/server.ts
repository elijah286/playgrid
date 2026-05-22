import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { cookieDomainForHost } from "@/lib/supabase/cookie-domain";

export async function createClient() {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  // Scope Supabase auth cookies to `.xogridmaker.com` (apex) so the apex
  // and www subdomain share a session. Mirrors the middleware override.
  // See cookieDomainForHost for the host-conditional logic that keeps
  // localhost / *.run.app / Capacitor cookies host-only.
  const cookieDomain = cookieDomainForHost(
    headerStore.get("x-forwarded-host") ?? headerStore.get("host"),
  );

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            // When scoping to .xogridmaker.com, also evict any pre-existing
            // host-only cookie of the same name so it can't shadow the
            // new domain-wide one on the next request. See client.ts
            // for the matching browser-side eviction and the 2026-05-22
            // rollout history.
            if (cookieDomain) {
              cookieStore.set(name, "", {
                ...options,
                domain: undefined,
                maxAge: 0,
              });
            }
            cookieStore.set(name, value, {
              ...options,
              ...(cookieDomain ? { domain: cookieDomain } : {}),
            });
          });
        } catch {
          /* Server Component — ignore */
        }
      },
    },
  });
}
