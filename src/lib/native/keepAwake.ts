/**
 * Prevent the screen from auto-locking. Wired into game mode so a coach
 * holding the phone on the sideline doesn't lose the play screen mid-drive.
 *
 * On the web, this falls back to the Wake Lock API where supported and
 * silently does nothing where it isn't.
 */
import { isNativeApp } from "./isNativeApp";

let webWakeLock: WakeLockSentinel | null = null;

interface WakeLockSentinel {
  release: () => Promise<void>;
}

export async function keepAwakeOn(): Promise<void> {
  if (isNativeApp()) {
    try {
      const { KeepAwake } = await import("@capacitor-community/keep-awake");
      await KeepAwake.keepAwake();
    } catch {
      /* ignore */
    }
    return;
  }

  // Web fallback — Wake Lock API. Some browsers (Safari < 16.4) don't
  // support it; ignore failures rather than surface them.
  try {
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinel> };
    };
    if (nav.wakeLock?.request) {
      webWakeLock = await nav.wakeLock.request("screen");
    }
  } catch {
    /* ignore */
  }
}

export async function keepAwakeOff(): Promise<void> {
  if (isNativeApp()) {
    try {
      const { KeepAwake } = await import("@capacitor-community/keep-awake");
      await KeepAwake.allowSleep();
    } catch {
      /* ignore */
    }
    return;
  }

  if (webWakeLock) {
    try {
      await webWakeLock.release();
    } catch {
      /* ignore */
    }
    webWakeLock = null;
  }
}
