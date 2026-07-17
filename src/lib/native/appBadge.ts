import { isNativeApp } from "./isNativeApp";

/**
 * App-icon badge control for the native shell.
 *
 * The server already sets the icon badge on every push (`aps.badge` /
 * Android `notification_count`) so the count is right while the app is
 * backgrounded. This module closes the other half: keeping the icon in sync
 * whenever the app is *open* — so reading the inbox on the web, or resolving an
 * item, clears the icon the next time the app is foregrounded instead of
 * waiting for the next push.
 *
 * Wraps `@capawesome/capacitor-badge`. No-ops on web and wherever the plugin
 * isn't present, so call sites never have to guard on `isNativeApp()` first —
 * same contract as the other `src/lib/native/*` wrappers.
 */

/**
 * Set the app-icon badge to an absolute count. `0` clears it. Best-effort.
 *
 * Returns `true` only when the icon was actually written. `false` means the
 * badge is NOT under this build's control — the plugin is missing (any iOS
 * build <= 1.0.1, which shipped before it was added) or the OS denied badging.
 * That distinction matters: on those builds the server's `aps.badge` can still
 * RAISE the badge while nothing here can lower it, so a `false` is the caller's
 * cue to fall back to a server-side reconcile
 * (see src/lib/notifications/badge-reconcile.ts). Callers on the web get
 * `false` too, and should ignore it.
 */
export async function setAppBadge(count: number): Promise<boolean> {
  if (!isNativeApp()) return false;
  const n = Math.max(0, Math.trunc(count));
  try {
    const { Badge } = await import("@capawesome/capacitor-badge");
    if (n === 0) {
      await Badge.clear();
      return true;
    }
    // Ensure badge authorization (granted alongside push, but a coach could
    // have toggled it). requestPermissions is a no-op once already granted.
    const perm = await Badge.checkPermissions();
    if (perm.display !== "granted") {
      const asked = await Badge.requestPermissions();
      if (asked.display !== "granted") return false;
    }
    await Badge.set({ count: n });
    return true;
  } catch {
    // Plugin missing (web / not yet synced into this build) or the OS denied
    // badging — non-fatal, but the icon is now out of our hands.
    return false;
  }
}

/** Clear the app-icon badge outright. Best-effort. */
export async function clearAppBadge(): Promise<boolean> {
  return setAppBadge(0);
}
