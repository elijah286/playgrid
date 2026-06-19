/**
 * Native Sign in with Apple bridge for the Capacitor wrapper (iOS).
 *
 * Web flow goes through Supabase's hosted OAuth (page redirect) and works
 * fine in any browser — including a Windows/Android laptop — via Apple's
 * web auth page. That path is the fallback handled in AuthFlow.
 *
 * On iOS we use the system Sign in with Apple sheet (ASAuthorization, via
 * @capgo/capacitor-social-login) to obtain an identity token, then hand it
 * to Supabase's `signInWithIdToken` so the user ends up with a normal
 * Supabase session — native sheet, no browser, no callback. This is also
 * what App Store Review Guideline 4.8 expects: the native Apple experience,
 * not a web redirect, when the app offers other social logins.
 *
 * Nonce handling — the subtle part:
 *   Supabase verifies the Apple nonce by SHA-256-hashing the raw value you
 *   pass to `signInWithIdToken` and comparing it to the `nonce` claim baked
 *   into the identity token. Apple embeds whatever we set on the request
 *   verbatim, and the @capgo plugin sets `request.nonce` verbatim too (it
 *   does NOT hash — see AppleProvider.swift). So WE must hash:
 *     - pass the SHA-256 hash to the plugin / Apple,
 *     - pass the RAW value to Supabase.
 *   (This is the opposite of the Google path, where Supabase compares the
 *   nonce verbatim, which is why googleAuth.ts passes no nonce at all.)
 */
import type { SupabaseClient } from "@supabase/supabase-js";

let initialized = false;
let initPromise: Promise<unknown> | null = null;

async function ensureInitialized() {
  if (initialized && initPromise) return initPromise;
  initPromise = (async () => {
    const { SocialLogin } = await import("@capgo/capacitor-social-login");
    await SocialLogin.initialize({
      apple: {
        // clientId / redirectUrl are only consumed by the web + Android
        // fallback inside the plugin. On iOS the native ASAuthorization
        // flow uses the app's bundle ID as the implicit audience, so no
        // client ID is needed here. An empty redirectUrl tells the plugin
        // not to attempt a web redirect on iOS.
        redirectUrl: "",
      },
    });
    return SocialLogin;
  })();
  initialized = true;
  return initPromise;
}

/**
 * Cryptographically-random nonce string. URL-safe alphabet so it survives
 * being embedded in a JWT claim without escaping surprises.
 */
export function randomNonce(length = 32): string {
  const charset =
    "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-._";
  const values = new Uint8Array(length);
  crypto.getRandomValues(values);
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += charset[values[i] % charset.length];
  }
  return out;
}

/** Lowercase hex SHA-256 of the input, computed with Web Crypto. */
export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * True when the native Sign in with Apple flow is available: we are inside
 * the iOS Capacitor shell AND that shell has the SocialLogin plugin
 * registered. The plugin check matters because every installed build loads
 * the live website JS — an older iOS build that shipped before this plugin
 * was added would have the new JS but lack the native bridge, so we hide
 * the button rather than crash on tap. Android intentionally returns false
 * here: Android users get Google + email, and Apple sign-in there would
 * route through the web fallback (which still works if ever needed).
 */
export function canUseNativeAppleAuth(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (
    window as unknown as {
      Capacitor?: {
        getPlatform?: () => string;
        isPluginAvailable?: (name: string) => boolean;
      };
    }
  ).Capacitor;
  try {
    if (cap?.getPlatform?.() !== "ios") return false;
    return cap?.isPluginAvailable?.("SocialLogin") ?? false;
  } catch {
    return false;
  }
}

export type NativeAppleSignInResult = {
  /** Brand-new Supabase user vs. returning. Lets AuthFlow fire the Reddit
   *  signup pixel + first-touch attribution snapshot, matching what the web
   *  OAuth callback does server-side. */
  isFreshSignup: boolean;
  /** The display name Apple supplied (given + family), or null when the user
   *  declined to share it or is a returning user (Apple only sends the name on
   *  the very first authorization). App Store Guideline 4.8 requires us to USE
   *  this rather than re-prompt — AuthFlow writes it to profiles.display_name. */
  displayName: string | null;
};

/**
 * Join Apple's name components into a single display name, or null when neither
 * is present. Pure + exported for unit testing. Apple only returns these on the
 * first sign-in for a given Apple ID, so a null result is the common case for
 * returning users.
 */
export function appleDisplayName(
  profile: { givenName?: string | null; familyName?: string | null } | null | undefined,
): string | null {
  if (!profile) return null;
  const name = [profile.givenName, profile.familyName]
    .map((part) => (part ?? "").trim())
    .filter(Boolean)
    .join(" ")
    .trim();
  return name.length > 0 ? name : null;
}

/**
 * Runs the full native Sign in with Apple flow and hands the resulting
 * identity token to Supabase. Returns a flag so callers can branch on
 * whether this was a brand-new signup (for analytics + onboarding).
 */
export async function signInWithAppleNative(
  supabase: SupabaseClient,
): Promise<NativeAppleSignInResult> {
  const { SocialLogin } = await import("@capgo/capacitor-social-login");
  await ensureInitialized();

  const rawNonce = randomNonce();
  const hashedNonce = await sha256Hex(rawNonce);

  const login = await SocialLogin.login({
    provider: "apple",
    options: {
      scopes: ["name", "email"],
      nonce: hashedNonce,
    },
  });

  const result = login.result as
    | {
        idToken?: string | null;
        profile?: { givenName?: string | null; familyName?: string | null } | null;
      }
    | null;
  const idToken = result?.idToken;
  if (!idToken) {
    throw new Error("Apple sign-in did not return an identity token.");
  }

  // Apple hands us the user's name in the login response — but ONLY on the
  // first authorization for this Apple ID. Capture it here so the caller can
  // persist it; this is the data App Store Guideline 4.8 says we must use
  // instead of re-prompting via the name-capture modal.
  const displayName = appleDisplayName(result?.profile);

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: "apple",
    token: idToken,
    nonce: rawNonce,
  });
  if (error) throw error;

  const createdAt = data.user?.created_at
    ? new Date(data.user.created_at).getTime()
    : 0;
  const isFreshSignup =
    Number.isFinite(createdAt) && Date.now() - createdAt < 5 * 60_000;

  return { isFreshSignup, displayName };
}
