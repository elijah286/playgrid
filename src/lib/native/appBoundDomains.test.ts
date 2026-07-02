import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import capacitorConfig from "../../../capacitor.config";

// App-Bound Domains lockstep guard.
//
// WKWebView only exposes `navigator.serviceWorker` when BOTH halves are in
// place: `ios.limitsNavigationsToAppBoundDomains` in capacitor.config.ts AND
// the WKAppBoundDomains array in ios/App/App/Info.plist. With either half
// missing, the offline shell (public/sw.js) never installs on iOS and an
// airplane-mode launch hangs on the splash screen forever — the July 2026
// "offline mode does not work" customer bug. Nothing at build time connects
// the two files, so this test is what keeps them from drifting apart.
describe("iOS App-Bound Domains (offline service worker prerequisite)", () => {
  const plist = readFileSync(
    join(__dirname, "../../../ios/App/App/Info.plist"),
    "utf8",
  );

  it("capacitor config opts the WebView into app-bound navigation", () => {
    expect(capacitorConfig.ios?.limitsNavigationsToAppBoundDomains).toBe(true);
  });

  it("Info.plist declares xogridmaker.com as an app-bound domain", () => {
    expect(plist).toContain("<key>WKAppBoundDomains</key>");
    // Registrable domain only — WebKit extends it to subdomains (www).
    expect(plist).toContain("<string>xogridmaker.com</string>");
  });

  it("the app still points at the app-bound production origin", () => {
    // limitsNavigationsToAppBoundDomains blocks top-level navigation to
    // anything outside WKAppBoundDomains. If server.url ever moves off
    // xogridmaker.com the FIRST page load would be blocked on device.
    const url = capacitorConfig.server?.url;
    if (url) {
      expect(new URL(url).hostname.endsWith("xogridmaker.com")).toBe(true);
    }
  });
});
