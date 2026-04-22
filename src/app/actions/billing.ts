"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import type { SubscriptionTier } from "@/lib/billing/entitlement";
import { getStripeClient, priceIdFor, type BillingInterval } from "@/lib/billing/stripe";

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
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/account?checkout=success`,
      cancel_url: `${origin}/account?checkout=cancel`,
      allow_promotion_codes: true,
      client_reference_id: user.id,
      subscription_data: {
        metadata: { user_id: user.id, tier: input.tier, interval: input.interval },
      },
      metadata: { user_id: user.id, tier: input.tier, interval: input.interval },
    });
    if (!session.url) return { ok: false, error: "Stripe did not return a Checkout URL." };
    return { ok: true, url: session.url };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Checkout failed." };
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
