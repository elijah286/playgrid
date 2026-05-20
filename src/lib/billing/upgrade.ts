import type Stripe from "stripe";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { isSeatPriceId, tierForPriceId, priceIdFor, getStripeClient, type BillingInterval } from "@/lib/billing/stripe";
import type { StripeConfig } from "@/lib/site/stripe-config";
import type { SubscriptionTier } from "@/lib/billing/entitlement";

/**
 * Tier comparison and in-place subscription change helpers.
 *
 * Designed so the server actions are thin auth wrappers — the meat lives
 * here and is easy to unit-test by injecting a fake Stripe client.
 */

export const TIER_RANK: Record<SubscriptionTier, number> = {
  free: 0,
  coach: 1,
  coach_ai: 2,
};

export function isUpgrade(from: SubscriptionTier, to: SubscriptionTier): boolean {
  return TIER_RANK[to] > TIER_RANK[from];
}

export function isDowngrade(from: SubscriptionTier, to: SubscriptionTier): boolean {
  return TIER_RANK[to] < TIER_RANK[from];
}

/** Find the non-seat (base tier) item on a Stripe subscription. */
export function findTierItem(
  sub: Stripe.Subscription,
  config: StripeConfig,
): Stripe.SubscriptionItem | null {
  return (
    sub.items.data.find(
      (i) =>
        !isSeatPriceId(config, i.price.id) &&
        tierForPriceId(config, i.price.id) !== null,
    ) ?? null
  );
}

export type ActivePaidSubscription = {
  id: string;
  stripeSubscriptionId: string;
  stripeCustomerId: string | null;
  tier: SubscriptionTier;
  billingInterval: BillingInterval | null;
  status: string;
};

/**
 * Look up the user's active paid (Stripe-backed) subscriptions.
 *
 * Multiple rows is a legacy bug state from the pre-2026-05-20 double-billing
 * window. Callers must refuse to upgrade when length > 1 and surface a
 * "contact support" error so we hand-clean those accounts.
 */
export async function getActivePaidSubscriptions(
  userId: string,
): Promise<ActivePaidSubscription[]> {
  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from("subscriptions")
    .select(
      "id, stripe_subscription_id, stripe_customer_id, tier, billing_interval, status",
    )
    .eq("user_id", userId)
    .not("stripe_subscription_id", "is", null)
    .in("status", ["active", "trialing", "past_due"]);
  if (error) throw new Error(`subscriptions lookup failed: ${error.message}`);
  return (data ?? [])
    .filter((r) => r.tier === "coach" || r.tier === "coach_ai")
    .map((r) => ({
      id: r.id as string,
      stripeSubscriptionId: r.stripe_subscription_id as string,
      stripeCustomerId: (r.stripe_customer_id as string | null) ?? null,
      tier: r.tier as SubscriptionTier,
      billingInterval: (r.billing_interval as BillingInterval | null) ?? null,
      status: r.status as string,
    }));
}

export type SubscriptionChangePreview = {
  amountDueNow: number;
  currency: string;
  lines: Array<{ description: string; amount: number }>;
  nextRenewalAt: string | null;
};

type UpgradeOk<T> = { ok: true } & T;
type UpgradeErr = { ok: false; error: string };

/**
 * Compute the proration preview for changing a user's active subscription
 * to `targetTier` / `targetInterval`. Returns the amount due today and the
 * line-item breakdown, or an error explaining why the change isn't allowed.
 *
 * Refuses non-upgrades; downgrades take a different path (subscription
 * schedules — see Phase 2).
 */
