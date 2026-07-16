import { isNativeApp } from "./isNativeApp";

/**
 * Push permission is a ONE-SHOT resource. iOS shows its permission alert at
 * most once per install: after a denial, the only way back is for the coach to
 * find the app in Settings and flip it themselves — which effectively nobody
 * does. Android 13+ behaves the same way after a second dismissal.
 *
 * So the OS alert is never fired speculatively. It fires only after a coach has
 * said yes to an in-app soft-ask, at a moment where reminders are obviously
 * useful to them (see PushPrimingDialog). This module is the only place allowed
 * to call requestPermissions() for push.
 */

export type PushPermissionState =
  /** Already granted — safe to register silently. */
  | "granted"
  /** Refused. The OS alert will never show again; Settings is the only path. */
  | "denied"
  /** Never asked. Our one shot is still unspent — do not waste it. */
  | "prompt"
  /** Web, or the plugin isn't in this build. */
  | "unavailable";

/**
 * Fired when a coach does something that makes reminders self-evidently
 * useful — today, scheduling a game or practice. PushPrimingDialog listens.
 */
export const PUSH_PRIMING_EVENT = "xo:push-priming";

/** Fired once the coach grants permission, so the app shell can register the
 *  device without waiting for the next cold start. */
export const PUSH_GRANTED_EVENT = "xo:push-granted";

export function requestPushPriming(): void {
  try {
    window.dispatchEvent(new Event(PUSH_PRIMING_EVENT));
  } catch {
    /* SSR or no window — nothing to prime */
  }
}

async function plugin() {
  const mod = await import("@capacitor/push-notifications");
  return mod.PushNotifications;
}

/** Read the current state WITHOUT prompting. Safe to call anywhere. */
export async function getPushPermission(): Promise<PushPermissionState> {
  if (!isNativeApp()) return "unavailable";
  try {
    const perm = await (await plugin()).checkPermissions();
    if (perm.receive === "granted") return "granted";
    if (perm.receive === "denied") return "denied";
    return "prompt";
  } catch {
    return "unavailable";
  }
}

/**
 * Spend the one shot: show the OS permission alert.
 *
 * Only PushPrimingDialog may call this, and only from a coach's explicit tap.
 * Calling it on app start — as this app did until 2026-07-16 — burns the ask at
 * the exact moment a coach has the least context for it, and permanently
 * disables game/practice reminders for everyone who reflexively declines.
 */
export async function requestPushPermission(): Promise<boolean> {
  if (!isNativeApp()) return false;
  try {
    const perm = await (await plugin()).requestPermissions();
    const granted = perm.receive === "granted";
    if (granted) {
      try {
        window.dispatchEvent(new Event(PUSH_GRANTED_EVENT));
      } catch {
        /* registration still happens on the next app start */
      }
    }
    return granted;
  } catch {
    return false;
  }
}
