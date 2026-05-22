/**
 * Returns the cookie `domain` attribute Supabase auth cookies should use
 * for the given request host, or `undefined` to leave the cookie host-only.
 *
 * **Why this exists.** A user signed in on `https://www.xogridmaker.com`
 * gets Supabase auth cookies host-scoped to `www.xogridmaker.com`. If they
 * then end up on `https://xogridmaker.com` (or vice versa) — e.g. the
 * Stripe checkout success_url is computed from `x-forwarded-host` and the
 * apex→www redirect lands them on a different host than they started — the
 * browser doesn't send the auth cookies, middleware sees no session, and
 * bounces them to /login. Scoping the cookie to `.xogridmaker.com` lets
 * the apex and the `www`/`staging` subdomains share a single session.
 *
 * We only override the domain when the request is for an
 * `xogridmaker.com` host. Localhost, the *.run.app Cloud Run URL, the
 * Capacitor native shell, and any other host get an `undefined` return so
 * the SSR client's default host-only behavior is preserved — setting
 * `domain: ".xogridmaker.com"` on a request to `localhost` would silently
 * cause the browser to drop the cookie, breaking local dev.
 */
export function cookieDomainForHost(host: string | null | undefined): string | undefined {
  if (!host) return undefined;
  // Strip port if present (e.g. `localhost:3002`, `xogridmaker.com:443`).
  const bareHost = host.split(":")[0]!.toLowerCase();
  if (bareHost === "xogridmaker.com" || bareHost.endsWith(".xogridmaker.com")) {
    return ".xogridmaker.com";
  }
  return undefined;
}
