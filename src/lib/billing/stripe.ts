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

/** Per-seat price for the given billing interval, or null if not configured. */
export function seatPriceIdFor(
  config: StripeConfig,
  interval: BillingInterval,
): string | null {
  return interval === "month" ? config.priceIds.seat_month : config.priceIds.seat_year;
}

/** True if the given price ID is one of our configured seat add-on prices. */
export function isSeatPriceId(config: StripeConfig, priceId: string): boolean {
  return priceId === config.priceIds.seat_month || priceId === config.priceIds.seat_year;
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
