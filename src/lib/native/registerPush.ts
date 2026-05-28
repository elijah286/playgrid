import { isNativeApp, nativePlatform } from "@/lib/native/isNativeApp";

/**
 * Register this native device for push and persist its FCM token server-side.
 *
 * No-ops on web (the plugin only exists in the native shell) and bails quietly
 * if the user declines the OS permission prompt. Safe to call on every app
 * start once the user is authenticated — re-registering refreshes the token's
 * last_seen_at and re-enables any soft-disabled row.
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
    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") {
      perm = await PushNotifications.requestPermissions();
    }
    if (perm.receive !== "granted") return;

    const platform = nativePlatform();
    const appVersion = await readAppVersion();

    const regHandle = await PushNotifications.addListener(
      "registration",
      (tokenData) => {
        void fetch("/api/push/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            token: tokenData.value,
            platform,
            appVersion,
          }),
        }).catch(() => {
          /* best-effort; will retry on next app start */
        });
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
