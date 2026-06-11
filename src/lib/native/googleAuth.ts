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
import { nativePlatform } from "./isNativeApp";

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
  // No `nonce` either: Google's Credential Manager API may or may not
  // SHA-256 hash the nonce before embedding it in the JWT claim depending
  // on the SDK version, and Supabase compares the value verbatim for
  // Google providers (it doesn't hash like it does for Apple). The
  // resulting ambiguity produces "Nonces mismatch" rejection. Matches
  // Supabase's own React Native example for Google sign-in. Replay
  // protection comes from the token's 1-hour expiry + HTTPS transport.
  const login = await SocialLogin.login({
    provider: "google",
    options: {},
  });

  if (login.result.responseType !== "online" || !login.result.idToken) {
    throw new Error("Google sign-in did not return an ID token.");
  }

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: "google",
    token: login.result.idToken,
  });
  if (error) throw error;

  const createdAt = data.user?.created_at
    ? new Date(data.user.created_at).getTime()
    : 0;
  const isFreshSignup =
    Number.isFinite(createdAt) && Date.now() - createdAt < 5 * 60_000;

  return { isFreshSignup };
}
