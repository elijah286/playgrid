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
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, {
              ...options,
              ...(cookieDomain ? { domain: cookieDomain } : {}),
            }),
          );
        } catch {
          /* Server Component — ignore */
        }
      },
    },
  });
}
