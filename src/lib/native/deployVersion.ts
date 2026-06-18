/**
 * Deploy-version check for the native resume-reload.
 *
 * The WebView points straight at the live site (capacitor.config.ts
 * `server.url`), so reloading on resume re-fetches the whole bundle over the
 * network — slow on mobile. But most resumes land on the SAME deploy the coach
 * already had loaded, where reloading is pure cost for zero benefit. We only
 * reload when /api/version reports a build id different from the one this
 * bundle was built with, so an unchanged deploy resumes instantly.
 */

// Inlined at build by Next (next.config.ts `env`). Identifies the deploy that
// produced the loaded bundle. "dev" when the build id is unknown (local).
export const CURRENT_BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";

const VERSION_CHECK_TIMEOUT_MS = 4000;

/**
 * Resolves true when the live deploy's build id differs from this bundle's.
 *
 * Resolves false on any uncertainty — offline, timeout, non-OK response, parse
 * error, missing/`"dev"` id on either side. The reasoning: when we can't
 * confirm a *different* build is live, reloading can only hurt (a slow network
 * round-trip that lands back on the same code, or fails outright offline). The
 * fast, safe default is to stay put.
 */
export async function isNewDeployAvailable(
  timeoutMs = VERSION_CHECK_TIMEOUT_MS,
): Promise<boolean> {
  if (typeof fetch === "undefined") return false;
  // No reliable target id to compare against — don't reload.
  if (CURRENT_BUILD_ID === "dev") return false;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch("/api/version", {
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { buildId?: unknown };
    const liveId = typeof data.buildId === "string" ? data.buildId : null;
    if (!liveId || liveId === "dev") return false;
    return liveId !== CURRENT_BUILD_ID;
  } catch {
    // AbortError (timeout) / network failure / bad JSON — stay put.
    return false;
  } finally {
    clearTimeout(timer);
  }
}
