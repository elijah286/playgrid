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

let initializedForClientId: string | null = null;
let initPromise: Promise<unknown> | null = null;

async function ensureInitialized(webClientId: string) {
  // Re-initialize if the client ID changed (e.g., admin rotated it
  // mid-session). The plugin's initialize() is safe to call multiple
  // times; later calls overwrite the prior config.
  if (initializedForClientId === webClientId && initPromise) return initPromise;
  initPromise = (async () => {
    const { SocialLogin } = await import("@capgo/capacitor-social-login");
    await SocialLogin.initialize({
      google: {
        webClientId,
        // iOSClientId left unset until the iOS OAuth client is created
        // in Google Cloud (separate ClientID per platform). Wire it
        // through site_settings the same way when iOS ships.
        mode: "online",
      },
    });
    return SocialLogin;
  })();
  initializedForClientId = webClientId;
  return initPromise;
}

/**
 * True when (a) a Web Client ID is configured in site_settings and
 * (b) the Capacitor native shell has the SocialLogin plugin registered.
 * The plugin check matters because the live website JS is fetched by
 * every installed app version — an old APK that shipped before this
 * plugin was added will load the new JS but lacks the native bridge
 * code, so we hide the button rather than crash on click.
 */
export function canUseNativeGoogleAuth(
  webClientId: string | null | undefined,
): boolean {
  if (!webClientId) return false;
  if (typeof window === "undefined") return false;
  const cap = (window as unknown as {
    Capacitor?: { isPluginAvailable?: (name: string) => boolean };
  }).Capacitor;
  try {
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
): Promise<NativeGoogleSignInResult> {
  const { SocialLogin } = await import("@capgo/capacitor-social-login");
  await ensureInitialized(webClientId);

  // Nonce binds the ID token to this specific sign-in attempt so a stolen
  // token can't be replayed. Google embeds the nonce verbatim in the JWT;
  // Supabase compares the value we pass to the JWT claim.
  const nonce =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);

  // Don't pass `scopes` here — the @capgo plugin rejects scope requests
  // unless MainActivity.java is modified to handle the auth-code callback
  // ("You CANNOT use scopes without modifying the main activity"). For
  // signInWithIdToken we only need the bare ID token, and Google
  // automatically embeds the email + profile claims in the JWT via the
  // implicit `openid profile email` scopes — no explicit request needed.
  const login = await SocialLogin.login({
    provider: "google",
    options: { nonce },
  });

  if (login.result.responseType !== "online" || !login.result.idToken) {
    throw new Error("Google sign-in did not return an ID token.");
  }

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: "google",
    token: login.result.idToken,
    nonce,
  });
  if (error) throw error;

  const createdAt = data.user?.created_at
    ? new Date(data.user.created_at).getTime()
    : 0;
  const isFreshSignup =
    Number.isFinite(createdAt) && Date.now() - createdAt < 5 * 60_000;

  return { isFreshSignup };
}
