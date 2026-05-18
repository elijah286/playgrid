import type { CapacitorConfig } from "@capacitor/cli";

const useLiveSite = process.env.CAP_USE_LIVE !== "false";

const config: CapacitorConfig = {
  appId: "com.xogridmaker.app",
  appName: "xogridmaker",
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
    // `never` keeps WKWebView edge-to-edge so the header's background paints
    // behind the status bar / dynamic island. We pair this with
    // `viewport-fit=cover` + CSS `env(safe-area-inset-top)` on
    // `[data-site-header]` in globals.css to keep content out of the unsafe
    // zone. `always` (the previous value) made iOS inset the webview below
    // the status bar — the result was a white strip above the colored
    // header, which doesn't happen on Android because the StatusBar plugin
    // defaults to overlay=true there.
    contentInset: "never",
    backgroundColor: "#ffffff",
  },
  android: {
    backgroundColor: "#ffffff",
  },
  plugins: {
    SplashScreen: {
      // Hold the splash for ~1.2s, then cross-fade for 280ms. This trims
      // the perceived "white flash" between native splash and the first
      // hydrated paint that Apple reviewers tend to flag on web wrappers.
      // We hide programmatically (showSplash on first paint) instead of
      // relying on the auto-hide so the splash never lingers if the
      // network is slow.
      launchShowDuration: 1200,
      launchAutoHide: false,
      launchFadeOutDuration: 280,
      backgroundColor: "#ffffff",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: false,
    },
  },
};

export default config;
