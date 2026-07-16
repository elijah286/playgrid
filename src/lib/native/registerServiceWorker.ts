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
 * Fired whenever the set of CACHED ROUTES changes (a precache tick / finish).
 * Distinct from OFFLINE_CACHE_EVENT, which covers the IndexedDB data. A play is
 * only truly openable offline when BOTH have landed, so the readiness UI
 * listens to both.
 */
export const OFFLINE_ROUTES_EVENT = "xog:offline-routes-changed";

function notifyRoutesChanged(): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent(OFFLINE_ROUTES_EVENT));
  } catch {
    /* no-op */
  }
}

export type PrecacheProgress = { done: number; total: number };

async function activeWorker(): Promise<ServiceWorker | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg?.active ?? reg?.waiting ?? reg?.installing ?? null;
}

/**
 * Asks the active worker to precache a list of URLs (used after a coach
 * downloads a playbook, so the real /playbooks/<id> + /plays/<id>/edit routes
 * are in cache before they need them on the sideline).
 *
 * Fire-and-forget by default (existing callers rely on that). Pass `onProgress`
 * to instead AWAIT completion and receive per-URL ticks over a MessageChannel —
 * that's what lets the download button report honest progress instead of
 * claiming "Available offline" while pages are still streaming in.
 */
export async function precacheUrls(
  urls: string[],
  opts?: { dedupe?: boolean; onProgress?: (p: PrecacheProgress) => void },
): Promise<void> {
  const worker = await activeWorker();
  if (!worker) return;
  const payload = { type: "PRECACHE_URLS", urls, dedupe: opts?.dedupe ?? false };

  if (!opts?.onProgress) {
    worker.postMessage(payload);
    return;
  }

  await new Promise<void>((resolve) => {
    const ch = new MessageChannel();
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      try {
        ch.port1.close();
      } catch {
        /* already closed */
      }
      notifyRoutesChanged();
      resolve();
    };
    // Safety net: never leave the UI stuck on "Downloading…" if the worker is
    // replaced mid-flight (an update activates) and the DONE reply never lands.
    const timer = setTimeout(finish, 120_000);
    ch.port1.onmessage = (e: MessageEvent) => {
      const d = e.data as { type?: string; done?: number; total?: number };
      if (d?.type === "PRECACHE_PROGRESS") {
        opts.onProgress?.({ done: d.done ?? 0, total: d.total ?? urls.length });
        notifyRoutesChanged();
      } else if (d?.type === "PRECACHE_DONE") {
        clearTimeout(timer);
        finish();
      }
    };
    worker.postMessage(payload, [ch.port2]);
  });
}

/**
 * Which of `urls` are actually present in the worker's nav cache. Used to show
 * a coach WHICH plays are genuinely available offline instead of assuming the
 * whole playbook landed. Resolves to an empty set when there's no worker (web)
 * or the worker doesn't answer — callers treat that as "nothing cached", which
 * degrades to hiding the glyph rather than lying about readiness.
 */
export async function checkCachedRoutes(urls: string[]): Promise<Set<string>> {
  if (urls.length === 0) return new Set();
  const worker = await activeWorker();
  if (!worker) return new Set();

  return new Promise<Set<string>>((resolve) => {
    const ch = new MessageChannel();
    let settled = false;
    const done = (v: Set<string>) => {
      if (settled) return;
      settled = true;
      try {
        ch.port1.close();
      } catch {
        /* already closed */
      }
      resolve(v);
    };
    const timer = setTimeout(() => done(new Set()), 5_000);
    ch.port1.onmessage = (e: MessageEvent) => {
      clearTimeout(timer);
      const cached = (e.data as { cached?: unknown })?.cached;
      done(new Set(Array.isArray(cached) ? (cached as string[]) : []));
    };
    ch.port1.onmessageerror = () => done(new Set());
    worker.postMessage({ type: "CHECK_CACHED_URLS", urls }, [ch.port2]);
  });
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
 * Deliberately MINIMAL: it primes ONLY /home. It must never fan out over a
 * coach's whole downloaded library — a coach with dozens of playbooks (each
 * with many plays) would trigger a huge precache storm on every launch that
 * saturates the connection, times out the connectivity probe, and makes the
 * ONLINE app feel offline and unresponsive (regression 2026-07-15). Real
 * playbook + play pages are cached the moment they're VISITED online
 * (networkFirstWithCacheFallback) and in bulk by an explicit "download for
 * offline" (throttled). Offline visits to a not-yet-cached play degrade to
 * the read-only cached view, so no eager sweep is needed.
 */
export async function primeOfflineShell(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  await registerOfflineServiceWorker();
  await precacheUrls(["/home"]);
}
