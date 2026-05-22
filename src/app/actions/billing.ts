"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { hasUsedCoachProTrial, type SubscriptionTier } from "@/lib/billing/entitlement";
import { getStripeClient, priceIdFor, seatPriceIdFor, isSeatPriceId, type BillingInterval } from "@/lib/billing/stripe";
import { getSeatUsage, ensureOwnerSeatGrantRow } from "@/lib/billing/seats";
import { getCoachAiEvalDays } from "@/lib/site/coach-ai-eval-config";
import {
  getActivePaidSubscriptions,
  previewSubscriptionChange,
  executeSubscriptionUpgrade,
  type SubscriptionChangePreview,
} from "@/lib/billing/upgrade";
import {
  previewSubscriptionDowngrade,
  scheduleSubscriptionDowngrade,
  cancelScheduledDowngrade,
  type DowngradePreview,
} from "@/lib/billing/downgrade";

async function siteOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3002";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

async function getCustomerIdForUser(userId: string, email: string): Promise<string> {
  const admin = createServiceRoleClient();
  const { data: existing } = await admin
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .not("stripe_customer_id", "is", null)
    .limit(1)
    .maybeSingle();
  if (existing?.stripe_customer_id) return existing.stripe_customer_id;

  const { stripe } = await getStripeClient();
  const customer = await stripe.customers.create({
    email,
    metadata: { user_id: userId },
  });
  return customer.id;
}

export async function createCheckoutSessionAction(input: {
  tier: Exclude<SubscriptionTier, "free">;
  interval: BillingInterval;
}): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  // Guard: if the user already has an active paid subscription, refuse to
  // spin up a second one via Checkout. Tier changes must go through the
  // upgrade/downgrade flows so we don't double-bill — pre-2026-05-20 this
  // path silently created parallel subscriptions.
  try {
    const existing = await getActivePaidSubscriptions(user.id);
    if (existing.length > 0) {
      return {
        ok: false,
        error: "You already have an active subscription. Use the upgrade flow from the pricing page.",
      };
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Subscription lookup failed." };
  }

  try {
    const { stripe, config } = await getStripeClient();
    const priceId = priceIdFor(config, input.tier, input.interval);
    if (!priceId) {
      return {
        ok: false,
        error: `No Stripe price ID configured for ${input.tier} / ${input.interval}. Set it in admin settings.`,
      };
    }

    const customerId = await getCustomerIdForUser(user.id, user.email ?? "");
    const origin = await siteOrigin();

    // Coach Pro gets a free trial — but only the first time. See
    // hasUsedCoachProTrial for the gate semantics (any historical
    // `coach_ai` row disqualifies, regardless of status). The window
    // length is configurable in Site admin; Stripe stamps
    // current_period_end at checkout so changing the value never shrinks
    // an existing trial. The trial-CTA UI mirrors this gate so we don't
    // promise "no charge today" to a user who'd be billed in full.
    let trialPeriodDays: number | undefined;
    if (input.tier === "coach_ai") {
      const trialUsed = await hasUsedCoachProTrial(user.id);
      if (!trialUsed) trialPeriodDays = await getCoachAiEvalDays();
    }

    // Coach Pro first-time signups land on /home with the welcome marker
    // so they get the celebration dialog + Cal starter prompts (matches
    // the in-app upgrade path's destination). Team Coach checkout keeps
    // landing on /account where the Plan card is the relevant surface.
    // `&from=checkout` lets the welcome dialog fire the `checkout_completed`
    // analytics event so the marketing funnel doesn't lose data when we
    // skip /account.
    const successUrl =
      input.tier === "coach_ai"
        ? `${origin}/home?welcome=coach_pro&from=checkout`
        : `${origin}/account?checkout=success`;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: `${origin}/account?checkout=cancel`,
      allow_promotion_codes: true,
      client_reference_id: user.id,
      subscription_data: {
        metadata: { user_id: user.id, tier: input.tier, interval: input.interval },
        ...(trialPeriodDays
          ? {
              trial_period_days: trialPeriodDays,
              // If they finish trial without a card on file, cancel the
              // subscription instead of creating an unpaid invoice.
              trial_settings: {
                end_behavior: { missing_payment_method: "cancel" },
              },
            }
          : {}),
      },
      // Without a card during trial → still allow checkout to complete.
      // Stripe requires this when trial_period_days is set without a
      // payment method up front.
      ...(trialPeriodDays
        ? { payment_method_collection: "if_required" as const }
        : {}),
      metadata: { user_id: user.id, tier: input.tier, interval: input.interval },
    });
    if (!session.url) return { ok: false, error: "Stripe did not return a Checkout URL." };
    return { ok: true, url: session.url };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Checkout failed." };
  }
}

/**
 * Compute the proration preview for a tier upgrade. Called by the pricing
 * page modal before the user confirms — they see exactly what they'll be
 * charged today before clicking "Confirm upgrade".
 */
export async function previewSubscriptionChangeAction(input: {
  targetTier: Exclude<SubscriptionTier, "free">;
  targetInterval: BillingInterval;
}): Promise<
  ({ ok: true } & SubscriptionChangePreview) | { ok: false; error: string }
> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  try {
    return await previewSubscriptionChange(user.id, input.targetTier, input.targetInterval);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Preview failed." };
  }
}

/**
 * Execute the tier upgrade in place via stripe.subscriptions.update with
 * proration. Seat add-on items pass through untouched. Trial logic doesn't
 * apply here — trials are for first-time subscribers, not upgrades.
 */
export async function confirmSubscriptionChangeAction(input: {
  targetTier: Exclude<SubscriptionTier, "free">;
  targetInterval: BillingInterval;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  try {
    const res = await executeSubscriptionUpgrade(user.id, input.targetTier, input.targetInterval);
    if (!res.ok) return res;
    revalidatePath("/account");
    revalidatePath("/pricing");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Upgrade failed." };
  }
}

/**
 * Compute when a tier downgrade would take effect — the end of the
 * user's current billing period. Drives the pricing-page confirmation
 * dialog ("Your plan will switch to Team Coach on June 4").
 */
export async function previewSubscriptionDowngradeAction(input: {
  targetTier: SubscriptionTier;
}): Promise<({ ok: true } & DowngradePreview) | { ok: false; error: string }> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  try {
    return await previewSubscriptionDowngrade(user.id, input.targetTier);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Preview failed." };
  }
}

/**
 * Schedule a tier downgrade to take effect at the end of the current
 * billing period. Paid → paid uses a Stripe subscription schedule; paid
 * → free uses cancel_at_period_end. Mirror state lives on
 * subscriptions.pending_change_* and is read by the /account banner.
 */
export async function scheduleSubscriptionDowngradeAction(input: {
  targetTier: SubscriptionTier;
  targetInterval: BillingInterval;
}): Promise<{ ok: true; effectiveAt: string } | { ok: false; error: string }> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  try {
    const res = await scheduleSubscriptionDowngrade(
      user.id,
      input.targetTier,
      input.targetInterval,
    );
    if (!res.ok) return res;
    revalidatePath("/account");
    revalidatePath("/pricing");
    return { ok: true, effectiveAt: res.effectiveAt };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Downgrade failed." };
  }
}

/**
 * Cancel a pending downgrade. Releases the Stripe subscription schedule
 * (or clears cancel_at_period_end for downgrade-to-free).
 */
export async function cancelScheduledDowngradeAction(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  try {
    const res = await cancelScheduledDowngrade(user.id);
    if (!res.ok) return res;
    revalidatePath("/account");
    revalidatePath("/pricing");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Cancel failed." };
  }
}

export async function createBillingPortalSessionAction(): Promise<
  { ok: true; url: string } | { ok: false; error: string }
> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const admin = createServiceRoleClient();
  const { data: sub } = await admin
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .not("stripe_customer_id", "is", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!sub?.stripe_customer_id) {
    return { ok: false, error: "No billing customer on file yet." };
  }

  try {
    const { stripe } = await getStripeClient();
    const origin = await siteOrigin();
    const portal = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: `${origin}/account`,
    });
    return { ok: true, url: portal.url };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not open billing portal." };
  }
}

/**
 * Set the owner's purchased seat quantity to `nextPurchased` (>=0). Adds or
 * updates a seat-priced line item on their existing Coach subscription;
 * removes the line if `nextPurchased` is 0. Stripe prorates automatically.
 *
 * Refuses to drop below the count currently in use — owner must remove
 * collaborators first.
 */
/**
 * Surface the playbook owner's coach-seat status to the invite dialog,
 * so we can warn before the user composes an invite they can't send.
 * Anyone with read access to the playbook (coach or player) can call
 * it — the response is just headcount, not billing detail.
 */
export async function getInviteSeatStatusAction(
  playbookId: string,
): Promise<
  | { ok: true; isCoachPlus: boolean; used: number; total: number; available: number; canManageSeats: boolean }
  | { ok: false; error: string }
> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const admin = createServiceRoleClient();
  const { data: ownerRow } = await admin
    .from("playbook_members")
    .select("user_id")
    .eq("playbook_id", playbookId)
    .eq("role", "owner")
    .eq("status", "active")
    .maybeSingle();
  const ownerId = (ownerRow?.user_id as string | null) ?? null;
  if (!ownerId) return { ok: false, error: "Playbook owner not found." };

  const usage = await getSeatUsage(ownerId);
  const total = usage.included + usage.purchased;
  return {
    ok: true,
    isCoachPlus: total > 0,
    used: usage.used,
    total,
    available: usage.available,
    canManageSeats: ownerId === user.id,
  };
}

