import type { User } from "@supabase/supabase-js";

/**
 * True when the user authenticated through Sign in with Apple.
 *
 * Apple App Store Review Guideline 4.8 forbids re-requesting the name or email
 * that Apple's Authentication Services framework already provides. We use this
 * to suppress the "What should we call you?" name-capture prompt for Apple
 * users — Apple gives us the name on first sign-in (captured in appleAuth.ts),
 * and even when the user declines to share it we must not prompt again.
 *
 * Supabase records the provider in three overlapping places depending on how
 * the account was linked; we check all of them so the detection is robust to
 * single-provider sessions (`app_metadata.provider`), multi-provider accounts
 * (`app_metadata.providers`), and the underlying identity rows.
 */
export function userSignedInWithApple(user: User | null | undefined): boolean {
  if (!user) return false;

  const meta = user.app_metadata ?? {};
  if (meta.provider === "apple") return true;

  const providers = meta.providers;
  if (Array.isArray(providers) && providers.includes("apple")) return true;

  const identities = user.identities;
  if (
    Array.isArray(identities) &&
    identities.some((identity) => identity?.provider === "apple")
  ) {
    return true;
  }

  return false;
}
