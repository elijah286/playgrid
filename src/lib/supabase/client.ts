import { createBrowserClient } from "@supabase/ssr";
import { parse, serialize } from "cookie";
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
  if (!domain) {
    // Localhost / *.run.app / Capacitor: leave default behavior alone.
    return createBrowserClient(url, key);
  }
  return createBrowserClient(url, key, {
    cookieOptions: { domain },
    cookies: {
      getAll() {
        if (typeof document === "undefined") return [];
        const parsed = parse(document.cookie);
        return Object.entries(parsed)
          .filter((entry): entry is [string, string] => typeof entry[1] === "string")
          .map(([name, value]) => ({ name, value }));
      },
      setAll(cookiesToSet) {
        if (typeof document === "undefined") return;
        for (const { name, value, options } of cookiesToSet) {
          // Expire any pre-existing host-only cookie of the same name
          // before writing the new domain-wide one. The 2026-05-22
          // cookieDomain rollout left users who had logged in before the
          // change with stale host-only `sb-*` cookies; the browser keeps
          // sending them alongside the new domain-wide cookies, and the
          // server-side cookie parser lands on the stale entry — causing
          // "PKCE code verifier not found in storage" on the OAuth
          // callback. Sending an extra Set-Cookie with no `Domain`
          // attribute and `Max-Age=0` evicts the host-only variant.
          // No-op for users who never had one.
          const hostOnlyOptions: Record<string, unknown> = { ...(options ?? {}) };
          delete hostOnlyOptions.domain;
          document.cookie = serialize(name, "", { ...hostOnlyOptions, maxAge: 0 });
          document.cookie = serialize(name, value, options);
        }
      },
    },
  });
}
