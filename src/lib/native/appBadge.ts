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

/** Set the app-icon badge to an absolute count. `0` clears it. Best-effort. */
export async function setAppBadge(count: number): Promise<void> {
  if (!isNativeApp()) return;
  const n = Math.max(0, Math.trunc(count));
  try {
    const { Badge } = await import("@capawesome/capacitor-badge");
    if (n === 0) {
      await Badge.clear();
      return;
    }
    // Check only — NEVER request. On iOS badge authorization is part of the
    // same UNUserNotificationCenter alert as push, and this runs from
    // NativeBadgeSync on every inbox-count change, including at app open. So a
    // request here would fire the notification permission alert with no context
    // and spend the one shot iOS gives us — exactly the bug we removed from
    // registerPush. A badge with no notification permission is worthless
    // anyway; PushPrimingDialog does the asking, and once a coach grants it the
    // next count change badges normally.
    const perm = await Badge.checkPermissions();
    if (perm.display !== "granted") return;
    await Badge.set({ count: n });
  } catch {
    // Plugin missing (web / not yet synced into this build) or the OS denied
    // badging — non-fatal. The server-sent push badge remains the fallback.
  }
}

/** Clear the app-icon badge outright. Best-effort. */
export async function clearAppBadge(): Promise<void> {
  await setAppBadge(0);
}