export async function setSeatQuantityAction(input: {
  nextPurchased: number;
}): Promise<{ ok: true; purchased: number } | { ok: false; error: string }> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  if (!Number.isInteger(input.nextPurchased) || input.nextPurchased < 0) {
    return { ok: false, error: "Seat count must be a non-negative integer." };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const usage = await getSeatUsage(user.id);
  const nextTotal = usage.included + input.nextPurchased;
  if (nextTotal < usage.used) {
    return {
      ok: false,
      error: `Can't drop below ${usage.used} seats — remove collaborators first.`,
    };
  }

  const admin = createServiceRoleClient();
  const { data: sub } = await admin
    .from("subscriptions")
    .select("stripe_subscription_id, billing_interval, status")
    .eq("user_id", user.id)
    .not("stripe_subscription_id", "is", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Comp / early-user accounts have no Stripe subscription. Let them
  // adjust their seat allocation directly — there's nothing to bill,
  // and removing seats still respects the in-use floor enforced above.
  if (!sub?.stripe_subscription_id) {
    await ensureOwnerSeatGrantRow(user.id);
    const { error: grantErr } = await admin
      .from("owner_seat_grants")
      .update({ purchased_seats: input.nextPurchased })
      .eq("owner_id", user.id);
    if (grantErr) return { ok: false, error: grantErr.message };
    revalidatePath("/account");
    return { ok: true, purchased: input.nextPurchased };
  }
  if (sub.status !== "active" && sub.status !== "trialing") {
    return { ok: false, error: "Subscription must be active to change seats." };
  }

  try {
    const { stripe, config } = await getStripeClient();
    const stripeSub = await stripe.subscriptions.retrieve(sub.stripe_subscription_id);
    const interval =
      (sub.billing_interval as BillingInterval | null) ??
      (stripeSub.items.data[0]?.price.recurring?.interval as BillingInterval | undefined) ??
      "month";
    const seatPriceId = seatPriceIdFor(config, interval);
    if (!seatPriceId) {
      return {
        ok: false,
        error: `No seat price ID configured for ${interval} billing. Set it in admin settings.`,
      };
    }

    const existingItem = stripeSub.items.data.find((i) =>
      isSeatPriceId(config, i.price.id),
    );

    if (input.nextPurchased === 0) {
      if (existingItem) {
        await stripe.subscriptionItems.del(existingItem.id, { proration_behavior: "create_prorations" });
      }
    } else if (existingItem) {
      await stripe.subscriptionItems.update(existingItem.id, {
        quantity: input.nextPurchased,
        proration_behavior: "create_prorations",
      });
    } else {
      await stripe.subscriptionItems.create({
        subscription: sub.stripe_subscription_id,
        price: seatPriceId,
        quantity: input.nextPurchased,
        proration_behavior: "create_prorations",
      });
    }

    // Optimistic local update; webhook will reconcile authoritatively.
    await ensureOwnerSeatGrantRow(user.id);
    await admin
      .from("owner_seat_grants")
      .update({ purchased_seats: input.nextPurchased })
      .eq("owner_id", user.id);

    revalidatePath("/account");
    return { ok: true, purchased: input.nextPurchased };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not update seats." };
  }
}

export async function redeemGiftCodeAction(rawCode: string): Promise<
  { ok: true; tier: SubscriptionTier; expiresAt: string | null } | { ok: false; error: string }
> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const code = rawCode.trim().toUpperCase();
  if (!code) return { ok: false, error: "Enter a code." };

  const admin = createServiceRoleClient();
  const { data: gc, error: gcErr } = await admin
    .from("gift_codes")
    .select("id, tier, duration_days, max_uses, used_count, revoked_at, expires_at")
    .eq("code", code)
    .maybeSingle();
  if (gcErr) return { ok: false, error: gcErr.message };
  if (!gc) return { ok: false, error: "Code not found." };
  if (gc.revoked_at) return { ok: false, error: "This code has been revoked." };
  if (gc.expires_at && new Date(gc.expires_at).getTime() < Date.now()) {
    return { ok: false, error: "This code has expired." };
  }
  if (gc.used_count >= gc.max_uses) {
    return { ok: false, error: "This code has reached its use limit." };
  }

  const { data: existing } = await admin
    .from("gift_redemptions")
    .select("id")
    .eq("code_id", gc.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (existing) return { ok: false, error: "You've already redeemed this code." };

  const expiresAt = gc.duration_days
    ? new Date(Date.now() + gc.duration_days * 24 * 60 * 60 * 1000).toISOString()
    : null;

  const { data: grant, error: grantErr } = await admin
    .from("comp_grants")
    .insert({
      user_id: user.id,
      tier: gc.tier,
      note: `Redeemed code ${code}`,
      granted_by: null,
      expires_at: expiresAt,
    })
    .select("id")
    .single();
  if (grantErr || !grant) return { ok: false, error: grantErr?.message ?? "Grant failed." };

  const { error: redErr } = await admin.from("gift_redemptions").insert({
    code_id: gc.id,
    user_id: user.id,
    comp_grant_id: grant.id,
  });
  if (redErr) return { ok: false, error: redErr.message };

  const { error: incErr } = await admin
    .from("gift_codes")
    .update({ used_count: gc.used_count + 1 })
    .eq("id", gc.id);
  if (incErr) return { ok: false, error: incErr.message };

  revalidatePath("/account");
  revalidatePath("/pricing");
  return { ok: true, tier: gc.tier as SubscriptionTier, expiresAt };
}
