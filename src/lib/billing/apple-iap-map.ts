import type { JWSTransactionDecodedPayload } from "@apple/app-store-server-library";
import { productForStoreId } from "./iap-products";
import type { SubscriptionTier } from "./entitlement";

// Pure mapping core for Apple IAP: a verified StoreKit / notification transaction
// → our iap_subscriptions row. No verification, no DB, and only a TYPE import from
// the Apple library, so the golden tests run standalone. The verifier I/O lives in
// apple-iap.ts; the route shells call verify → buildIapRowFromTransaction → upsert.

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
  rc_app_user_id: string | null; // legacy column name; holds the appAccountToken
  rc_entitlement_id: string | null; // legacy column; null for pure Apple
  original_transaction_id: string;
  current_period_end: string | null;
  billing_interval: "month" | "year" | null;
  environment: "sandbox" | "production";
  auto_renew_status: boolean;
  last_event_type: string | null;
  updated_at: string;
};

/**
 * Derive (status, auto_renew) from the transaction + optional notification type.
 * Refund/revoke → expired. Otherwise expiry decides, refined by the notification:
 * grace period keeps access; billing-retry (after grace) does not; an auto-renew
 * toggle keeps access until expiry.
 */
export function deriveAppleStatus(opts: {
  expiresDateMs: number | null;
  revocationDateMs: number | null;
  nowMs: number;
  isTrial: boolean;
  notificationType?: string;
  subtype?: string;
}): { status: IapStatus; autoRenew: boolean } {
  const { expiresDateMs, revocationDateMs, nowMs, isTrial, notificationType, subtype } = opts;
  if (revocationDateMs != null) return { status: "expired", autoRenew: false };
  const entitledByExpiry = expiresDateMs != null && expiresDateMs > nowMs;
  const live: IapStatus = isTrial ? "trialing" : "active";

  switch (notificationType) {
    case "EXPIRED":
    case "GRACE_PERIOD_EXPIRED":
    case "REFUND":
    case "REVOKE":
      return { status: "expired", autoRenew: false };
    case "DID_FAIL_TO_RENEW":
      return subtype === "GRACE_PERIOD"
        ? { status: "in_grace_period", autoRenew: true }
        : { status: "billing_retry", autoRenew: true };
    case "DID_CHANGE_RENEWAL_STATUS":
      return {
        status: entitledByExpiry ? live : "expired",
        autoRenew: subtype !== "AUTO_RENEW_DISABLED",
      };
    default:
      // SUBSCRIBED, DID_RENEW, OFFER_REDEEMED, and the client verify-endpoint path.
      return { status: entitledByExpiry ? live : "expired", autoRenew: true };
  }
}

export type AppleBuildResult =
  | { ok: true; row: IapSubscriptionRow }
  | { ok: false; reason: string };

/** Verified Apple transaction → iap_subscriptions row, or a skip reason. Pure.
 *  userId comes from the authenticated session (verify path) or the transaction's
 *  appAccountToken (notification path); the route resolves it and passes it in. */
export function buildIapRowFromTransaction(
  tx: JWSTransactionDecodedPayload,
  opts: { userId?: string | null; nowMs: number; notificationType?: string; subtype?: string },
): AppleBuildResult {
  const productId = tx.productId ?? null;
  if (!productId) return { ok: false, reason: "no productId" };
  const product = productForStoreId(productId);
  if (!product) return { ok: false, reason: `unknown product ${productId}` };

  const originalTxnId = tx.originalTransactionId ?? tx.transactionId ?? null;
  if (!originalTxnId) return { ok: false, reason: "no originalTransactionId" };

  const userId = opts.userId ?? tx.appAccountToken ?? null;
  if (!userId) return { ok: false, reason: "unresolved user (no appAccountToken)" };

  const isTrial = (tx.offerDiscountType as string | undefined) === "FREE_TRIAL";
  const { status, autoRenew } = deriveAppleStatus({
    expiresDateMs: tx.expiresDate ?? null,
    revocationDateMs: tx.revocationDate ?? null,
    nowMs: opts.nowMs,
    isTrial,
    notificationType: opts.notificationType,
    subtype: opts.subtype,
  });

  return {
    ok: true,
    row: {
      user_id: userId,
      provider: "apple",
      tier: product.tier,
      status,
      store_product_id: productId,
      rc_app_user_id: tx.appAccountToken ?? null,
      rc_entitlement_id: null,
      original_transaction_id: originalTxnId,
      current_period_end: tx.expiresDate ? new Date(tx.expiresDate).toISOString() : null,
      billing_interval: product.interval,
      environment: (tx.environment as string | undefined) === "Sandbox" ? "sandbox" : "production",
      auto_renew_status: autoRenew,
      last_event_type: opts.notificationType ?? "VERIFY",
      updated_at: new Date(opts.nowMs).toISOString(),
    },
  };
}
