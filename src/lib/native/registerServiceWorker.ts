"use client";

/**
 * Registers /sw.js so the offline shell route is reachable without signal.
 *
 * Only runs in the Capacitor WebView — web users hit the live site directly
 * and a SW there would surprise them with installable-PWA behavior we
 * haven't designed for. Keep the surface area narrow until the native
 * offline story is solid.
 *
 * Safe to call repeatedly; registration is idempotent.
 */
export async function registerOfflineServiceWorker(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch {
    // Registration failures are non-fatal — the app still works online.
  }
}

/**
 * Asks the active worker to precache a list of URLs (used after a coach
 * downloads a playbook, so `/offline/<playbookId>` is in cache before
 * they actually need it on the sideline).
 */
export async function precacheUrls(urls: string[]): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const worker = reg?.active ?? reg?.waiting ?? reg?.installing;
  if (!worker) return;
  worker.postMessage({ type: "PRECACHE_URLS", urls });
}

/**
 * Post-auth offline priming. Runs when a session becomes available (not just
 * at mount) because:
 *
 * 1. The mount-time registration can fail — it runs on the pre-login landing
 *    page for fresh installs, and any /sw.js fetch that bounces through a
 *    redirect makes registration throw SecurityError (SW script fetches use
 *    redirect mode "error"). Re-registering here is idempotent and succeeds
 *    once a session exists.
 * 2. Login is usually a client-side navigation, so NativeAppShell does NOT
 *    remount after auth — without this hook the first app session (the one
 *    where a coach downloads playbooks and drives to the field) would end
 *    with no SW and no cached shell.
 * 3. Playbooks already saved to IndexedDB may predate the registration (the
 *    download button's precache no-ops without a SW), so the REAL
 *    /playbooks/<id> routes are re-primed from the local DB — self-healing
 *    for devices that downloaded playbooks while the SW was unregistered.
 *
 * Primes the REAL app routes (/home, /playbooks/<id>) so offline navigation
 * lands on the standard pages — there is no separate offline surface.
 */
export async function primeOfflineShell(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  await registerOfflineServiceWorker();
  const urls = ["/home"];
  try {
    const { listCachedPlaybooks } = await import("@/lib/offline/db");
    const cached = await listCachedPlaybooks();
    urls.push(...cached.map((m) => `/playbooks/${m.id}`));
  } catch {
    // IndexedDB unavailable/cold — /home still gets primed.
  }
  await precacheUrls(urls);
}
