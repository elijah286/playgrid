import { describe, it, expect } from "vitest";
import capacitorConfig from "../../../capacitor.config";
import { NATIVE_APP_UA_MARKER, isNativeUserAgent } from "./nativeRequest";

// A representative iOS WKWebView UA with the Capacitor `appendUserAgent` token
// tacked on, plus the bare browser equivalents we must NOT treat as native.
const IOS_NATIVE_UA = `Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 ${NATIVE_APP_UA_MARKER}`;
const ANDROID_NATIVE_UA = `Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36 ${NATIVE_APP_UA_MARKER}`;
const IOS_SAFARI_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const DESKTOP_CHROME_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

describe("isNativeUserAgent", () => {
  it("matches the iOS and Android native-shell User-Agents", () => {
    expect(isNativeUserAgent(IOS_NATIVE_UA)).toBe(true);
    expect(isNativeUserAgent(ANDROID_NATIVE_UA)).toBe(true);
  });

  it("is case-insensitive on the marker", () => {
    expect(isNativeUserAgent(`SomeBrowser ${NATIVE_APP_UA_MARKER.toUpperCase()}`)).toBe(true);
    expect(isNativeUserAgent(`SomeBrowser ${NATIVE_APP_UA_MARKER.toLowerCase()}`)).toBe(true);
  });

  it("does NOT match plain mobile or desktop browsers", () => {
    expect(isNativeUserAgent(IOS_SAFARI_UA)).toBe(false);
    expect(isNativeUserAgent(DESKTOP_CHROME_UA)).toBe(false);
  });

  it("handles missing/empty User-Agents", () => {
    expect(isNativeUserAgent(null)).toBe(false);
    expect(isNativeUserAgent(undefined)).toBe(false);
    expect(isNativeUserAgent("")).toBe(false);
  });
});

describe("capacitor config <-> NATIVE_APP_UA_MARKER", () => {
  // Guard against drift: the server gate (isNativeAppRequest) only works if the
  // native shell actually appends the exact marker the server looks for. If
  // someone changes one without the other, the app would silently start
  // loading tracking pixels again — the regression this whole change prevents.
  it("appends the same marker the server detects", () => {
    expect(capacitorConfig.appendUserAgent).toBe(NATIVE_APP_UA_MARKER);
  });
});
