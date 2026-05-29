import { isNativeApp, nativePlatform } from "@/lib/native/isNativeApp";
import { recordAppOpenAction } from "@/app/actions/app-install";

const INSTALL_ID_KEY = "playgrid:install-id";

/**
 * Mint-once, persistent per-install id. Lives in the WebView's localStorage —
 * stable across launches, regenerated only if the user clears app data (which
 * correctly reads as a fresh install).
 */
function getOrCreateInstallId(): string | null {
  try {
    let id = localStorage.getItem(INSTALL_ID_KEY);
    if (!id) {
      id =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(INSTALL_ID_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}

async function readAppVersion(): Promise<string | null> {
  try {
    const { App } = await import("@capacitor/app");
    const info = await App.getInfo();
    return info.version ?? null;
  } catch {
    return null;
  }
}

/**
 * Record this native app launch for install analytics. No-ops on web. The
 * server decides first-open (install_id unseen = the install) vs repeat open.
 * Fire-and-forget and best-effort. Safe to call on every launch and again on
 * sign-in (to attach the authenticated user to the install promptly).
 */
export async function registerAppOpen(): Promise<void> {
  try {
    if (typeof window === "undefined" || !isNativeApp()) return;
    const platform = nativePlatform();
    if (platform !== "android" && platform !== "ios") return;
    const installId = getOrCreateInstallId();
    if (!installId) return;
    const appVersion = await readAppVersion();
    void recordAppOpenAction({ installId, platform, appVersion });
  } catch {
    /* swallow — analytics must never break the app */
  }
}
