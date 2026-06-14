import type { SubscriptionTier } from "./entitlement";
import type { BillingInterval } from "./stripe";

/**
 * Apple In-App Purchase product catalog (one paid tier: Coach).
 *
 * These store product identifiers are the contract between three places that
 * must agree exactly:
 *   1. App Store Connect (the products you create in the subscription group)
 *   2. The RevenueCat dashboard (products attached to the `coach` entitlement)
 *   3. This map (how the RevenueCat webhook turns a product_id back into a tier)
 *
 * If you add/rename a product, change it here AND in both dashboards.
 * There is intentionally no Coach Pro (coach_ai) product — see
 * features.ts: coach_ai is a legacy tier and not sold on new platforms.
 */

export const IAP_COACH_MONTHLY = "com.xogridmaker.app.coach.monthly";
export const IAP_COACH_ANNUAL = "com.xogridmaker.app.coach.annual";

/** RevenueCat entitlement identifier these products grant. Used client-side to
 *  read `customerInfo.entitlements.active[RC_ENTITLEMENT_COACH]`. */
export const RC_ENTITLEMENT_COACH = "coach";

export type IapProduct = {
  storeProductId: string;
  tier: SubscriptionTier;
  interval: BillingInterval;
};

export const IAP_PRODUCTS: readonly IapProduct[] = [
  { storeProductId: IAP_COACH_MONTHLY, tier: "coach", interval: "month" },
  { storeProductId: IAP_COACH_ANNUAL, tier: "coach", interval: "year" },
] as const;

/** Map an App Store product id back to our internal tier + interval, if known. */
export function productForStoreId(storeProductId: string): IapProduct | null {
  return IAP_PRODUCTS.find((p) => p.storeProductId === storeProductId) ?? null;
}

/** The store product id for a given tier + interval, if we sell it via IAP. */
export function storeIdForTier(
  tier: SubscriptionTier,
  interval: BillingInterval,
): string | null {
  return (
    IAP_PRODUCTS.find((p) => p.tier === tier && p.interval === interval)?.storeProductId ?? null
  );
}
