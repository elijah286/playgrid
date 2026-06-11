import { afterEach, describe, expect, it } from "vitest";
import { canUseNativeGoogleAuth } from "./googleAuth";

/**
 * The @capgo SocialLogin plugin's iOS `initialize()` ignores `webClientId`
 * and only registers Google when an `iOSClientId` is present (without one it
 * rejects with "No provider was initialized"). So the gate enables the native
 * Google button per-platform: Android needs the web client ID, iOS needs its
 * own iOS-type client ID — and in both cases the SocialLogin plugin must be
 * present in the installed binary.
 */

type CapMock = {
  getPlatform?: () => string;
  isPluginAvailable?: (name: string) => boolean;
};

function setCapacitor(cap: CapMock | undefined) {
  (window as unknown as { Capacitor?: CapMock }).Capacitor = cap;
}

const WEB_CLIENT_ID = "123.apps.googleusercontent.com";
const IOS_CLIENT_ID = "123-ios.apps.googleusercontent.com";

afterEach(() => {
  setCapacitor(undefined);
});

describe("canUseNativeGoogleAuth", () => {
  it("is true on iOS when an iOS client ID is set and the plugin is available", () => {
    setCapacitor({
      getPlatform: () => "ios",
      isPluginAvailable: () => true,
    });
    expect(canUseNativeGoogleAuth(WEB_CLIENT_ID, IOS_CLIENT_ID)).toBe(true);
  });

  it("is false on iOS when no iOS client ID is configured (web client ID alone is not enough)", () => {
    setCapacitor({
      getPlatform: () => "ios",
      isPluginAvailable: () => true,
    });
    expect(canUseNativeGoogleAuth(WEB_CLIENT_ID)).toBe(false);
    expect(canUseNativeGoogleAuth(WEB_CLIENT_ID, null)).toBe(false);
    expect(canUseNativeGoogleAuth(WEB_CLIENT_ID, "")).toBe(false);
  });

  it("is false on iOS when the SocialLogin plugin is missing (old build)", () => {
    setCapacitor({
      getPlatform: () => "ios",
      isPluginAvailable: () => false,
    });
    expect(canUseNativeGoogleAuth(WEB_CLIENT_ID, IOS_CLIENT_ID)).toBe(false);
  });

  it("is true on Android with a web client ID and the plugin available (iOS client ID irrelevant)", () => {
    setCapacitor({
      getPlatform: () => "android",
      isPluginAvailable: () => true,
    });
    expect(canUseNativeGoogleAuth(WEB_CLIENT_ID)).toBe(true);
  });

  it("is false on Android when the SocialLogin plugin is missing (old APK)", () => {
    setCapacitor({
      getPlatform: () => "android",
      isPluginAvailable: () => false,
    });
    expect(canUseNativeGoogleAuth(WEB_CLIENT_ID)).toBe(false);
  });

  it("is false on Android without a configured web client id", () => {
    setCapacitor({
      getPlatform: () => "android",
      isPluginAvailable: () => true,
    });
    expect(canUseNativeGoogleAuth(null)).toBe(false);
    expect(canUseNativeGoogleAuth(undefined)).toBe(false);
    expect(canUseNativeGoogleAuth("")).toBe(false);
  });

  it("is false in a plain web browser (no Capacitor)", () => {
    setCapacitor(undefined);
    expect(canUseNativeGoogleAuth(WEB_CLIENT_ID, IOS_CLIENT_ID)).toBe(false);
  });
});
