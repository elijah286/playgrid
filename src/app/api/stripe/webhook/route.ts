import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getStripeClient, tierForPriceId, isSeatPriceId } from "@/lib/billing/stripe";
import { getStripeConfig } from "@/lib/site/stripe-config";
import type { SubscriptionTier } from "@/lib/billing/entitlement";
import { COACH_CAL_PACK_BUDGET_MICROS } from "@/lib/billing/coach-cal-cost-cap";
import { sendCancellationFeedbackEmail } from "@/lib/notifications/cancellation-feedback-email";
import { sendWelcomeCoachEmail } from "@/lib/notifications/welcome-coach-email";
import { projectSystemNoticesToAdmins } from "@/lib/notifications/inbox-dispatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Mark a league registration paid once its Checkout Session completes. */
async function markRegistrationPaid(session: Stripe.Checkout.Session): Promise<void> {
  const regId = session.metadata?.registration_id;
  if (!regId) return;
  const admin = createServiceRoleClient();
  await admin
    .from("player_registrations")
    .update({ payment_status: "paid", paid_at: new Date().toISOString() })
    .eq("id", regId);
}

async function upsertSubscriptionFromStripe(sub: Stripe.Subscription): Promise<string> {
  const admin = createServiceRoleClient();
  const config = await getStripeConfig();

  const customerObj =
    typeof sub.customer === "string" || !sub.customer || "deleted" in sub.customer
      ? null
      : sub.customer;
  const userIdFromMeta =
    (sub.metadata?.user_id as string | undefined) ??
    (customerObj?.metadata?.user_id as string | undefined);

  let userId = userIdFromMeta;
  if (!userId) {
    const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
    if (customerId) {
      const { data } = await admin
        .from("subscriptions")
        .select("user_id")
        .eq("stripe_customer_id", customerId)
        .limit(1)
        .maybeSingle();
      userId = data?.user_id ?? undefined;
    }
  }
  if (!userId) {
    // Last resort: try to resolve via customer email
    const { stripe } = await getStripeClient();
    const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
    if (customerId) {
      const cust = await stripe.customers.retrieve(customerId);
      if (!("deleted" in cust) && cust.email) {
        const { data } = await admin.auth.admin.listUsers({ perPage: 500, page: 1 });
        const match = data.users.find((u) => u.email?.toLowerCase() === cust.email?.toLowerCase());
        userId = match?.id;
      }
    }
  }
  if (!userId) {
    throw new Error(`Cannot resolve user_id for subscription ${sub.id}`);
  }

  // Pick the tier-bearing line item, skipping seat add-ons.
  const tierItem =
    sub.items.data.find((i) => !isSeatPriceId(config, i.price.id)) ?? sub.items.data[0];
  const priceId = tierItem?.price.id ?? null;
  const mapped = priceId ? tierForPriceId(config, priceId) : null;
  const tier: SubscriptionTier = mapped?.tier ?? "coach";
  const interval = mapped?.interval ?? tierItem?.price.recurring?.interval ?? null;
  const periodEndUnix = tierItem?.current_period_end ?? null;
  const seatItem = sub.items.data.find((i) => isSeatPriceId(config, i.price.id)) ?? null;

  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null;

  const cancellation = sub.cancellation_details ?? null;
  const row = {
    user_id: userId,
    tier,
    status: sub.status,
    stripe_customer_id: customerId,
    stripe_subscription_id: sub.id,
    stripe_price_id: priceId,
    current_period_end: periodEndUnix ? new Date(periodEndUnix * 1000).toISOString() : null,
    cancel_at_period_end: sub.cancel_at_period_end ?? false,
    cancel_at: sub.cancel_at ? new Date(sub.cancel_at * 1000).toISOString() : null,
    stripe_cancellation_reason: cancellation?.reason ?? null,
    stripe_cancellation_feedback: cancellation?.feedback ?? null,
    stripe_cancellation_comment: cancellation?.comment ?? null,
    billing_interval: interval === "month" || interval === "year" ? interval : null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await admin
    .from("subscriptions")
    .upsert(row, { onConflict: "stripe_subscription_id" });
  if (error) throw new Error(`subscriptions upsert failed: ${error.message}`);

  // If a pending downgrade just took effect (schedule transitioned to
  // phase 2, or cancel_at_period_end fired), the tier now matches the
  // pending target. Clear the pending_change_* columns so the UI banner
  // disappears. Read after the upsert so we see the just-written tier.
  const { data: maybePending } = await admin
    .from("subscriptions")
    .select("pending_change_tier")
    .eq("stripe_subscription_id", sub.id)
    .maybeSingle();
  if (maybePending?.pending_change_tier && maybePending.pending_change_tier === tier) {
    await admin
      .from("subscriptions")
      .update({
        pending_change_tier: null,
        pending_change_effective_at: null,
        pending_change_schedule_id: null,
      })
      .eq("stripe_subscription_id", sub.id);
  }

  // Sync purchased_seats from the seat line item (or zero if absent). Only
  // applies to Coach+; free/cancelled subs don't carry seats.
  if (tier === "coach" || tier === "coach_ai") {
    const purchased = seatItem ? seatItem.quantity ?? 0 : 0;
    const itemId = seatItem?.id ?? null;
    const { error: seatErr } = await admin
      .from("owner_seat_grants")
      .upsert(
        {
          owner_id: userId,
          purchased_seats: purchased,
          stripe_subscription_item_id: itemId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "owner_id" },
      );
    if (seatErr) throw new Error(`owner_seat_grants upsert failed: ${seatErr.message}`);
  }

  return userId;
}

/**
 * Fan the subscription_purchased / subscription_canceled system_notice the DB
 * triggers just wrote (in the same transaction as the upsert above) out to site
 * admins' devices. Best-effort and idempotent — never fails the webhook.
 */
async function pushAdminSubscriptionNotice(userId: string): Promise<void> {
  try {
    await projectSystemNoticesToAdmins({ admin: createServiceRoleClient(), userId });
  } catch (e) {
    console.error("[stripe webhook] admin push failed", e);
  }
}

/**
 * Send the cancellation-feedback email exactly once per subscription, gated
 * on an atomic UPDATE-with-guard so Stripe webhook retries / duplicate events
 * can't double-send. Best-effort: any error is logged but never propagates
 * back to Stripe — the subscription state sync already succeeded above, and
 * the email is supplementary. Call AFTER upsertSubscriptionFromStripe.
 */
async function maybeFireCancellationFeedback(
  stripeSubscriptionId: string,
): Promise<void> {
  try {
    const admin = createServiceRoleClient();
    // Claim the slot atomically. Only succeeds for a sub that has been
    // canceled (either cancel_at_period_end = true while still active, or
    // status = canceled) AND hasn't already received this email.
    const { data: claimed, error: claimErr } = await admin
      .from("subscriptions")
      .update({ cancellation_feedback_email_sent_at: new Date().toISOString() })
      .eq("stripe_subscription_id", stripeSubscriptionId)
      .is("cancellation_feedback_email_sent_at", null)
      .or("cancel_at_period_end.eq.true,status.eq.canceled")
      .select("user_id, current_period_end")
      .maybeSingle();
    if (claimErr) {
      console.error("[stripe webhook] cancellation-email claim failed", claimErr.message);
      return;
    }
    if (!claimed?.user_id) return; // already sent or not eligible — quiet no-op

    const { data: authUser } = await admin.auth.admin.getUserById(claimed.user_id);
    const email = authUser?.user?.email ?? null;
    if (!email) {
      console.error(
        "[stripe webhook] cancellation-email: no email on auth user",
        claimed.user_id,
      );
      return;
    }
    const { data: prof } = await admin
      .from("profiles")
      .select("display_name")
      .eq("id", claimed.user_id)
      .maybeSingle();
    const displayName = (prof?.display_name as string | null) ?? null;
    const firstName = displayName ? displayName.trim().split(/\s+/)[0] || null : null;
    const periodEndDate = claimed.current_period_end
      ? new Date(claimed.current_period_end as string)
      : null;

    const send = await sendCancellationFeedbackEmail({
      toEmail: email,
      firstName,
      periodEndDate,
    });
    if (!send.ok) {
      console.error("[stripe webhook] cancellation-email send failed", send.error);
      // We intentionally do NOT unset the claim — avoids double-sends on
      // retry at the cost of losing this email on transient Resend failure.
      return;
    }
    console.log(
      `[stripe webhook] cancellation-email sent to ${email} (id=${send.messageId})`,
    );
  } catch (e) {
    console.error(
      "[stripe webhook] cancellation-email unexpected error",
      (e as Error).message,
    );
  }
}

/**
 * Send the welcome email exactly once per coach subscription, gated on an
 * atomic UPDATE-with-guard so Stripe webhook retries / duplicate events can't
 * double-send. Only fires for an active/trialing `coach` subscription that
 * hasn't already received the email — so it lands on a real purchase, never on
 * a routine subscription update. Best-effort: any error is logged but never
 * propagates back to Stripe — the subscription state sync already succeeded,
 * and the email is supplementary. Call AFTER upsertSubscriptionFromStripe, and
 * only on initial-purchase signals (checkout.session.completed /
 * customer.subscription.created), never on .updated.
 */
async function maybeFireWelcomeEmail(stripeSubscriptionId: string): Promise<void> {
  try {
    const admin = createServiceRoleClient();
    // Claim the slot atomically. Only succeeds for an active/trialing coach
    // subscription that hasn't already received the welcome email.
    const { data: claimed, error: claimErr } = await admin
      .from("subscriptions")
      .update({ welcome_email_sent_at: new Date().toISOString() })
      .eq("stripe_subscription_id", stripeSubscriptionId)
      .is("welcome_email_sent_at", null)
      .eq("tier", "coach")
      .in("status", ["active", "trialing"])
      .select("user_id")
      .maybeSingle();
    if (claimErr) {
      console.error("[stripe webhook] welcome-email claim failed", claimErr.message);
      return;
    }
    if (!claimed?.user_id) return; // already sent or not eligible — quiet no-op

    const { data: authUser } = await admin.auth.admin.getUserById(claimed.user_id);
    const email = authUser?.user?.email ?? null;
    if (!email) {
      console.error("[stripe webhook] welcome-email: no email on auth user", claimed.user_id);
      return;
    }
    const { data: prof } = await admin
      .from("profiles")
      .select("display_name")
      .eq("id", claimed.user_id)
      .maybeSingle();
    const displayName = (prof?.display_name as string | null) ?? null;
    const firstName = displayName ? displayName.trim().split(/\s+/)[0] || null : null;

    const send = await sendWelcomeCoachEmail({ toEmail: email, firstName });
    if (!send.ok) {
      console.error("[stripe webhook] welcome-email send failed", send.error);
      // We intentionally do NOT unset the claim — avoids double-sends on retry
      // at the cost of losing this email on transient Resend failure.
      return;
    }
    console.log(`[stripe webhook] welcome-email sent to ${email} (id=${send.messageId})`);
  } catch (e) {
    console.error("[stripe webhook] welcome-email unexpected error", (e as Error).message);
  }
}

/** Extract the subscription id a schedule manages, handling released
 *  schedules (where `subscription` is null but `released_subscription`
 *  holds the original id). */
function subscriptionIdFromSchedule(
  sched: Stripe.SubscriptionSchedule,
): string | null {
  if (typeof sched.subscription === "string") return sched.subscription;
  if (sched.subscription && "id" in sched.subscription) return sched.subscription.id;
  if (typeof sched.released_subscription === "string") return sched.released_subscription;
  return null;
}

/** Mirror a Stripe schedule's pending phase-2 transition into our
 *  pending_change_* columns. No-op if the schedule doesn't represent a
 *  recognizable tier change (e.g. someone created a schedule for some
 *  unrelated purpose via the dashboard). */
async function syncPendingChangeFromSchedule(
  sched: Stripe.SubscriptionSchedule,
): Promise<void> {
  const subId = subscriptionIdFromSchedule(sched);
  if (!subId) return;
  // Only act on schedules that are still scheduling future phases.
  if (sched.status !== "active" && sched.status !== "not_started") return;

  const config = await getStripeConfig();
  // Phase 2 (the post-transition phase) is the one whose price tells us
  // where the subscription is heading. Falls back to last phase if the
  // schedule has unusual phase ordering.
  const futurePhase = sched.phases.find(
    (p) => (p.start_date ?? 0) * 1000 > Date.now(),
  ) ?? sched.phases[sched.phases.length - 1];
  if (!futurePhase) return;

  const tierItem = futurePhase.items?.find((it) => {
    const priceId = typeof it.price === "string" ? it.price : it.price?.id;
    return priceId ? !isSeatPriceId(config, priceId) && tierForPriceId(config, priceId) !== null : false;
  });
  if (!tierItem) return;
  const tierPriceId = typeof tierItem.price === "string" ? tierItem.price : tierItem.price?.id;
  if (!tierPriceId) return;
  const mapped = tierForPriceId(config, tierPriceId);
  if (!mapped) return;

  const effectiveAt = futurePhase.start_date
    ? new Date(futurePhase.start_date * 1000).toISOString()
    : null;

  const admin = createServiceRoleClient();
  await admin
    .from("subscriptions")
    .update({
      pending_change_tier: mapped.tier,
      pending_change_effective_at: effectiveAt,
      pending_change_schedule_id: sched.id,
    })
    .eq("stripe_subscription_id", subId);
}

/** Clear pending_change_* for a subscription whose schedule has
 *  ended (released, canceled, or completed). */
async function clearPendingChangeForSchedule(
  sched: Stripe.SubscriptionSchedule,
): Promise<void> {
  const subId = subscriptionIdFromSchedule(sched);
  if (!subId) return;
  const admin = createServiceRoleClient();
  await admin
    .from("subscriptions")
    .update({
      pending_change_tier: null,
      pending_change_effective_at: null,
      pending_change_schedule_id: null,
    })
    .eq("stripe_subscription_id", subId);
}

/** Grant a Coach Cal cost-budget top-up to the buyer's owner_seat_grants
 *  row. The Cal cap is now cost-based (micro-USD windows, not message
 *  count), so a pack purchase adds a fixed slice of monthly *budget*
 *  (COACH_CAL_PACK_BUDGET_MICROS). Stamps purchased_budget_month with the
 *  current UTC first-of-month so getCoachCalCostState ignores the credit
 *  once the month rolls over. Second pack in the same month adds to the
 *  running total; a pack after a month boundary resets to this month. */
async function applyCoachCalPackPurchase(session: Stripe.Checkout.Session): Promise<void> {
  const userId =
    (session.metadata?.user_id as string | undefined) ??
    (typeof session.client_reference_id === "string" ? session.client_reference_id : undefined);
  if (!userId) {
    console.error("[stripe webhook] coach_cal_messages: no user_id on session", session.id);
    return;
  }

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthStr = monthStart.toISOString().slice(0, 10);

  const admin = createServiceRoleClient();
  const { data: existing } = await admin
    .from("owner_seat_grants")
    .select("purchased_budget_micros, purchased_budget_month")
    .eq("owner_id", userId)
    .maybeSingle();
  const current =
    existing?.purchased_budget_month === monthStr
      ? ((existing.purchased_budget_micros as number | null) ?? 0)
      : 0;
  const nextTotal = current + COACH_CAL_PACK_BUDGET_MICROS;

  const { error } = await admin
    .from("owner_seat_grants")
    .upsert(
      {
        owner_id: userId,
        purchased_budget_micros: nextTotal,
        purchased_budget_month: monthStr,
      },
      { onConflict: "owner_id" },
    );
  if (error) throw new Error(`coach_cal_pack budget upsert failed: ${error.message}`);
}

export async function POST(req: Request): Promise<NextResponse> {
  const config = await getStripeConfig();
  if (!config.webhookSecret) {
    return NextResponse.json(
      { error: "Webhook secret not configured." },
      { status: 503 },
    );
  }
  if (!config.secretKey) {
    return NextResponse.json({ error: "Stripe not configured." }, { status: 503 });
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "Missing signature." }, { status: 400 });

  const bodyText = await req.text();
  const { stripe } = await getStripeClient();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(bodyText, sig, config.webhookSecret);
  } catch (e) {
    return NextResponse.json(
      { error: `Signature verification failed: ${e instanceof Error ? e.message : "unknown"}` },
      { status: 400 },
    );
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        if (session.mode === "subscription" && session.subscription) {
          const subId =
            typeof session.subscription === "string" ? session.subscription : session.subscription.id;
          const sub = await stripe.subscriptions.retrieve(subId);
          const uid = await upsertSubscriptionFromStripe(sub);
          await pushAdminSubscriptionNotice(uid);
          await maybeFireWelcomeEmail(subId);
        } else if (
          session.mode === "payment" &&
          session.metadata?.pack_kind === "coach_cal_messages"
        ) {
          await applyCoachCalPackPurchase(session);
        } else if (
          session.mode === "payment" &&
          session.metadata?.kind === "league_registration"
        ) {
          await markRegistrationPaid(session);
        }
        break;
      }
      case "account.updated": {
        // A connected operator account changed (onboarding progressed, or a
        // capability was lost) — keep leagues.stripe_charges_enabled in sync so
        // the cached gate that authorizes registration checkout stays accurate.
        const account = event.data.object;
        const admin = createServiceRoleClient();
        await admin
          .from("leagues")
          .update({ stripe_charges_enabled: !!account.charges_enabled })
          .eq("stripe_account_id", account.id);
        break;
      }
      case "customer.subscription.created": {
        // Initial-purchase signal (e.g. subscriptions created directly via the
        // Stripe API rather than Checkout). Fire the welcome email here — but
        // NOT on .updated, so routine subscription changes never re-welcome an
        // existing coach. The sent-at guard keeps it to once per subscription.
        const uid = await upsertSubscriptionFromStripe(event.data.object);
        await pushAdminSubscriptionNotice(uid);
        await maybeFireWelcomeEmail(event.data.object.id);
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const uid = await upsertSubscriptionFromStripe(event.data.object);
        await pushAdminSubscriptionNotice(uid);
        await maybeFireCancellationFeedback(event.data.object.id);
        break;
      }
      case "subscription_schedule.released":
      case "subscription_schedule.canceled":
      case "subscription_schedule.completed": {
        // Schedule lifecycle ended (user canceled the pending change, or
        // it finished transitioning). Clear pending_change_* on the
        // affected subscription. After-transition tier updates are
        // handled in upsertSubscriptionFromStripe above.
        await clearPendingChangeForSchedule(event.data.object);
        break;
      }
      case "subscription_schedule.created":
      case "subscription_schedule.updated": {
        // Defense-in-depth: the action that creates a schedule writes
        // pending_change_* directly, but if a schedule lands here from
        // another path (Stripe Portal, manual ops) we still want to
        // mirror the pending change into our DB.
        await syncPendingChangeFromSchedule(event.data.object);
        break;
      }
      default:
        break;
    }
    return NextResponse.json({ received: true });
  } catch (e) {
    console.error("[stripe webhook] handler error", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Webhook handler error." },
      { status: 500 },
    );
  }
}
