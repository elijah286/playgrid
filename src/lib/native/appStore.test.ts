import { describe, expect, it } from "vitest";
import {
  APP_STORE_ID,
  APP_STORE_URL,
  PLAY_STORE_ID,
  appPlatform,
  appStoreConfigured,
  isIosBrowser,
  isMobileSafari,
  playStoreUrl,
  shouldShowIosBanner,
  storeUrl,
  storeReviewsUrl,
  APP_STORE_REVIEWS_URL,
  type IosBannerEnv,
} from "./appStore";

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0 Mobile/15E148 Safari/604.1";
const IPAD_CHROME_DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0 Safari/605.1.15";
const IPAD_SAFARI_DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const MAC_SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36";

function env(overrides: Partial<IosBannerEnv>): IosBannerEnv {
  return {
    userAgent: IPHONE_CHROME,
    maxTouchPoints: 5,
    isNative: false,
    dismissed: false,
    ...overrides,
  };
}

describe("appStoreConfigured", () => {
  it("is true for the shipped numeric id", () => {
    expect(appStoreConfigured()).toBe(true);
    expect(appStoreConfigured(APP_STORE_ID)).toBe(true);
  });

  it("is false for empty or placeholder ids", () => {
    expect(appStoreConfigured("")).toBe(false);
    expect(appStoreConfigured("REPLACE_ME")).toBe(false);
    expect(appStoreConfigured("id123")).toBe(false);
  });
});

describe("APP_STORE_URL", () => {
  it("points at the listing for the configured id", () => {
    expect(APP_STORE_URL).toBe(`https://apps.apple.com/app/id${APP_STORE_ID}`);
  });
});

describe("storeReviewsUrl", () => {
  it("iOS points at the App Store reviews section of the listing", () => {
    expect(storeReviewsUrl("ios")).toBe(APP_STORE_REVIEWS_URL);
    expect(APP_STORE_REVIEWS_URL).toBe(`${APP_STORE_URL}?see-all=reviews`);
  });

  it("Android points at the Play Store listing with reviews shown", () => {
    expect(storeReviewsUrl("android")).toBe(
      `https://play.google.com/store/apps/details?id=${PLAY_STORE_ID}&showAllReviews=true`,
    );
  });
});

describe("isIosBrowser", () => {
  it("detects iPhone", () => {
    expect(isIosBrowser(IPHONE_SAFARI, 5)).toBe(true);
    expect(isIosBrowser(IPHONE_CHROME, 5)).toBe(true);
  });

  it("detects iPadOS reporting a desktop Mac UA via touch points", () => {
    expect(isIosBrowser(IPAD_SAFARI_DESKTOP_UA, 5)).toBe(true);
    expect(isIosBrowser(IPAD_CHROME_DESKTOP_UA, 5)).toBe(true);
  });

  it("does not treat a real (touchless) Mac as iOS", () => {
    expect(isIosBrowser(MAC_SAFARI, 0)).toBe(false);
  });

  it("does not treat Android as iOS", () => {
    expect(isIosBrowser(ANDROID_CHROME, 5)).toBe(false);
  });
});

describe("isMobileSafari", () => {
  it("is true for Mobile Safari", () => {
    expect(isMobileSafari(IPHONE_SAFARI)).toBe(true);
    expect(isMobileSafari(IPAD_SAFARI_DESKTOP_UA)).toBe(true);
  });

  it("is false for third-party iOS browsers", () => {
    expect(isMobileSafari(IPHONE_CHROME)).toBe(false);
    expect(isMobileSafari(IPAD_CHROME_DESKTOP_UA)).toBe(false);
  });
});

describe("shouldShowIosBanner", () => {
  it("shows on a non-Safari iOS browser", () => {
    expect(shouldShowIosBanner(env({ userAgent: IPHONE_CHROME }))).toBe(true);
    expect(
      shouldShowIosBanner(env({ userAgent: IPAD_CHROME_DESKTOP_UA })),
    ).toBe(true);
  });

  it("hides in Mobile Safari (Apple's native banner handles it)", () => {
    expect(shouldShowIosBanner(env({ userAgent: IPHONE_SAFARI }))).toBe(false);
    expect(
      shouldShowIosBanner(env({ userAgent: IPAD_SAFARI_DESKTOP_UA })),
    ).toBe(false);
  });

  it("hides inside the native app shell", () => {
    expect(shouldShowIosBanner(env({ isNative: true }))).toBe(false);
  });

  it("hides once dismissed", () => {
    expect(shouldShowIosBanner(env({ dismissed: true }))).toBe(false);
  });

  it("hides on non-iOS devices", () => {
    expect(shouldShowIosBanner(env({ userAgent: ANDROID_CHROME }))).toBe(false);
    expect(
      shouldShowIosBanner(env({ userAgent: MAC_SAFARI, maxTouchPoints: 0 })),
    ).toBe(false);
  });
});

describe("playStoreUrl", () => {
  it("targets the Play listing with a referrer for attribution", () => {
    const url = new URL(
      playStoreUrl({ source: "s", medium: "m", campaign: "c" }),
    );
    expect(url.origin + url.pathname).toBe(
      "https://play.google.com/store/apps/details",
    );
    expect(url.searchParams.get("id")).toBe(PLAY_STORE_ID);
    const referrer = new URLSearchParams(url.searchParams.get("referrer") ?? "");
    expect(referrer.get("utm_source")).toBe("s");
    expect(referrer.get("utm_medium")).toBe("m");
    expect(referrer.get("utm_campaign")).toBe("c");
  });

  it("falls back to generic referrer tags", () => {
    const referrer = new URLSearchParams(
      new URL(playStoreUrl()).searchParams.get("referrer") ?? "",
    );
    expect(referrer.get("utm_source")).toBe("web");
    expect(referrer.get("utm_campaign")).toBe("generic");
  });
});

describe("appPlatform", () => {
  it("buckets iOS, Android, and desktop", () => {
    expect(appPlatform(IPHONE_SAFARI, 5)).toBe("ios");
    expect(appPlatform(IPAD_SAFARI_DESKTOP_UA, 5)).toBe("ios");
    expect(appPlatform(ANDROID_CHROME)).toBe("android");
    expect(appPlatform(MAC_SAFARI, 0)).toBe("desktop");
  });

  it("treats a touchless Mac UA as desktop when touch points are unknown (server)", () => {
    // Server callers omit maxTouchPoints; an iPad-as-Mac UA then reads desktop.
    expect(appPlatform(IPAD_SAFARI_DESKTOP_UA)).toBe("desktop");
  });
});

describe("storeUrl", () => {
  it("returns the App Store URL for iOS", () => {
    expect(storeUrl("ios")).toBe(APP_STORE_URL);
  });

  it("returns a Play URL for Android", () => {
    expect(storeUrl("android")).toContain("play.google.com");
  });
});
