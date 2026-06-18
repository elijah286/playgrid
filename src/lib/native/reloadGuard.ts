/**
 * Shared guard + trigger for the native app's "reload the WebView" actions:
 * pull-to-refresh (a manual gesture) and reload-on-resume (automatic, in
 * NativeAppShell). The native WebView points straight at the live site
 * (see capacitor.config.ts `server.url`), so `location.reload()` fetches the
 * freshly deployed bundle — that's how a coach picks up a new release without
 * reinstalling.
 *
 * Surfaces with unsaved or in-progress state register a guard so neither a
 * stray pull nor a resume can discard work. Today that's the play editor while
 * it's in edit mode or has a pending autosave; the registry is generic so any
 * future surface (a half-composed Cal message, a multi-step form) can opt in.
 */

import { isNewDeployAvailable } from "./deployVersion";

type ReloadGuard = () => boolean;

const guards = new Set<ReloadGuard>();

/**
 * Register a predicate that returns `true` when a reload should be blocked.
 * Returns an unregister function — call it on unmount.
 */
export function registerReloadGuard(predicate: ReloadGuard): () => void {
  guards.add(predicate);
  return () => {
    guards.delete(predicate);
  };
}

/**
 * True when a reload should be suppressed right now — either a registered
 * guard says so, or a fullscreen scroll-locked surface (the Cal thread, which
 * sets `messages-mobile-lock` on <html>) is up and owns the gesture.
 */
export function isReloadBlocked(): boolean {
  if (
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("messages-mobile-lock")
  ) {
    return true;
  }
  for (const guard of guards) {
    try {
      if (guard()) return true;
    } catch {
      // A throwing guard must never wedge reload open or shut — ignore it and
      // let the remaining guards decide.
    }
  }
  return false;
}

/**
 * Reload the WebView to pick up the latest deploy. No-op when a guard is
 * active, so callers don't need to re-check first (they often do anyway, to
 * avoid showing a spinner that won't lead anywhere).
 */
export function triggerAppReload(): void {
  if (typeof window === "undefined") return;
  if (isReloadBlocked()) return;
  window.location.reload();
}

/**
 * Like {@link triggerAppReload}, but only reloads when the live deploy differs
 * from the loaded bundle (see {@link isNewDeployAvailable}). Used by
 * reload-on-resume so returning to an *unchanged* deploy resumes instantly
 * instead of paying a full network reload. Re-checks the guard after the async
 * version probe — a coach may have started an edit while the request was in
 * flight.
 */
export async function triggerAppReloadIfNewBuild(): Promise<void> {
  if (typeof window === "undefined") return;
  if (isReloadBlocked()) return;
  if (!(await isNewDeployAvailable())) return;
  if (isReloadBlocked()) return;
  window.location.reload();
}

/** Test-only: drop all registered guards so suites don't leak into each other. */
export function __resetReloadGuardsForTest(): void {
  guards.clear();
}
