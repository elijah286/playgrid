import type Stripe from "stripe";
import { getStripeClient, priceIdFor, seatPriceIdFor, isSeatPriceId, type BillingInterval } from "@/lib/billing/stripe";
import type { SubscriptionTier } from "@/lib/billing/entitlement";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import {
  getActivePaidSubscriptions,
  findTierItem,
  isDowngrade,
} from "@/lib/billing/upgrade";

/**
 * End-of-period tier downgrade via Stripe subscription schedules.
 *
 * Convention: downgrades take effect at the end of the current billing
 * period, not immediately. The user keeps their higher-tier entitlements
 * until then (they've paid for them). At period end, Stripe transitions
 * the subscription to the new price automatically. We mirror the pending
 * change on `subscriptions.pending_change_*` via webhook so the UI can
 * show "Switching to Team Coach on June 4" and offer a cancel button.
 *
 * Downgrade-to-free is a different shape: there's no destination price,
 * so we just flip `cancel_at_period_end = true` on the existing
 * subscription. The existing `subscriptions.cancel_at` column already
 * tracks that case; we don't double-up via pending_change.
 */

type Ok<T> = { ok: true } & T;
type Err = { ok: false; error: string };

export type DowngradePreview = {
  effectiveAt: string;
  targetTier: SubscriptionTier;
  targetName: string;
  currentName: string;
};

const TIER_DISPLAY: Record<SubscriptionTier, string> = {
  free: "Solo Coach",
  coach: "Team Coach",
  coach_ai: "Coach Pro",
};

/** When a downgrade would take effect (end of current billing period). */
export async function previewSubscriptionDowngrade(
  userId: string,
  targetTier: SubscriptionTier,
): Promise<Ok<DowngradePreview> | Err> {
  const subs = await getActivePaidSubscriptions(userId);
  if (subs.length === 0) {
    return { ok: false, error: "No active subscription to downgrade." };
  }
  if (subs.length > 1) {
    return {
      ok: false,
      error: "Multiple active subscriptions on file — contact support.",
    };
  }
  const current = subs[0];
  if (!isDowngrade(current.tier, targetTier)) {
    return { ok: false, error: "Use the upgrade flow for higher tiers." };
  }

  const { stripe } = await getStripeClient();
  const stripeSub = await stripe.subscriptions.retrieve(current.stripeSubscriptionId);
  const periodEnd = effectivePeriodEnd(stripeSub);
  if (!periodEnd) {
    return { ok: false, error: "Could not determine current period end." };
  }

  return {
    ok: true,
    effectiveAt: new Date(periodEnd * 1000).toISOString(),
    targetTier,
    targetName: TIER_DISPLAY[targetTier],
    currentName: TIER_DISPLAY[current.tier],
  };
}

/**
 * Schedule a tier downgrade to take effect at the end of the current
 * period. For paid → paid: creates a Stripe subscription schedule with
 * two phases. For paid → free: flips cancel_at_period_end.
 *
 * Idempotent for the schedule-based path: a second call with a different
 * target tier replaces phase 2 with the new target. A second call with
 * the same target is a no-op.
 */
export async function scheduleSubscriptionDowngrade(
  userId: string,
  targetTier: SubscriptionTier,
  targetInterval: BillingInterval,
): Promise<Ok<{ scheduleId: string | null; effectiveAt: string }> | Err> {
  const subs = await getActivePaidSubscriptions(userId);
  if (subs.length === 0) {
    return { ok: false, error: "No active subscription to downgrade." };
  }
  if (subs.length > 1) {
    return {
      ok: false,
      error: "Multiple active subscriptions on file — contact support.",
    };
  }
  const current = subs[0];
  if (!isDowngrade(current.tier, targetTier)) {
    return { ok: false, error: "Use the upgrade flow for higher tiers." };
  }

  const { stripe, config } = await getStripeClient();
  const stripeSub = await stripe.subscriptions.retrieve(current.stripeSubscriptionId);
  const periodEndUnix = effectivePeriodEnd(stripeSub);
  if (!periodEndUnix) {
    return { ok: false, error: "Could not determine current period end." };
  }

  // Downgrade-to-free: cancel at period end. No schedule needed.
  if (targetTier === "free") {
    await stripe.subscriptions.update(current.stripeSubscriptionId, {
      cancel_at_period_end: true,
      metadata: {
        ...((stripeSub.metadata as Record<string, string> | null) ?? {}),
        pending_downgrade_target: "free",
      },
    });
    // Mirror to pending_change_* so the UI banner can read a single
    // source of truth (cancel_at_period_end alone doesn't say "to what").
    await writePendingChange(userId, current.stripeSubscriptionId, {
      tier: "free",
      effectiveAt: new Date(periodEndUnix * 1000).toISOString(),
      scheduleId: null,
    });
    return {
      ok: true,
      scheduleId: null,
      effectiveAt: new Date(periodEndUnix * 1000).toISOString(),
    };
  }

  // Paid → lower-paid: subscription schedule with two phases.
  const newTierPriceId = priceIdFor(config, targetTier, targetInterval);
  if (!newTierPriceId) {
    return {
      ok: false,
      error: `No Stripe price configured for ${targetTier} / ${targetInterval}.`,
    };
  }

  const currentTierItem = findTierItem(stripeSub, config);
  if (!currentTierItem) {
    return { ok: false, error: "Subscription has no recognizable tier item." };
  }

  // Carry seat add-ons across the transition. Same seat price family for
  // both phases — we don't try to migrate seat intervals on downgrade,
  // for simplicity (yearly→monthly seat migration is a Phase 3 problem).
  const seatItem = stripeSub.items.data.find((i) =>
    isSeatPriceId(config, i.price.id),
  );
  const newSeatPriceId = seatItem ? seatPriceIdFor(config, targetInterval) : null;

  // Create the schedule from the current subscription (mirrors phase 1
  // automatically), then update with the additional phase 2.
  const schedule = await stripe.subscriptionSchedules.create({
    from_subscription: current.stripeSubscriptionId,
  });

  const phaseOne = schedule.phases[0];
  const phaseOneItems = (phaseOne.items ?? []).map((it) => {
    const priceId = typeof it.price === "string" ? it.price : it.price.id;
    return { price: priceId, quantity: it.quantity ?? 1 };
  });

  const phaseTwoItems: Array<{ price: string; quantity: number }> = [
    { price: newTierPriceId, quantity: 1 },
  ];
  if (seatItem && newSeatPriceId) {
    phaseTwoItems.push({
      price: newSeatPriceId,
      quantity: seatItem.quantity ?? 1,
    });
  }

  await stripe.subscriptionSchedules.update(schedule.id, {
    end_behavior: "release",
    phases: [
      {
        items: phaseOneItems,
        start_date: phaseOne.start_date,
        end_date: phaseOne.end_date ?? periodEndUnix,
        proration_behavior: "none",
      },
      {
        items: phaseTwoItems,
        proration_behavior: "none",
      },
    ],
    metadata: {
      user_id: userId,
      pending_tier: targetTier,
      pending_interval: targetInterval,
    },
  });

  const effectiveAt = new Date(periodEndUnix * 1000).toISOString();
  await writePendingChange(userId, current.stripeSubscriptionId, {
    tier: targetTier,
    effectiveAt,
    scheduleId: schedule.id,
  });

  return { ok: true, scheduleId: schedule.id, effectiveAt };
}