export async function previewSubscriptionChange(
  userId: string,
  targetTier: Exclude<SubscriptionTier, "free">,
  targetInterval: BillingInterval,
): Promise<UpgradeOk<SubscriptionChangePreview> | UpgradeErr> {
  const subs = await getActivePaidSubscriptions(userId);
  if (subs.length === 0) {
    return { ok: false, error: "No active subscription to change." };
  }
  if (subs.length > 1) {
    return {
      ok: false,
      error: "Multiple active subscriptions on file — contact support.",
    };
  }
  const current = subs[0];
  if (current.tier === targetTier && current.billingInterval === targetInterval) {
    return { ok: false, error: "You're already on this plan." };
  }
  if (!isUpgrade(current.tier, targetTier)) {
    return {
      ok: false,
      error: "Downgrades go through the Stripe billing portal for now.",
    };
  }

  const { stripe, config } = await getStripeClient();
  const newPriceId = priceIdFor(config, targetTier, targetInterval);
  if (!newPriceId) {
    return {
      ok: false,
      error: `No Stripe price configured for ${targetTier} / ${targetInterval}.`,
    };
  }

  const stripeSub = await stripe.subscriptions.retrieve(current.stripeSubscriptionId);
  const tierItem = findTierItem(stripeSub, config);
  if (!tierItem) {
    return { ok: false, error: "Subscription has no recognizable tier item." };
  }

  const customerId =
    typeof stripeSub.customer === "string"
      ? stripeSub.customer
      : stripeSub.customer?.id;
  if (!customerId) {
    return { ok: false, error: "Subscription is missing a customer." };
  }

  const preview = await stripe.invoices.createPreview({
    customer: customerId,
    subscription: stripeSub.id,
    subscription_details: {
      items: [{ id: tierItem.id, price: newPriceId }],
      proration_behavior: "create_prorations",
    },
  });

  const lines = preview.lines.data.map((l) => ({
    description: l.description ?? "Plan change",
    amount: l.amount,
  }));

  const nextRenewalUnix =
    preview.lines.data
      .map((l) => l.period?.end)
      .filter((v): v is number => typeof v === "number")
      .sort((a, b) => b - a)[0] ?? null;

  return {
    ok: true,
    amountDueNow: preview.amount_due,
    currency: preview.currency,
    lines,
    nextRenewalAt: nextRenewalUnix
      ? new Date(nextRenewalUnix * 1000).toISOString()
      : null,
  };
}

/**
 * Execute the tier change in place. Swaps the base-tier price on the
 * existing subscription with proration; seat add-on items are left alone
 * because Stripe's items API only mutates listed item IDs.
 */
export async function executeSubscriptionUpgrade(
  userId: string,
  targetTier: Exclude<SubscriptionTier, "free">,
  targetInterval: BillingInterval,
): Promise<UpgradeOk<{ stripeSubscriptionId: string }> | UpgradeErr> {
  const subs = await getActivePaidSubscriptions(userId);
  if (subs.length === 0) {
    return { ok: false, error: "No active subscription to upgrade." };
  }
  if (subs.length > 1) {
    return {
      ok: false,
      error: "Multiple active subscriptions on file — contact support.",
    };
  }
  const current = subs[0];
  if (current.tier === targetTier && current.billingInterval === targetInterval) {
    return { ok: false, error: "You're already on this plan." };
  }
  if (!isUpgrade(current.tier, targetTier)) {
    return {
      ok: false,
      error: "Downgrades go through the Stripe billing portal for now.",
    };
  }

  const { stripe, config } = await getStripeClient();
  const newPriceId = priceIdFor(config, targetTier, targetInterval);
  if (!newPriceId) {
    return {
      ok: false,
      error: `No Stripe price configured for ${targetTier} / ${targetInterval}.`,
    };
  }

  const stripeSub = await stripe.subscriptions.retrieve(current.stripeSubscriptionId);
  const tierItem = findTierItem(stripeSub, config);
  if (!tierItem) {
    return { ok: false, error: "Subscription has no recognizable tier item." };
  }

  await stripe.subscriptions.update(current.stripeSubscriptionId, {
    items: [{ id: tierItem.id, price: newPriceId }],
    proration_behavior: "create_prorations",
    metadata: {
      user_id: userId,
      tier: targetTier,
      interval: targetInterval,
    },
  });

  return { ok: true, stripeSubscriptionId: current.stripeSubscriptionId };
}
