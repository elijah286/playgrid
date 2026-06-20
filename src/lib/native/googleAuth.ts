/**
 * Native Google Sign-In bridge for the Capacitor wrapper.
 *
 * Web flow goes through Supabase's hosted OAuth (page redirect). That path
 * is broken inside a WebView — Google's OAuth endpoints have refused
 * WebView user agents since 2021 to defeat credential-phishing apps. The
 * native flow here uses Android/iOS's system Google Sign-In SDK to obtain
 * an ID token, then hands that to Supabase's `signInWithIdToken` so the
 * user ends up with a normal Supabase session — no browser, no callback.
 *
 * The Web Client ID is supplied at runtime (read from `site_settings`
 * server-side and passed down as a prop) rather than baked in as an env
 * var — that way the Site Admin can rotate it without redeploying.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { randomNonce, sha256Hex } from "./appleAuth";
import { nativePlatform } from "./isNativeApp";
import { syncNativeSessionToServer } from "./serverSession";

let initializedForKey: string | null = null;
let initPromise: Promise<unknown> | null = null;

async function ensureInitialized(webClientId: string, iosClientId?: string | null) {
  // Re-initialize if either client ID changed (e.g., admin rotated one
  // mid-session). The plugin's initialize() is safe to call multiple
  // times; later calls overwrite the prior config.
  const key = `${webClientId}|${iosClientId ?? ""}`;
  if (initializedForKey === key && initPromise) return initPromise;
  initPromise = (async () => {
    const { SocialLogin } = await import("@capgo/capacitor-social-login");
    await SocialLogin.initialize({
      google: {
        // Android reads webClientId. iOS reads iOSClientId (the system
        // Google SDK's clientID, an iOS-type OAuth client) plus
        // iOSServerClientId — the web client ID, per the plugin docs — so
        // the minted ID token's audience is one Supabase already trusts.
        webClientId,
        iOSClientId: iosClientId ?? undefined,
        iOSServerClientId: iosClientId ? webClientId : undefined,
        mode: "online",
      },
    });
    return SocialLogin;
  })();
  initializedForKey = key;
  return initPromise;
}

/**
 * True when (a) a Web Client ID is configured in site_settings,
 * (b) we're on Android (native Google sign-in is Android-only today),
 * and (c) the Capacitor native shell has the SocialLogin plugin registered.
 *
 * The plugin check matters because the live website JS is fetched by
 * every installed app version — an old APK that shipped before this
 * plugin was added will load the new JS but lacks the native bridge
 * code, so we hide the button rather than crash on click.
 *
 * iOS needs its own iOS-type OAuth client: `iosClientId` plumbed through
 * site_settings (the @capgo plugin's iOS `initialize()` ignores
 * `webClientId` and registers no provider without an `iOSClientId`, which
 * produced the "No provider was initialized" red error) AND the
 * reversed-client-ID URL scheme baked into the iOS binary's Info.plist.
 * When no iOS client ID is configured we hide the button on iOS so those
 * users fall back to email / Apple sign-in.
 */
export function canUseNativeGoogleAuth(
  webClientId: string | null | undefined,
  iosClientId?: string | null | undefined,
): boolean {
  if (typeof window === "undefined") return false;
  const platform = nativePlatform();
  if (platform === "web") return false;
  // Per-platform credential requirement: Android signs in with the web
  // client ID; iOS needs its own iOS-type client ID (the web client ID
  // rides along as the server client, but the SDK won't init without the
  // iOS one). Require the right credential so we never show a button that
  // can't complete the flow.
  if (platform === "android" && !webClientId) return false;
  if (platform === "ios" && !iosClientId) return false;
  const cap = (window as unknown as {
    Capacitor?: { isPluginAvailable?: (name: string) => boolean };
  }).Capacitor;
  try {
    // Guards old builds: JS is fetched from the live site, but an installed
    // binary that predates the SocialLogin plugin lacks the native bridge,
    // so hide the button rather than crash on click.
    return cap?.isPluginAvailable?.("SocialLogin") ?? false;
  } catch {
    return false;
  }
}

