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
    contentInset: "always",
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
