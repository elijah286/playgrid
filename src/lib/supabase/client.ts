import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookieDomainForHost } from "@/lib/supabase/cookie-domain";

export function createClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
  // Mirror the server-side cookie domain override so token-refresh writes
  // from the browser land on `.xogridmaker.com` too. Without this, the
  // browser client would silently re-issue cookies as host-only and split
  // the session apex-vs-www. See cookieDomainForHost for context.
  const domain =
    typeof window !== "undefined"
      ? cookieDomainForHost(window.location.hostname)
      : undefined;
  return createBrowserClient(
    url,
    key,
    domain ? { cookieOptions: { domain } } : undefined,
  );
}
