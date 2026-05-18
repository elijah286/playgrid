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
