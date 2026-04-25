/**
 * Detect whether the current page is running inside the Capacitor-wrapped
 * native iOS/Android app vs. a regular web browser.
 *
 * Capacitor injects `window.Capacitor` and exposes `isNativePlatform()` —
 * we read it defensively so SSR + non-native browsers both return false.
 */
export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  try {
    return !!cap?.isNativePlatform?.();
  } catch {
    return false;
  }
}

export function nativePlatform(): "ios" | "android" | "web" {
  if (typeof window === "undefined") return "web";
  const cap = (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor;
  const p = cap?.getPlatform?.();
  return p === "ios" || p === "android" ? p : "web";
}
