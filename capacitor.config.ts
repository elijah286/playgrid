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
};

export default config;
