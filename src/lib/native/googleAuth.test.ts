import { afterEach, describe, expect, it } from "vitest";
import { canUseNativeGoogleAuth } from "./googleAuth";

/**
 * Regression: on iOS the @capgo SocialLogin plugin's `initialize()` ignores
 * `webClientId` and only registers Google when an `iOSClientId` is present.
 * We never pass one, so iOS init rejects with "No provider was initialized"
 * (the red error coaches hit). The gate must therefore hide the native
 * Google button on iOS while keeping it on Android, where the flow works.
 */

type CapMock = {
  getPlatform?: () => string;
  isPluginAvailable?: (name: string) => boolean;
};

function setCapacitor(cap: CapMock | undefined) {
  (window as unknown as { Capacitor?: CapMock }).Capacitor = cap;
}

const WEB_CLIENT_ID = "123.apps.googleusercontent.com";

afterEach(() => {
  setCapacitor(undefined);
});

describe("canUseNativeGoogleAuth", () => {
  it("is false on iOS even with a client ID and the plugin available", () => {
    setCapacitor({
      getPlatform: () => "ios",
      isPluginAvailable: () => true,
    });
    expect(canUseNativeGoogleAuth(WEB_CLIENT_ID)).toBe(false);
  });

  it("is true on Android with a client ID and the plugin available", () => {
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

  it("is false without a configured web client id", () => {
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
    expect(canUseNativeGoogleAuth(WEB_CLIENT_ID)).toBe(false);
  });
});
