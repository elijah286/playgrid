"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { Resend } from "resend";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { hasUsedCoachProTrial, type SubscriptionTier } from "@/lib/billing/entitlement";
import { getStripeClient, priceIdFor, seatPriceIdFor, isSeatPriceId, type BillingInterval } from "@/lib/billing/stripe";
import { getSeatUsage, ensureOwnerSeatGrantRow } from "@/lib/billing/seats";
import { getCoachAiEvalDays } from "@/lib/site/coach-ai-eval-config";
import { getStoredResendConfig } from "@/lib/site/resend-config";
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

    // Both paid tiers now land on /home with a tier-specific welcome
    // marker so coaches get a celebration + action-oriented next steps
    // instead of the silent account page. The marker is server-validated
    // against actual entitlement (see HomePage) so pasting the URL on a
    // free account doesn't trigger a fake celebration. `&from=checkout`
    // lets the welcome dialog fire the `checkout_completed` analytics
    // event so the marketing funnel doesn't lose data when we skip
    // /account.
    const welcomeKey = input.tier === "coach_ai" ? "coach_pro" : "team_coach";
    const successUrl = `${origin}/home?welcome=${welcomeKey}&from=checkout`;

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

const CANCELLATION_ADMIN_RECIPIENT = "admin@xogridmaker.com";

/**
 * In-app subscription cancellation. Schedules the Stripe sub for end-of-period
 * cancellation (the coach keeps access through what they've already paid for),
 * records the reason + free-text in `subscription_cancellation_feedback`, and
 * emails the admin so the churn signal isn't buried in a dashboard tab. The
 * webhook reconciles cancel_at_period_end on the subscriptions row; we mirror
 * it here so /account reflects the new state immediately on reload.
 */
export async function cancelSubscriptionAction(input: {
  reasonKey: string;
  reasonLabel: string;
  freeText: string;
}): Promise<{ ok: true; effectiveAt: string } | { ok: false; error: string }> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const reasonKey = String(input.reasonKey ?? "").trim();
  const reasonLabel = String(input.reasonLabel ?? "").trim();
  const freeText = String(input.freeText ?? "").trim();
  if (!reasonKey || !reasonLabel) {
    return { ok: false, error: "Please pick a reason." };
  }
  if (reasonKey === "other" && freeText.length === 0) {
    return { ok: false, error: "Tell us a little more so we can do better." };
  }
  if (freeText.length > 4000) {
    return { ok: false, error: "Comment is too long (max 4000 characters)." };
  }

  const admin = createServiceRoleClient();
  const { data: sub, error: subErr } = await admin
    .from("subscriptions")
    .select(
      "id, stripe_subscription_id, tier, status, current_period_end, cancel_at_period_end",
    )
    .eq("user_id", user.id)
    .not("stripe_subscription_id", "is", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (subErr) return { ok: false, error: subErr.message };
  if (!sub?.stripe_subscription_id) {
    return { ok: false, error: "No active subscription to cancel." };
  }
  if (
    sub.status !== "active" &&
    sub.status !== "trialing" &&
    sub.status !== "past_due"
  ) {
    return { ok: false, error: "Subscription is not active." };
  }
  if (sub.cancel_at_period_end) {
    return { ok: false, error: "Your subscription is already set to end." };
  }

  let effectiveAt: string;
  try {
    const { stripe } = await getStripeClient();
    const canceled = await stripe.subscriptions.update(sub.stripe_subscription_id, {
      cancel_at_period_end: true,
    });
    // Stripe SDK v22 moved `current_period_end` from the subscription onto
    // each item; read either, prefer the subscription-level value.
    type WithPeriodEnd = { current_period_end?: number | null };
    let periodEndUnix: number | null =
      (canceled as unknown as WithPeriodEnd).current_period_end ?? null;
    if (periodEndUnix == null) {
      for (const item of canceled.items.data) {
        const onItem = (item as unknown as WithPeriodEnd).current_period_end;
        if (typeof onItem === "number") {
          periodEndUnix = onItem;
          break;
        }
      }
    }
    effectiveAt = periodEndUnix
      ? new Date(periodEndUnix * 1000).toISOString()
      : (sub.current_period_end ?? new Date().toISOString());
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Stripe could not cancel the subscription.",
    };
  }

  await admin
    .from("subscriptions")
    .update({ cancel_at_period_end: true, cancel_at: effectiveAt })
    .eq("id", sub.id);

  const tier = (sub.tier as string | null) ?? "unknown";
  const message = freeText.length > 0 ? `${reasonLabel}\n\n${freeText}` : reasonLabel;
  await admin.from("subscription_cancellation_feedback").insert({
    user_id: user.id,
    message,
    stripe_subscription_id: sub.stripe_subscription_id,
  });

  await sendCancellationAdminEmail({
    userEmail: user.email ?? "(no email)",
    tier,
    reasonLabel,
    freeText,
    effectiveAt,
  });

  revalidatePath("/account");
  return { ok: true, effectiveAt };
}

