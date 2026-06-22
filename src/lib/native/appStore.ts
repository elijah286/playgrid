/**
 * App Store constants + the render decision for the iOS web-install banner.
 *
 * Two surfaces nudge mobile-web visitors toward the iOS app:
 *  - Apple's native Smart App Banner, emitted via the `apple-itunes-app`
 *    meta tag in the root layout. Only Mobile Safari renders it.
 *  - <IosAppBanner>, a custom in-flow bar (mirrors the Android banner) for the
 *    iOS browsers Safari's banner never reaches — Chrome, Firefox, Edge, and
 *    in-app webviews.
 *
 * Both read APP_STORE_ID from here so there is one source of truth, and both
 * no-op until it's a real numeric id (appStoreConfigured()).
 *
 * Plain module (no "use client") so the server-rendered metadata in
 * layout.tsx and the client banner can both import it.
 */

// Numeric App Store id for "XO Gridmaker" (App Store Connect → App
// Information → "Apple ID"). Drives the meta tag and the banner deep link.
export const APP_STORE_ID = "6776595895";

/** True once APP_STORE_ID is a real numeric id (not a placeholder/empty). */
export function appStoreConfigured(id: string = APP_STORE_ID): boolean {
  return /^\d+$/.test(id);
}

/** Canonical App Store listing URL for the iOS app. */
export const APP_STORE_URL = `https://apps.apple.com/app/id${APP_STORE_ID}`;

/**
 * iPhone/iPod/iPad announce themselves in the UA. iPadOS 13+ Safari reports a
 * desktop "Macintosh" UA by default, so an iPad is also inferred from a Mac UA
 * with a touch screen — desktop Macs report maxTouchPoints 0.
 */
export function isIosBrowser(userAgent: string, maxTouchPoints: number): boolean {
  if (/iphone|ipod|ipad/i.test(userAgent)) return true;
  if (/macintosh/i.test(userAgent) && maxTouchPoints > 1) return true;
  return false;
}

/**
 * Mobile Safari is the only iOS browser that renders Apple's native Smart App
 * Banner. Every iOS browser is WebKit and carries "Safari" in its UA, but the
 * third-party ones add a distinguishing token (CriOS = Chrome, FxiOS = Firefox,
 * EdgiOS = Edge, …). "Safari UA without one of those tokens" ⇒ Safari.
 */
export function isMobileSafari(userAgent: string): boolean {
  const isOtherBrowser =
    /crios|fxios|edgios|opios|opt\/|mercury|duckduckgo|gsa|yandex|focus/i.test(
      userAgent,
    );
  return /safari/i.test(userAgent) && !isOtherBrowser;
}

export type IosBannerEnv = {
  userAgent: string;
  maxTouchPoints: number;
  isNative: boolean;
  dismissed: boolean;
};

/**
 * Whether the custom <IosAppBanner> should render. Pure, so it's unit-testable
 * without a DOM. Shows only when ALL hold:
 *  - the App Store id is configured,
 *  - not inside the Capacitor native shell (no point promoting the app to
 *    someone already in it),
 *  - the device is an iOS browser,
 *  - that browser is NOT Safari (Safari gets Apple's native banner instead, so
 *    showing this too would double up),
 *  - the visitor hasn't dismissed it before.
 */
export function shouldShowIosBanner(env: IosBannerEnv): boolean {
  if (!appStoreConfigured()) return false;
  if (env.isNative) return false;
  if (!isIosBrowser(env.userAgent, env.maxTouchPoints)) return false;
  if (isMobileSafari(env.userAgent)) return false;
  if (env.dismissed) return false;
  return true;
}
