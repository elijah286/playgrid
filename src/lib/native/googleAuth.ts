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
 * Initialization is lazy + memoized: the plugin only loads when the user
 * actually taps the button, keeping cold-start cost out of the boot path
 * for the (vast majority of) sessions that never touch Google sign-in.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

const WEB_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_OAUTH_WEB_CLIENT_ID;

let initPromise: Promise<unknown> | null = null;

async function ensureInitialized() {
  if (!WEB_CLIENT_ID) {
    throw new Error(
      "NEXT_PUBLIC_GOOGLE_OAUTH_WEB_CLIENT_ID is not set — native Google sign-in is unavailable.",
    );
  }
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const { SocialLogin } = await import("@capgo/capacitor-social-login");
    await SocialLogin.initialize({
      google: {
        webClientId: WEB_CLIENT_ID,
        // iOSClientId is left unset until the iOS OAuth client is created
        // in Google Cloud (separate ClientID per platform is required by
        // Apple's review). When we ship iOS, set it via env var here too.
        mode: "online",
      },
    });
    return SocialLogin;
  })();
  return initPromise;
}

/**
 * True when (a) the plugin's web client ID env var is set and (b) the
 * Capacitor native shell has the SocialLogin plugin registered. The
 * second check matters because the live website JS is fetched by every
 * installed app version — an old APK that shipped before this plugin
 * was added will load the new JS but lacks the native bridge code, so
 * we hide the button rather than crash on click.
 */
export function canUseNativeGoogleAuth(): boolean {
  if (!WEB_CLIENT_ID) return false;
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
): Promise<NativeGoogleSignInResult> {
  const { SocialLogin } = await import("@capgo/capacitor-social-login");
  await ensureInitialized();

  // Nonce binds the ID token to this specific sign-in attempt so a stolen
  // token can't be replayed. Google embeds the nonce verbatim in the JWT;
  // Supabase compares the value we pass to the JWT claim.
  const nonce =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);

  const login = await SocialLogin.login({
    provider: "google",
    options: { scopes: ["email", "profile"], nonce },
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