async function sendCancellationAdminEmail(args: {
  userEmail: string;
  tier: string;
  reasonLabel: string;
  freeText: string;
  effectiveAt: string;
}): Promise<void> {
  try {
    const cfg = await getStoredResendConfig().catch(() => ({
      apiKey: null as string | null,
      fromEmail: null as string | null,
      contactToEmail: null as string | null,
    }));
    const apiKey = cfg.apiKey ?? process.env.RESEND_API_KEY ?? null;
    const fromEmail =
      cfg.fromEmail ??
      process.env.RESEND_FROM_EMAIL ??
      "XO Gridmaker <hello@xogridmaker.com>";
    if (!apiKey) return;

    const escape = (s: string) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const effective = new Date(args.effectiveAt).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
    const commentBlock = args.freeText
      ? `<p style="margin:16px 0 8px;color:#475569;font-size:13px"><strong>What they said:</strong></p>
         <blockquote style="margin:0;padding:12px 16px;background:#f8fafc;border-left:3px solid #cbd5e1;color:#0f172a;font-size:14px;white-space:pre-wrap">${escape(args.freeText)}</blockquote>`
      : `<p style="margin:16px 0 0;color:#64748b;font-size:13px">No additional comment.</p>`;

    const subject = `Cancellation: ${args.userEmail} (${args.tier})`;
    const text = [
      `A coach cancelled their subscription.`,
      ``,
      `User: ${args.userEmail}`,
      `Plan: ${args.tier}`,
      `Reason: ${args.reasonLabel}`,
      `Ends on: ${effective}`,
      ``,
      args.freeText || "(no additional comment)",
    ].join("\n");
    const html = `<!doctype html>
<html><body style="font-family:ui-sans-serif,system-ui,Segoe UI,Helvetica,Arial,sans-serif;background:#f8fafc;margin:0;padding:24px">
  <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0">
    <tr><td style="padding:24px">
      <h1 style="margin:0 0 8px;font-size:18px;color:#0f172a">Subscription cancellation</h1>
      <p style="margin:0 0 16px;color:#475569;font-size:14px;line-height:1.5">A coach cancelled their plan. They keep access until the end of the paid period.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0;font-size:13px;color:#334155">
        <tr><td style="padding:3px 16px 3px 0;color:#64748b">User</td><td style="padding:3px 0">${escape(args.userEmail)}</td></tr>
        <tr><td style="padding:3px 16px 3px 0;color:#64748b">Plan</td><td style="padding:3px 0">${escape(args.tier)}</td></tr>
        <tr><td style="padding:3px 16px 3px 0;color:#64748b">Reason</td><td style="padding:3px 0"><strong>${escape(args.reasonLabel)}</strong></td></tr>
        <tr><td style="padding:3px 16px 3px 0;color:#64748b">Ends on</td><td style="padding:3px 0">${escape(effective)}</td></tr>
      </table>
      ${commentBlock}
    </td></tr>
  </table>
</body></html>`;

    const resend = new Resend(apiKey);
    await resend.emails.send({
      from: fromEmail,
      to: CANCELLATION_ADMIN_RECIPIENT,
      subject,
      text,
      html,
    });
  } catch {
    // Best-effort — never fail the cancellation just because email failed.
  }
}
