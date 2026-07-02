import type { CapacitorConfig } from "@capacitor/cli";

const useLiveSite = process.env.CAP_USE_LIVE !== "false";

const config: CapacitorConfig = {
  appId: "com.xogridmaker.app",
  appName: "xogridmaker",
  // Append a marker to the WebView User-Agent so the server can tell native-app
  // requests apart from plain web browsers (both load the same live site via
  // `server.url`). The server uses this to strip ad-conversion pixels and the
  // cookie-consent banner from pages served inside the app — App Store
  // Guideline 5.1.2(i): no tracking/cookies in the app without App Tracking
  // Transparency. Must match `NATIVE_APP_UA_MARKER` in
  // src/lib/native/nativeRequest.ts (enforced by capacitor-config.test.ts).
  appendUserAgent: "XOGridmakerApp",
  // `webDir` is required by the CLI but unused when `server.url` is set.
  // We point it at `public/` so `cap sync` always has a valid directory.
  webDir: "public",
  server: useLiveSite
    ? {
        url: "https://www.xogridmaker.com",
        cleartext: false,
      }
    : undefined,
  ios: {
    // REQUIRED for offline mode. WKWebView only exposes Service Workers to
    // "app-bound domains": this flag + the WKAppBoundDomains array in
    // ios/App/App/Info.plist (xogridmaker.com). Without BOTH, iOS has no
    // `navigator.serviceWorker` at all, so the offline shell (public/sw.js)
    // never installs and an airplane-mode launch hangs on the splash screen
    // forever. Side effect: the WebView can only top-level-navigate to
    // app-bound domains — already our behavior, since Capacitor opens
    // external links in the system browser and native sign-in uses the
    // SocialLogin SDK (no in-WebView OAuth redirects). NOTE: if you ever
    // point server.url at a LAN address for local device testing, flip this
    // off for that build or the initial load itself will be blocked.
    limitsNavigationsToAppBoundDomains: true,
    // `never` keeps WKWebView edge-to-edge so the header's background paints
    // behind the status bar / dynamic island. We pair this with
    // `viewport-fit=cover` + CSS `env(safe-area-inset-top)` on
    // `[data-site-header]` in globals.css to keep content out of the unsafe
    // zone. `always` (the previous value) made iOS inset the webview below
    // the status bar — the result was a white strip above the colored
    // header, which doesn't happen on Android because the StatusBar plugin
    // defaults to overlay=true there.
    contentInset: "never",
    // Safari Web Inspector. OFF by default so production App Store builds
    // ship non-inspectable: Apple flags debug-enabled web wrappers, and an
    // attachable WKWebView exposes the live authenticated session (DOM,
    // cookies, in-flight requests) to anyone who can plug in the device.
    // Opt in for local debugging with `CAP_DEBUG_WEBVIEW=true npx cap sync`
    // — fail-safe: a release build that never sets the var stays locked down.
    webContentsDebuggingEnabled: process.env.CAP_DEBUG_WEBVIEW === "true",
    // No `backgroundColor` here — Capacitor falls back to
    // `UIColor.systemBackground`, which is dynamic and tracks light/dark
    // mode. The previous `#ffffff` was forcing the webview's exterior to
    // white, which showed as a jarring white gap above the header in
    // dark mode whenever the WKWebView's frame extended past the page
    // content (e.g. during overscroll or at the top safe-area).
  },
  android: {
    // Same reasoning as iOS — let the OS pick a theme-aware background.
  },
  plugins: {
    SplashScreen: {
      // launchAutoHide:false → JS dismisses the native splash
      // (SplashScreen.hide on the first paint after hydration, in
      // NativeAppShell), NOT after launchShowDuration. The HTML
      // #native-loading-overlay bridges the splash→hydrated-paint gap that
      // Apple reviewers flag on web wrappers. launchShowDuration is therefore
      // only a fallback for the auto-hide path we don't use — it does NOT
      // impose a minimum splash time on our JS-driven dismissal.
      launchShowDuration: 1200,
      launchAutoHide: false,
      launchFadeOutDuration: 280,
      // No `backgroundColor` — the iOS LaunchScreen storyboard already
      // uses `systemBackgroundColor` (theme-aware), and the WebView's
      // background is `UIColor.systemBackground` (also theme-aware) once
      // we removed `ios.backgroundColor`. The previous `#ffffff` forced
      // a white flash between splash and WebView in dark mode.
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: false,
    },
  },
};

export default config;
