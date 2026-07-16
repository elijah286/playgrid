import { isNativeApp, nativePlatform } from "@/lib/native/isNativeApp";

// Key under which the per-device refresh secret is stored via
// @capacitor/preferences. The native layer (Android FirebaseMessagingService,
// iOS silent-push handler) reads the SAME key from the platform's Capacitor
// preferences store to authenticate /api/push/refresh when a token rotates
// while the app is killed. Must stay in lockstep with the native readers.
export const PUSH_REFRESH_SECRET_KEY = "pushRefreshSecret";

async function storeRefreshSecret(secret: string): Promise<void> {
  try {
    const { Preferences } = await import("@capacitor/preferences");
    await Preferences.set({ key: PUSH_REFRESH_SECRET_KEY, value: secret });
  } catch {
    // Preferences plugin missing or write failed — refresh just falls back to
    // the next app-open re-register. Best-effort.
  }
}

/**
 * Register this native device for push and persist its FCM token server-side.
 *
 * NEVER prompts. If permission hasn't been granted yet this returns silently,
 * leaving the OS alert unspent — asking for it is PushPrimingDialog's job, at a
 * moment where a coach can see why it's worth granting.
 *
 * Until 2026-07-16 this function called requestPermissions() itself, so the OS
 * alert fired the instant a session was recovered: a coach logging in got the
 * permission dialog with no context, stacked over three other modals. iOS only
 * ever shows that alert once, so a reflexive "Don't Allow" there permanently
 * killed game/practice reminders for that install. Do not re-add a prompt here.
 *
 * No-ops on web (the plugin only exists in the native shell). Safe to call on
 * every app start once the user is authenticated — re-registering refreshes the
 * token's last_seen_at and re-enables any soft-disabled row.
 *
 * Returns an unsubscribe fn that tears down the listeners (call on sign-out).
 */
export async function registerPush(): Promise<(() => void) | void> {
  if (!isNativeApp()) return;

  let PushNotifications: typeof import("@capacitor/push-notifications").PushNotifications;
  try {
    ({ PushNotifications } = await import("@capacitor/push-notifications"));
  } catch {
    // Plugin not present in this build — nothing to do.
    return;
  }

  try {
    // Read-only. "prompt" means our one shot is still unspent — leave it for
    // the priming dialog rather than burning it on an app start.
    const perm = await PushNotifications.checkPermissions();
    if (perm.receive !== "granted") return;

    const platform = nativePlatform();
    const appVersion = await readAppVersion();

    const regHandle = await PushNotifications.addListener(
      "registration",
      (tokenData) => {
        void (async () => {
          try {
            const res = await fetch("/api/push/register", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({
                token: tokenData.value,
                platform,
                appVersion,
              }),
            });
            // Persist the per-device refresh secret so native code can update a
            // rotated token later without a session (see /api/push/refresh).
            const data = (await res.json().catch(() => null)) as
              | { refreshSecret?: string }
              | null;
            if (data?.refreshSecret) await storeRefreshSecret(data.refreshSecret);
          } catch {
            /* best-effort; will retry on next app start */
          }
        })();
      },
    );

    const errHandle = await PushNotifications.addListener(
      "registrationError",
      () => {
        /* swallow — surfaced again on next attempt */
      },
    );

    // Tapping a notification deep-links via the `link` data field.
    const tapHandle = await PushNotifications.addListener(
      "pushNotificationActionPerformed",
      (action) => {
        const link = action.notification.data?.link;
        if (typeof link === "string" && link.startsWith("/")) {
          window.location.assign(link);
        }
      },
    );

    await PushNotifications.register();

    return () => {
      void regHandle.remove();
      void errHandle.remove();
      void tapHandle.remove();
    };
  } catch {
    // Any native bridge failure is non-fatal — push is best-effort.
    return;
  }
}

/**
 * Remove this device's token from the server (sign-out). Best-effort.
 */
export async function unregisterPush(): Promise<void> {
  if (!isNativeApp()) return;
  let PushNotifications: typeof import("@capacitor/push-notifications").PushNotifications;
  try {
    ({ PushNotifications } = await import("@capacitor/push-notifications"));
  } catch {
    return;
  }
  try {
    // We don't have the raw token cached here; the delivered-token listener is
    // the source. Best-effort: ask the plugin to drop all delivered/registered
    // state so the OS stops handing us the token, then let server-side dead-
    // token pruning clean up on the next failed send.
    await PushNotifications.removeAllListeners();
  } catch {
    /* best-effort */
  }
}

async function readAppVersion(): Promise<string | undefined> {
  try {
    const { App } = await import("@capacitor/app");
    const info = await App.getInfo();
    return info.version;
  } catch {
    return undefined;
  }
}
