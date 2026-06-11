/**
 * Thin wrappers around `@capacitor/local-notifications` for on-device game /
 * practice reminders. They no-op silently on the web and wherever the plugin
 * isn't available, so call sites don't have to check `isNativeApp()` first.
 *
 * Local notifications are scheduled and fire entirely on the device — no
 * network, and they arrive even when the app is closed. That's a genuinely
 * native capability a mobile browser can't provide, which is the point of
 * this feature for App Store Guideline 4.2.
 */
import { isNativeApp } from "./isNativeApp";

/** Ask for (or confirm) permission to post local notifications. */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (!isNativeApp()) return false;
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    let perm = await LocalNotifications.checkPermissions();
    if (perm.display !== "granted") {
      perm = await LocalNotifications.requestPermissions();
    }
    return perm.display === "granted";
  } catch {
    return false;
  }
}

/** Schedule a one-shot reminder. `id` must be a 32-bit int and unique. */
export async function scheduleReminder(opts: {
  id: number;
  title: string;
  body: string;
  at: Date;
}): Promise<boolean> {
  if (!isNativeApp()) return false;
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    await LocalNotifications.schedule({
      notifications: [
        {
          id: opts.id,
          title: opts.title,
          body: opts.body,
          // allowWhileIdle so it still fires if iOS has the app suspended.
          schedule: { at: opts.at, allowWhileIdle: true },
        },
      ],
    });
    return true;
  } catch {
    return false;
  }
}

/** Cancel a previously-scheduled reminder by id. */
export async function cancelReminder(id: number): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    await LocalNotifications.cancel({ notifications: [{ id }] });
  } catch {
    /* ignore */
  }
}

/** Ids of reminders still pending in the OS scheduler. */
export async function listPendingReminderIds(): Promise<number[]> {
  if (!isNativeApp()) return [];
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    const res = await LocalNotifications.getPending();
    return res.notifications.map((n) => n.id);
  } catch {
    return [];
  }
}
