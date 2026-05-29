import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getStripeClient, tierForPriceId, isSeatPriceId } from "@/lib/billing/stripe";
import { getStripeConfig } from "@/lib/site/stripe-config";
import type { SubscriptionTier } from "@/lib/billing/entitlement";
import { COACH_CAL_PACK_BUDGET_MICROS } from "@/lib/billing/coach-cal-cost-cap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function upsertSubscriptionFromStripe(sub: Stripe.Subscription): Promise<void> {
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
          await upsertSubscriptionFromStripe(sub);
        } else if (
          session.mode === "payment" &&
          session.metadata?.pack_kind === "coach_cal_messages"
        ) {
          await applyCoachCalPackPurchase(session);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        await upsertSubscriptionFromStripe(event.data.object);
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
