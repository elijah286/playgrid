"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { getStripeClient } from "@/lib/billing/stripe";
import { getCoachCalPackConfig } from "@/lib/site/coach-cal-pack-config";

async function siteOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

async function getOrCreateCustomerId(userId: string, email: string): Promise<string> {
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

/** Start Stripe Checkout for a one-time Coach Cal message pack. The
 *  webhook handler grants the messages on checkout.session.completed —
 *  this action just hands back a checkout URL for the chat client to
 *  redirect to. */
export async function createMessagePackCheckoutAction(): Promise<
  { ok: true; url: string } | { ok: false; error: string }
> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  try {
    const { stripe, config } = await getStripeClient();
    const priceId = config.priceIds.coach_cal_pack;
    if (!priceId) {
      return {
        ok: false,
        error: "Message pack isn't configured yet. Ask the site admin to set the Stripe price ID.",
      };
    }

    const pack = await getCoachCalPackConfig();
    const customerId = await getOrCreateCustomerId(user.id, user.email ?? "");
    const origin = await siteOrigin();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/account?coach_cal_pack=success`,
      cancel_url: `${origin}/account?coach_cal_pack=cancel`,
      allow_promotion_codes: true,
      client_reference_id: user.id,
      payment_intent_data: {
        metadata: {
          user_id: user.id,
          pack_kind: "coach_cal_messages",
          message_count: String(pack.messageCount),
        },
      },
      metadata: {
        user_id: user.id,
        pack_kind: "coach_cal_messages",
        message_count: String(pack.messageCount),
      },
    });
    if (!session.url) return { ok: false, error: "Stripe did not return a Checkout URL." };
    return { ok: true, url: session.url };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Checkout failed." };
  }
}