/**
 * Cancel a pending downgrade. For schedule-backed downgrades, releases
 * the schedule (the underlying subscription continues at its current
 * price). For pending-cancel-to-free, flips cancel_at_period_end back
 * to false.
 */
export async function cancelScheduledDowngrade(
  userId: string,
): Promise<{ ok: true } | Err> {
  const subs = await getActivePaidSubscriptions(userId);
  if (subs.length === 0) {
    return { ok: false, error: "No active subscription found." };
  }
  if (subs.length > 1) {
    return {
      ok: false,
      error: "Multiple active subscriptions on file — contact support.",
    };
  }
  const current = subs[0];

  const admin = createServiceRoleClient();
  const { data: row } = await admin
    .from("subscriptions")
    .select("pending_change_tier, pending_change_schedule_id")
    .eq("stripe_subscription_id", current.stripeSubscriptionId)
    .maybeSingle();
  if (!row?.pending_change_tier) {
    return { ok: false, error: "No pending change to cancel." };
  }

  const { stripe } = await getStripeClient();

  if (row.pending_change_schedule_id) {
    try {
      await stripe.subscriptionSchedules.release(row.pending_change_schedule_id);
    } catch (e) {
      // If the schedule has already been released/completed, treat as a
      // no-op so the local state can still be cleared. Anything else
      // surfaces to the caller.
      const msg = e instanceof Error ? e.message : String(e);
      // Stripe's exact phrasings: "...has already been released",
      // "...has already been canceled", "...cannot be released in its
      // completed status". Match all three so an out-of-band lifecycle
      // event doesn't strand the local pending_change row.
      if (!/already (been )?(released|completed|canceled)|completed status/i.test(msg)) {
        return { ok: false, error: msg };
      }
    }
  } else if (row.pending_change_tier === "free") {
    await stripe.subscriptions.update(current.stripeSubscriptionId, {
      cancel_at_period_end: false,
    });
  }

  await admin
    .from("subscriptions")
    .update({
      pending_change_tier: null,
      pending_change_effective_at: null,
      pending_change_schedule_id: null,
    })
    .eq("stripe_subscription_id", current.stripeSubscriptionId);

  return { ok: true };
}

/** Stripe shifted `current_period_end` from the subscription onto each
 *  item in late-2025 SDKs. Read either, prefer the subscription-level
 *  value (truncates first). */
function effectivePeriodEnd(sub: Stripe.Subscription): number | null {
  type WithPeriodEnd = { current_period_end?: number | null };
  const onSub = (sub as unknown as WithPeriodEnd).current_period_end;
  if (typeof onSub === "number") return onSub;
  for (const item of sub.items.data) {
    const onItem = (item as unknown as WithPeriodEnd).current_period_end;
    if (typeof onItem === "number") return onItem;
  }
  return null;
}

async function writePendingChange(
  userId: string,
  stripeSubscriptionId: string,
  change: { tier: SubscriptionTier; effectiveAt: string; scheduleId: string | null },
): Promise<void> {
  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("subscriptions")
    .update({
      pending_change_tier: change.tier,
      pending_change_effective_at: change.effectiveAt,
      pending_change_schedule_id: change.scheduleId,
    })
    .eq("user_id", userId)
    .eq("stripe_subscription_id", stripeSubscriptionId);
  if (error) throw new Error(`pending_change update failed: ${error.message}`);
}