export type NativeGoogleSignInResult = {
  /** Brand-new Supabase user vs. returning. Used by AuthFlow to fire the
   *  Reddit signup pixel + run first-touch attribution snapshot, matching
   *  what the web OAuth callback does server-side. */
  isFreshSignup: boolean;
};

/**
 * Runs the full native Google sign-in flow and hands the resulting ID
 * token to Supabase. Returns a flag so callers can branch on whether this
 * was a brand-new signup (for analytics + onboarding side-effects).
 */
export async function signInWithGoogleNative(
  supabase: SupabaseClient,
  webClientId: string,
  iosClientId?: string | null,
): Promise<NativeGoogleSignInResult> {
  const { SocialLogin } = await import("@capgo/capacitor-social-login");
  await ensureInitialized(webClientId, iosClientId);

  // Don't pass `scopes` here — the @capgo plugin rejects scope requests
  // unless MainActivity.java is modified to handle the auth-code callback
  // ("You CANNOT use scopes without modifying the main activity"). For
  // signInWithIdToken we only need the bare ID token, and Google
  // automatically embeds the email + profile claims in the JWT via the
  // implicit `openid profile email` scopes — no explicit request needed.
  //
  // Nonce handling is per-platform:
  //   • iOS: GoogleSignIn-iOS (GIDSignIn) ALWAYS stamps a `nonce` claim into
  //     the ID token, so Supabase requires a matching nonce from us. Generate
  //     a raw nonce, SHA-256 it, and pass the HASH to the plugin — @capgo sets
  //     request.nonce verbatim, so the token's claim becomes the hash — while
  //     passing the RAW value to signInWithIdToken, which gotrue hashes and
  //     compares to the claim. Same direction as the working Apple flow
  //     (appleAuth.ts). Passing the raw value to BOTH sides instead produced
  //     "Nonces mismatch"; passing none produced "Passed nonce and nonce in
  //     id_token should either both exist or not."
  //   • Android (Credential Manager): left nonce-free. With no nonce requested
  //     its token carries no nonce claim, so both-absent satisfies the gotrue
  //     check; supplying one risks a hash-direction mismatch.
  // Replay protection comes from the token's 1-hour expiry + HTTPS transport.
  const isIos = nativePlatform() === "ios";
  const rawNonce = isIos ? randomNonce() : undefined;
  const hashedNonce = rawNonce ? await sha256Hex(rawNonce) : undefined;

  // Force a fresh interactive sign-in on iOS. The @capgo iOS provider
  // short-circuits to GIDSignIn.restorePreviousSignIn() once a session is
  // cached (GoogleProvider.swift), returning a STALE id_token whose nonce was
  // minted on an earlier attempt — so the nonce we generate now can never
  // match it, a persistent "Nonces mismatch" even with the hash direction
  // correct. Signing out first clears the cached session so login() performs a
  // real sign-in that embeds the current nonce. Android (Credential Manager,
  // already working) is left untouched.
  if (isIos) {
    try {
      await SocialLogin.logout({ provider: "google" });
    } catch {
      // No active Google session to clear — expected on first sign-in.
    }
  }

  const login = await SocialLogin.login({
    provider: "google",
    options: hashedNonce ? { nonce: hashedNonce } : {},
  });

  if (login.result.responseType !== "online" || !login.result.idToken) {
    throw new Error("Google sign-in did not return an ID token.");
  }

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: "google",
    token: login.result.idToken,
    // Raw nonce; gotrue hashes it and compares to the token's hashed claim.
    // undefined on Android (no nonce — see above).
    nonce: rawNonce,
  });
  if (error) throw error;

  // Establish the session server-side before the caller navigates — same
  // WKWebView cookie-flush race the Apple flow hits. See serverSession.ts.
  await syncNativeSessionToServer(data.session);

  const createdAt = data.user?.created_at
    ? new Date(data.user.created_at).getTime()
    : 0;
  const isFreshSignup =
    Number.isFinite(createdAt) && Date.now() - createdAt < 5 * 60_000;

  return { isFreshSignup };
}
