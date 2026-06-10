import { headers } from "next/headers";

// Server-side detection of the Capacitor native shell.
//
// The native iOS/Android app loads the live site (https://www.xogridmaker.com)
// inside a WKWebView/WebView via `server.url` in capacitor.config.ts. That
// means the SAME server-rendered HTML is served to the app and to regular web
// browsers — the server can't tell them apart unless the request carries a
// marker.
//
// The native shell appends `NATIVE_APP_UA_MARKER` to its User-Agent
// (capacitor.config.ts → `appendUserAgent`). Detecting it server-side lets us
// render a clean, tracking-free page for the app: no ad-conversion pixels and
// no cookie-consent banner ever reach the WKWebView (App Store Guideline
// 5.1.2(i) — no tracking/cookies in the app without App Tracking Transparency).
//
// Client-side code uses `isNativeApp()` (window.Capacitor) instead; this is its
// server-side counterpart and must stay in sync with the Capacitor config. The
// `capacitor-config.test.ts` guard asserts the config still appends this exact
// token, so the two can't silently drift.
export const NATIVE_APP_UA_MARKER = "XOGridmakerApp";

/**
 * Pure check: does this User-Agent belong to the Capacitor native shell?
 * Case-insensitive substring match on the appended marker.
 */
export function isNativeUserAgent(ua: string | null | undefined): boolean {
  if (!ua) return false;
  return ua.toLowerCase().includes(NATIVE_APP_UA_MARKER.toLowerCase());
}

/**
 * True when the current request originates from the native app shell. Reads the
 * incoming `user-agent` header; safe to call from any server component.
 */
export async function isNativeAppRequest(): Promise<boolean> {
  const h = await headers();
  return isNativeUserAgent(h.get("user-agent"));
}
