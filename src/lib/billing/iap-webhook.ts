import { productForStoreId } from "./iap-products";
import type { SubscriptionTier } from "./entitlement";

// Pure mapping core for the RevenueCat webhook (src/app/api/revenuecat/webhook).
// Intentionally free of server/DB/HTTP imports so the golden tests can drive one
// payload per event type directly. The route is a thin I/O shell that auths the
// request, calls buildIapSubscriptionRow, and upserts the result.

const APPLE_STORES = new Set(["APP_STORE", "MAC_APP_STORE"]);
const TRIAL_PERIODS = new Set(["TRIAL", "INTRO"]);

export type RevenueCatEvent = {
  type?: string;
  app_user_id?: string;
  original_app_user_id?: string;
  aliases?: string[];
  product_id?: string;
  entitlement_ids?: string[] | null;
  period_type?: string;
  expiration_at_ms?: number | null;
  environment?: string;
  store?: string;
  transaction_id?: string;
  original_transaction_id?: string;
};

export type IapStatus =
  | "active"
  | "trialing"
  | "in_grace_period"
  | "billing_retry"
  | "canceled"
  | "expired"
  | "paused";

export type IapSubscriptionRow = {
  user_id: string;
  provider: "apple";
  tier: SubscriptionTier;
  status: IapStatus;
  store_product_id: string;
  rc_app_user_id: string | null;
  rc_entitlement_id: string | null;
  original_transaction_id: string;
  current_period_end: string | null;
  billing_interval: "month" | "year" | null;
  environment: "sandbox" | "production";
  auto_renew_status: boolean;
  last_event_type: string | null;
  updated_at: string;
};

/** RevenueCat's app_user_id is the value we pass to Purchases.logIn (our Supabase
 *  user id). If a purchase raced ahead of login it can be an anonymous id; fall
 *  back to original_app_user_id / aliases for the first real (non-anonymous) id. */
export function resolveRevenueCatUserId(event: RevenueCatEvent): string | null {
  const candidates = [
    event.app_user_id,
    event.original_app_user_id,
    ...(event.aliases ?? []),
  ];
  for (const c of candidates) {
    if (c && !c.startsWith("$RCAnonymousID:")) return c;
  }
  return null;
}

/**
 * Derive our normalized (status, auto_renew) from the event type + expiry.
 * Expiry is the backstop source of truth: a refund pushes expiration into the
 * past (or an EXPIRATION event follows), so "still entitled?" keys off it rather
 * than trying to interpret every cancel_reason.
 */
export function reconcileIapStatus(
  event: RevenueCatEvent,
  nowMs: number,
): { status: IapStatus; autoRenew: boolean } {
  const exp = event.expiration_at_ms ?? null;
  const entitledByExpiry = exp != null && exp > nowMs;
  const isTrial = event.period_type ? TRIAL_PERIODS.has(event.period_type) : false;
  const liveStatus: IapStatus = isTrial ? "trialing" : "active";

  switch (event.type) {
    case "EXPIRATION":
      return { status: "expired", autoRenew: false };
    case "SUBSCRIPTION_PAUSED":
      return { status: "paused", autoRenew: false };
    case "BILLING_ISSUE":
      // Apple is retrying the charge; the user keeps access during grace.
      return { status: "in_grace_period", autoRenew: true };
    case "CANCELLATION":
      // Auto-renew off (or refunded). Entitled until expiry; expiry decides.
      return { status: entitledByExpiry ? liveStatus : "expired", autoRenew: false };
    default:
      // INITIAL_PURCHASE, RENEWAL, UNCANCELLATION, PRODUCT_CHANGE,
      // SUBSCRIPTION_EXTENDED, etc. — active while expiry is in the future.
      return { status: entitledByExpiry ? liveStatus : "expired", autoRenew: true };
  }
}

export type BuildResult =
  | { ok: true; row: IapSubscriptionRow }
  | { ok: false; reason: string };

/** Turn a RevenueCat event into the row to upsert, or a skip reason. Pure. */
export function buildIapSubscriptionRow(
  event: RevenueCatEvent,
  nowMs: number,
): BuildResult {
  if (event.store && !APPLE_STORES.has(event.store)) {
    return { ok: false, reason: `non-apple store ${event.store}` };
  }
  const originalTxnId = event.original_transaction_id ?? event.transaction_id ?? null;
  if (!originalTxnId) return { ok: false, reason: "no original_transaction_id" };

  const productId = event.product_id ?? null;
  if (!productId) return { ok: false, reason: "no product_id" };
  const product = productForStoreId(productId);
  if (!product) return { ok: false, reason: `unknown product ${productId}` };

  const userId = resolveRevenueCatUserId(event);
  if (!userId) return { ok: false, reason: "unresolved (anonymous) app_user_id" };

  const { status, autoRenew } = reconcileIapStatus(event, nowMs);

  return {
    ok: true,
    row: {
      user_id: userId,
      provider: "apple",
      tier: product.tier,
      status,
      store_product_id: productId,
      rc_app_user_id: event.app_user_id ?? null,
      rc_entitlement_id: event.entitlement_ids?.[0] ?? null,
      original_transaction_id: originalTxnId,
      current_period_end: event.expiration_at_ms
        ? new Date(event.expiration_at_ms).toISOString()
        : null,
      billing_interval: product.interval,
      environment: event.environment === "SANDBOX" ? "sandbox" : "production",
      auto_renew_status: autoRenew,
      last_event_type: event.type ?? null,
      updated_at: new Date(nowMs).toISOString(),
    },
  };
}
