import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getRequestUser } from "@/lib/supabase/request-user";

export type SubscriptionTier = "free" | "coach" | "coach_ai";
// "apple" = an App Store (StoreKit) subscription (see iap_subscriptions).
// Managed in Apple's UI, not the Stripe billing portal — the "manage plan"
// surface branches on this.
export type EntitlementSource = "comp" | "stripe" | "apple" | "free";

export type Entitlement = {
  userId: string;
  tier: SubscriptionTier;
  source: EntitlementSource;
  expiresAt: string | null;
  compGrantId: string | null;
  subscriptionId: string | null;
  iapSubscriptionId: string | null;
};

const FREE: Omit<Entitlement, "userId"> = {
  tier: "free",
  source: "free",
  expiresAt: null,
  compGrantId: null,
  subscriptionId: null,
  iapSubscriptionId: null,
};

function fromRow(userId: string, row: Record<string, unknown> | null): Entitlement {
  if (!row) return { userId, ...FREE };
  return {
    userId,
    tier: (row.tier as SubscriptionTier) ?? "free",
    source: (row.source as EntitlementSource) ?? "free",
    expiresAt: (row.expires_at as string | null) ?? null,
    compGrantId: (row.comp_grant_id as string | null) ?? null,
    subscriptionId: (row.subscription_id as string | null) ?? null,
    iapSubscriptionId: (row.iap_subscription_id as string | null) ?? null,
  };
}

/**
 * Entitlement for the currently authenticated user, time-bounded.
 *
 * Testable implementation behind {@link getCurrentEntitlement}. Resolves the
 * user via the shared request-scoped {@link getRequestUser} (no second
 * getUser() round-trip), then reads `user_entitlements` with the RLS-scoped
 * anon client. Returns null when unauthenticated (including an auth
 * timeout); otherwise an Entitlement — free when the user has no row.
 */
export async function loadCurrentEntitlement(): Promise<Entitlement | null> {
  const authResult = await getRequestUser();
  const user = authResult.kind === "ok" ? authResult.user : null;
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("user_entitlements")
    .select("tier, source, expires_at, comp_grant_id, subscription_id, iap_subscription_id")
    .eq("user_id", user.id)
    .maybeSingle();
  return fromRow(user.id, data);
}

/**
 * Entitlement for the currently authenticated user. Returns null if
 * unauthenticated.
 *
 * Request-memoized: this is read on most authed SSR pages AND in the
 * SiteHeader + GlobalBottomNav that render alongside them, so a single
 * navigation used to fire it 3+ times — each doing its own getUser() +
 * entitlements query. React cache() collapses those into one per request.
 * (getBetaFeatures is already unstable_cache-backed; this closes the
 * matching gap for billing.)
 */
export const getCurrentEntitlement = cache(loadCurrentEntitlement);

/** Entitlement for any user (admin/server use). Uses service role — never call from client code paths that leak data. */
export async function getUserEntitlement(userId: string): Promise<Entitlement> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("user_entitlements")
    .select("tier, source, expires_at, comp_grant_id, subscription_id, iap_subscription_id")
    .eq("user_id", userId)
    .maybeSingle();
  return fromRow(userId, data);
}

/**
 * True iff this user has ever had a `coach_ai` Stripe subscription (any
 * status — `active`, `canceled`, `trialing`, `incomplete_expired`, etc.).
 *
 * This is the same gate `createCheckoutSessionAction` uses to decide
 * whether to grant the Coach Pro free trial — once you've held the
 * subscription once you can't get the trial again. Pulled out so the
 * UI can mirror the gate and hide trial CTAs / "no charge today"
 * footnotes from users who'd be billed in full at checkout.
 *
 * Returns false on any error so we err on the side of *showing* trial
 * copy — Stripe will still refuse to grant the trial server-side, but
 * the UI won't have over-promised.
 */
export async function hasUsedCoachProTrial(userId: string): Promise<boolean> {
  try {
    const admin = createServiceRoleClient();
    const { data } = await admin
      .from("subscriptions")
      .select("id")
      .eq("user_id", userId)
      .eq("tier", "coach_ai")
      .limit(1)
      .maybeSingle();
    return Boolean(data);
  } catch {
    return false;
  }
}
