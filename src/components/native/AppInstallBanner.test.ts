import { describe, expect, it } from "vitest";
import {
  appStoreUrl,
  detectMobilePlatform,
  normalizeAppStoreId,
  playStoreUrl,
  resolveInstallBanner,
  type InstallPlatform,
} from "./AppInstallBanner";

// Representative UA strings.
const UA = {
  iphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  ipadModern:
    // iPadOS 13+ Safari masquerades as desktop Macintosh.
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  android:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36",
  macDesktop:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  windows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
} as const;

const neverDismissed = () => false;
const liveIos = { enabled: true, appStoreId: "6471234567" };

describe("detectMobilePlatform", () => {
  it("detects iPhone as ios", () => {
    expect(detectMobilePlatform(UA.iphone, 5)).toBe("ios");
  });

  it("detects a modern iPad (desktop-class Safari UA + touch) as ios", () => {
    expect(detectMobilePlatform(UA.ipadModern, 5)).toBe("ios");
  });

  it("does NOT treat a real Mac (no touch) as ios", () => {
    expect(detectMobilePlatform(UA.macDesktop, 0)).toBeNull();
  });

  it("detects Android browsers", () => {
    expect(detectMobilePlatform(UA.android, 5)).toBe("android");
  });

  it("returns null on desktop Windows", () => {
    expect(detectMobilePlatform(UA.windows, 0)).toBeNull();
  });
});

describe("normalizeAppStoreId", () => {
  it("keeps a bare numeric id", () => {
    expect(normalizeAppStoreId("6471234567")).toBe("6471234567");
  });

  it("strips an 'id' prefix and surrounding text", () => {
    expect(normalizeAppStoreId("id6471234567")).toBe("6471234567");
  });

  it("extracts digits from a full App Store URL", () => {
    expect(
      normalizeAppStoreId("https://apps.apple.com/us/app/xo-gridmaker/id6471234567"),
    ).toBe("6471234567");
  });

  it("returns null for empty / non-numeric input", () => {
    expect(normalizeAppStoreId("")).toBeNull();
    expect(normalizeAppStoreId("   ")).toBeNull();
    expect(normalizeAppStoreId(null)).toBeNull();
    expect(normalizeAppStoreId(undefined)).toBeNull();
    expect(normalizeAppStoreId("not-an-id")).toBeNull();
  });
});

describe("store URLs", () => {
  it("builds an App Store URL with the campaign token", () => {
    const url = appStoreUrl("6471234567");
    expect(url).toBe(
      "https://apps.apple.com/app/id6471234567?ct=web_install_banner",
    );
  });

  it("builds a Play Store URL with the web-banner referrer", () => {
    const url = playStoreUrl();
    expect(url).toContain(
      "https://play.google.com/store/apps/details?id=com.xogridmaker.app",
    );
    expect(url).toContain("utm_source");
    expect(url).toContain("app_install_banner");
  });
});

describe("resolveInstallBanner", () => {
  const base = {
    isNative: false,
    maxTouchPoints: 5,
    isDismissed: neverDismissed,
  };

  it("hides inside the native app shell", () => {
    expect(
      resolveInstallBanner({
        ...base,
        isNative: true,
        userAgent: UA.iphone,
        iosInstallCta: liveIos,
      }),
    ).toBeNull();
  });

  it("hides on desktop", () => {
    expect(
      resolveInstallBanner({
        ...base,
        userAgent: UA.windows,
        maxTouchPoints: 0,
        iosInstallCta: liveIos,
      }),
    ).toBeNull();
  });

  it("shows the Play Store banner on Android regardless of the iOS toggle", () => {
    const decision = resolveInstallBanner({
      ...base,
      userAgent: UA.android,
      iosInstallCta: undefined,
    });
    expect(decision?.platform).toBe("android");
    expect(decision?.storeUrl).toContain("play.google.com");
  });

  it("does NOT show on iOS when the admin toggle is off", () => {
    expect(
      resolveInstallBanner({
        ...base,
        userAgent: UA.iphone,
        iosInstallCta: { enabled: false, appStoreId: "6471234567" },
      }),
    ).toBeNull();
  });

  it("does NOT show on iOS when enabled but no App Store ID is set", () => {
    expect(
      resolveInstallBanner({
        ...base,
        userAgent: UA.iphone,
        iosInstallCta: { enabled: true, appStoreId: null },
      }),
    ).toBeNull();
  });

  it("does NOT show on iOS when iosInstallCta is missing entirely", () => {
    expect(
      resolveInstallBanner({
        ...base,
        userAgent: UA.iphone,
        iosInstallCta: undefined,
      }),
    ).toBeNull();
  });

  it("shows the App Store banner on iOS once enabled with a valid ID", () => {
    const decision = resolveInstallBanner({
      ...base,
      userAgent: UA.iphone,
      iosInstallCta: liveIos,
    });
    expect(decision?.platform).toBe("ios");
    expect(decision?.storeUrl).toBe(
      "https://apps.apple.com/app/id6471234567?ct=web_install_banner",
    );
  });

  it("respects a prior dismissal per platform", () => {
    const dismissedIos = (p: InstallPlatform) => p === "ios";
    // iOS dismissed → hidden even though it's live.
    expect(
      resolveInstallBanner({
        ...base,
        userAgent: UA.iphone,
        iosInstallCta: liveIos,
        isDismissed: dismissedIos,
      }),
    ).toBeNull();
    // Android dismissal is tracked separately, so an iOS dismissal doesn't
    // suppress the Android banner.
    expect(
      resolveInstallBanner({
        ...base,
        userAgent: UA.android,
        iosInstallCta: liveIos,
        isDismissed: dismissedIos,
      })?.platform,
    ).toBe("android");
  });
});
