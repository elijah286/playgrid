import Stripe from "stripe";
import { getStripeConfig, type StripeConfig } from "@/lib/site/stripe-config";
import type { SubscriptionTier } from "./entitlement";

export type BillingInterval = "month" | "year";

/** Return a Stripe client built from the admin-managed DB config. */
export async function getStripeClient(): Promise<{ stripe: Stripe; config: StripeConfig }> {
  const config = await getStripeConfig();
  if (!config.secretKey) {
    throw new Error("Stripe is not configured. Set the secret key in admin settings.");
  }
  const stripe = new Stripe(config.secretKey);
  return { stripe, config };
}

export function priceIdFor(
  config: StripeConfig,
  tier: SubscriptionTier,
  interval: BillingInterval,
): string | null {
  if (tier === "coach" && interval === "month") return config.priceIds.coach_month;
  if (tier === "coach" && interval === "year") return config.priceIds.coach_year;
  if (tier === "coach_ai" && interval === "month") return config.priceIds.coach_ai_month;
  if (tier === "coach_ai" && interval === "year") return config.priceIds.coach_ai_year;
  return null;
}

/** Map a Stripe price ID back to our internal tier + interval, if configured. */
export function tierForPriceId(
  config: StripeConfig,
  priceId: string,
): { tier: SubscriptionTier; interval: BillingInterval } | null {
  if (priceId === config.priceIds.coach_month) return { tier: "coach", interval: "month" };
  if (priceId === config.priceIds.coach_year) return { tier: "coach", interval: "year" };
  if (priceId === config.priceIds.coach_ai_month) return { tier: "coach_ai", interval: "month" };
  if (priceId === config.priceIds.coach_ai_year) return { tier: "coach_ai", interval: "year" };
  return null;
}
