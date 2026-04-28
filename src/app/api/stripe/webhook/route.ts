import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getStripeClient, tierForPriceId, isSeatPriceId } from "@/lib/billing/stripe";
import { getStripeConfig } from "@/lib/site/stripe-config";
import type { SubscriptionTier } from "@/lib/billing/entitlement";

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

  const row = {
    user_id: userId,
    tier,
    status: sub.status,
    stripe_customer_id: customerId,
    stripe_subscription_id: sub.id,
    stripe_price_id: priceId,
    current_period_end: periodEndUnix ? new Date(periodEndUnix * 1000).toISOString() : null,
    cancel_at_period_end: sub.cancel_at_period_end ?? false,
    billing_interval: interval === "month" || interval === "year" ? interval : null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await admin
    .from("subscriptions")
    .upsert(row, { onConflict: "stripe_subscription_id" });
  if (error) throw new Error(`subscriptions upsert failed: ${error.message}`);

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

/** Add a Coach Cal message pack to the buyer's owner_seat_grants row.
 *  Stamps purchased_messages_month with the current UTC first-of-month
 *  so getCoachCalCapState ignores the credit once the month rolls over.
 *  If the buyer purchases a second pack in the same month, the counts
 *  add. If their last pack was last month, we reset to this month's
 *  count. */
async function applyCoachCalPackPurchase(session: Stripe.Checkout.Session): Promise<void> {
  const userId =
    (session.metadata?.user_id as string | undefined) ??
    (typeof session.client_reference_id === "string" ? session.client_reference_id : undefined);
  if (!userId) {
    console.error("[stripe webhook] coach_cal_messages: no user_id on session", session.id);
    return;
  }
  const messageCount = Number(session.metadata?.message_count ?? 0);
  if (!Number.isFinite(messageCount) || messageCount <= 0) {
    console.error("[stripe webhook] coach_cal_messages: invalid message_count", session.id);
    return;
  }

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthStr = monthStart.toISOString().slice(0, 10);

  const admin = createServiceRoleClient();
  const { data: existing } = await admin
    .from("owner_seat_grants")
    .select("purchased_messages, purchased_messages_month")
    .eq("owner_id", userId)
    .maybeSingle();
  const current =
    existing?.purchased_messages_month === monthStr
      ? ((existing.purchased_messages as number | null) ?? 0)
      : 0;
  const nextTotal = current + Math.floor(messageCount);

  const { error } = await admin
    .from("owner_seat_grants")
    .upsert(
      {
        owner_id: userId,
        purchased_messages: nextTotal,
        purchased_messages_month: monthStr,
      },
      { onConflict: "owner_id" },
    );
  if (error) throw new Error(`coach_cal_messages upsert failed: ${error.message}`);
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
