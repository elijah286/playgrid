import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sha256Hex } from "./appleAuth";
import { canUseNativeGoogleAuth, signInWithGoogleNative } from "./googleAuth";

const { loginMock, initializeMock, logoutMock } = vi.hoisted(() => ({
  loginMock: vi.fn(),
  initializeMock: vi.fn(async () => {}),
  logoutMock: vi.fn(async () => {}),
}));
vi.mock("@capgo/capacitor-social-login", () => ({
  SocialLogin: {
    initialize: initializeMock,
    login: loginMock,
    logout: logoutMock,
  },
}));

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

/**
 * iOS GIDSignIn always stamps a `nonce` into the ID token; if we don't supply
 * one it auto-generates a value we can't read back, so Supabase rejects with
 * "Passed nonce and nonce in id_token should either both exist or not". We
 * therefore supply our own nonce on iOS and forward the same value to
 * signInWithIdToken. Android (Credential Manager) stays nonce-free.
 */
describe("signInWithGoogleNative nonce handling", () => {
  beforeEach(() => {
    loginMock.mockReset();
    loginMock.mockResolvedValue({
      result: { responseType: "online", idToken: "fake-id-token" },
    });
    initializeMock.mockClear();
    logoutMock.mockReset();
    logoutMock.mockResolvedValue(undefined);
  });

  function makeSupabase() {
    const calls: Array<{ provider: string; token: string; nonce?: string }> = [];
    const supabase = {
      auth: {
        signInWithIdToken: vi.fn(
          async (args: { provider: string; token: string; nonce?: string }) => {
            calls.push(args);
            return {
              data: { user: { created_at: new Date().toISOString() } },
              error: null,
            };
          },
        ),
      },
    } as unknown as SupabaseClient;
    return { supabase, calls };
  }

  it("on iOS, passes the HASHED nonce to GIDSignIn and the matching RAW nonce to Supabase", async () => {
    setCapacitor({ getPlatform: () => "ios", isPluginAvailable: () => true });
    const { supabase, calls } = makeSupabase();

    await signInWithGoogleNative(supabase, WEB_CLIENT_ID, IOS_CLIENT_ID);

    const loginArgs = loginMock.mock.calls[0][0] as { options: { nonce?: string } };
    const pluginNonce = loginArgs.options.nonce; // lands verbatim in the token
    const supabaseNonce = calls[0].nonce; // raw — gotrue hashes it
    expect(pluginNonce).toMatch(/^[0-9a-f]{64}$/); // SHA-256 hex
    expect(supabaseNonce).toBeTruthy();
    expect(supabaseNonce).not.toBe(pluginNonce);
    // gotrue SHA-256s the raw nonce and compares to the token claim, so the
    // token (plugin) nonce must equal sha256(rawNonce).
    expect(pluginNonce).toBe(await sha256Hex(supabaseNonce as string));
  });

  it("on iOS, signs out before login so the token isn't a stale cached session", async () => {
    setCapacitor({ getPlatform: () => "ios", isPluginAvailable: () => true });
    const { supabase } = makeSupabase();

    await signInWithGoogleNative(supabase, WEB_CLIENT_ID, IOS_CLIENT_ID);

    expect(logoutMock).toHaveBeenCalledWith({ provider: "google" });
    // logout MUST precede login, or restorePreviousSignIn returns a stale
    // token whose nonce can't match — the persistent "Nonces mismatch".
    expect(logoutMock.mock.invocationCallOrder[0]).toBeLessThan(
      loginMock.mock.invocationCallOrder[0],
    );
  });

  it("on Android, sends no nonce on either side", async () => {
    setCapacitor({ getPlatform: () => "android", isPluginAvailable: () => true });
    const { supabase, calls } = makeSupabase();

    await signInWithGoogleNative(supabase, WEB_CLIENT_ID);

    const loginArgs = loginMock.mock.calls[0][0] as { options: { nonce?: string } };
    expect(loginArgs.options.nonce).toBeUndefined();
    expect(calls[0].nonce).toBeUndefined();
    // Android's working Credential Manager flow is left untouched.
    expect(logoutMock).not.toHaveBeenCalled();
  });
});
