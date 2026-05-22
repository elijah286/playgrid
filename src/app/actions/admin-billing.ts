"use server";

import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import type { SubscriptionTier } from "@/lib/billing/entitlement";
import { getStripeConfigStatus, type StripeConfigStatus } from "@/lib/site/stripe-config";
import { setCoachAiTierEnabled } from "@/lib/site/pricing-config";
import {
  getStripeClient,
  tierForPriceId,
  type BillingInterval,
} from "@/lib/billing/stripe";

const SITE_ROW_ID = "default";

type PriceKey =
  | "stripe_price_coach_month"
  | "stripe_price_coach_year"
  | "stripe_price_coach_ai_month"
  | "stripe_price_coach_ai_year"
  | "stripe_price_seat_month"
  | "stripe_price_seat_year"
  | "stripe_price_coach_cal_pack";

async function assertAdmin() {
  if (!hasSupabaseEnv()) {
    return { ok: false as const, error: "Supabase is not configured." };
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };
  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return { ok: false as const, error: "Forbidden." };
  return { ok: true as const, userId: user.id };
}

export type BillingUserRow = {
  id: string;
  email: string;
  displayName: string | null;
  role: "user" | "admin" | "coach";
  tier: SubscriptionTier;
  source: "comp" | "stripe" | "free";
  expiresAt: string | null;
  compGrantId: string | null;
  subscriptionId: string | null;
  createdAt: string;
};

export async function listBillingForAdminAction(): Promise<
  { ok: true; users: BillingUserRow[] } | { ok: false; error: string }
> {
  const gate = await assertAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const admin = createServiceRoleClient();
  const { data: authData, error: authErr } =
    await admin.auth.admin.listUsers({ perPage: 500, page: 1 });
  if (authErr) return { ok: false, error: authErr.message };

  const [{ data: profiles }, { data: entitlements }] = await Promise.all([
    admin.from("profiles").select("id, display_name, role"),
    admin
      .from("user_entitlements")
      .select("user_id, tier, source, expires_at, comp_grant_id, subscription_id"),
  ]);

  const pmap = new Map((profiles ?? []).map((p) => [p.id, p]));
  const emap = new Map((entitlements ?? []).map((e) => [e.user_id, e]));

  const users: BillingUserRow[] = (authData.users ?? []).map((u) => {
    const p = pmap.get(u.id);
    const e = emap.get(u.id);
    return {
      id: u.id,
      email: u.email ?? "",
      displayName: p?.display_name ?? null,
      role: (p?.role as BillingUserRow["role"]) ?? "user",
      tier: (e?.tier as SubscriptionTier) ?? "free",
      source: (e?.source as BillingUserRow["source"]) ?? "free",
      expiresAt: (e?.expires_at as string | null) ?? null,
      compGrantId: (e?.comp_grant_id as string | null) ?? null,
      subscriptionId: (e?.subscription_id as string | null) ?? null,
      createdAt: u.created_at,
    };
  });

  return { ok: true, users };
}

export async function grantCompAction(input: {
  userId: string;
  tier: SubscriptionTier;
  note?: string;
  expiresAt?: string | null;
}) {
  const gate = await assertAdmin();
  if (!gate.ok) return gate;

  const admin = createServiceRoleClient();
  const { error } = await admin.from("comp_grants").insert({
    user_id: input.userId,
    tier: input.tier,
    note: input.note ?? null,
    granted_by: gate.userId,
    expires_at: input.expiresAt ?? null,
  });
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/settings");
  return { ok: true as const };
}

export async function revokeCompAction(compGrantId: string) {
  const gate = await assertAdmin();
  if (!gate.ok) return gate;

  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("comp_grants")
    .update({ revoked_at: new Date().toISOString(), revoked_by: gate.userId })
    .eq("id", compGrantId);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/settings");
  return { ok: true as const };
}

/**
 * Cancel a user's active Stripe subscription immediately, with an optional
 * full refund of the most recent paid invoice. Intended for admin reset of
 * test accounts and exceptional support cases — coaches self-serve via the
 * Stripe portal in normal flow.
 *
 * Steps:
 *  1. Resolve the active subscription row for the user.
 *  2. (Optional) Refund the latest paid invoice's PaymentIntent. Refund
 *     failure does NOT block cancellation; we report it back so the admin
 *     can retry in Stripe directly.
 *  3. Call `stripe.subscriptions.cancel(...)` (immediate, not period-end).
 *  4. Mirror the resulting status into our `subscriptions` row so the
 *     admin UI reflects the change without waiting for the webhook to fire.
 */
export async function cancelStripeSubscriptionAction(input: {
  userId: string;
  refundLastPayment: boolean;
}): Promise<
  | {
      ok: true;
      refundedCents: number | null;
      refundedCurrency: string | null;
      refundError: string | null;
    }
  | { ok: false; error: string }
> {
  const gate = await assertAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const admin = createServiceRoleClient();
  const { data: sub, error: subErr } = await admin
    .from("subscriptions")
    .select("stripe_subscription_id, status")
    .eq("user_id", input.userId)
    .in("status", ["active", "trialing", "past_due"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (subErr) return { ok: false, error: subErr.message };
  if (!sub?.stripe_subscription_id) {
    return { ok: false, error: "No active Stripe subscription found for this user." };
  }

  let stripe;
  try {
    ({ stripe } = await getStripeClient());
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Stripe not configured." };
  }

  let refundedCents: number | null = null;
  let refundedCurrency: string | null = null;
  let refundError: string | null = null;

  if (input.refundLastPayment) {
    try {
      // Stripe SDK v22 removed `Invoice.payment_intent`; we now expand the
      // nested `payments` list and pull the PaymentIntent off the first
      // succeeded payment on the most recent paid invoice.
      const invoices = await stripe.invoices.list({
        subscription: sub.stripe_subscription_id,
        limit: 10,
        expand: ["data.payments"],
      });
      const paid = invoices.data.find(
        (i) => i.status === "paid" && (i.amount_paid ?? 0) > 0,
      );
      const paymentRecord = paid?.payments?.data.find(
        (p) =>
          p.status === "paid" &&
          p.payment?.type === "payment_intent" &&
          p.payment.payment_intent,
      );
      const paymentIntentRef = paymentRecord?.payment?.payment_intent ?? null;
      const paymentIntentId =
        typeof paymentIntentRef === "string"
          ? paymentIntentRef
          : (paymentIntentRef?.id ?? null);
      if (!paymentIntentId) {
        refundError = "No paid PaymentIntent found on recent invoices.";
      } else {
        const refund = await stripe.refunds.create({
          payment_intent: paymentIntentId,
        });
        refundedCents = refund.amount ?? null;
        refundedCurrency = refund.currency ?? null;
      }
    } catch (e) {
      refundError =
        e instanceof Error
          ? e.message
          : "Refund failed for an unknown reason.";
    }
  }

  let canceledStatus: string;
  let canceledAtIso: string | null;
  try {
    const canceled = await stripe.subscriptions.cancel(sub.stripe_subscription_id);
    canceledStatus = canceled.status;
    canceledAtIso = canceled.canceled_at
      ? new Date(canceled.canceled_at * 1000).toISOString()
      : new Date().toISOString();
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Stripe cancel call failed.",
    };
  }

  // Mirror the new status immediately so the admin UI updates without
  // waiting on the webhook. The webhook will overwrite with the full
  // payload when it arrives, which is fine — fields agree.
  await admin
    .from("subscriptions")
    .update({
      status: canceledStatus,
      cancel_at: canceledAtIso,
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_subscription_id", sub.stripe_subscription_id);

  revalidatePath("/settings");
  return {
    ok: true,
    refundedCents,
    refundedCurrency,
    refundError,
  };
}

/**
 * Full billing reset for a user — wipes every trace of paid history so
 * the next checkout behaves as if they're a brand-new visitor (trial
 * granted, no prior coach_ai row, no comp). Intended for admin reset of
 * test accounts (so we can re-evaluate the first-time-buyer experience),
 * NOT for support / refund cases — use cancelStripeSubscriptionAction
 * for those.
 *
 * Steps (in order, each best-effort with errors accumulated):
 *  1. Cancel every non-terminal Stripe subscription for the user's
 *     customer(s). Already-canceled subs are skipped.
 *  2. (Optional) Refund every paid invoice on those customers. The
 *     `payment_intent` is pulled off the expanded `payments` collection
 *     (Stripe SDK v22 removed top-level `Invoice.payment_intent`).
 *  3. Delete every `subscriptions` row for the user. This is what
 *     clears the trial-eligibility gate — the gate disqualifies on any
 *     historical `tier='coach_ai'` row regardless of status. Webhooks
 *     that arrive after the deletes will re-insert canceled rows; the
 *     admin can re-reset if that happens.
 *  4. Revoke every active `comp_grants` row for the user (so a stale
 *     grant doesn't keep entitling them).
 *
 * The user_entitlements view is derived from subscriptions ∪ comp_grants
 * so the user automatically drops to `free` once both are clean.
 */
export async function resetUserBillingAction(input: {
  userId: string;
  refundAllPayments: boolean;
}): Promise<
  | {
      ok: true;
      subscriptionsCanceled: number;
      invoicesRefunded: number;
      refundedTotalCents: number;
      subscriptionRowsDeleted: number;
      compGrantsRevoked: number;
      errors: string[];
    }
  | { ok: false; error: string }
> {
  const gate = await assertAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const admin = createServiceRoleClient();
  const errors: string[] = [];

  // Collect every Stripe customer this user has touched, via the
  // `subscriptions` mirror. Falls back to an auth-email lookup so we
  // also catch customers created out-of-band (e.g. a Checkout that
  // never produced a subscription, or rows previously hard-deleted).
  const customerIds = new Set<string>();
  const { data: subRows, error: subErr } = await admin
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", input.userId)
    .not("stripe_customer_id", "is", null);
  if (subErr) errors.push(`subscriptions lookup: ${subErr.message}`);
  for (const row of subRows ?? []) {
    if (row.stripe_customer_id) customerIds.add(row.stripe_customer_id as string);
  }

  let stripe;
  try {
    ({ stripe } = await getStripeClient());
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Stripe not configured." };
  }

  // Email-based fallback: any Stripe customer with this user's email,
  // even if we never recorded a subscriptions row for them, gets the
  // same treatment so a half-completed checkout doesn't leave a trial-
  // disqualifying ghost customer behind.
  try {
    const { data: authUser } = await admin.auth.admin.getUserById(input.userId);
    const email = authUser?.user?.email ?? null;
    if (email) {
      const list = await stripe.customers.list({ email, limit: 20 });
      for (const c of list.data) customerIds.add(c.id);
    }
  } catch (e) {
    errors.push(`customer email lookup: ${e instanceof Error ? e.message : "unknown"}`);
  }

  // Step 1 + 2: cancel subs + refund invoices per customer.
  let subscriptionsCanceled = 0;
  let invoicesRefunded = 0;
  let refundedTotalCents = 0;

  for (const customerId of customerIds) {
    let allSubs: Awaited<ReturnType<typeof stripe.subscriptions.list>>["data"] = [];
    try {
      const resp = await stripe.subscriptions.list({
        customer: customerId,
        status: "all",
        limit: 100,
      });
      allSubs = resp.data;
    } catch (e) {
      errors.push(`list subs for ${customerId}: ${e instanceof Error ? e.message : "unknown"}`);
    }

    for (const sub of allSubs) {
      if (sub.status === "canceled" || sub.status === "incomplete_expired") continue;
      try {
        await stripe.subscriptions.cancel(sub.id);
        subscriptionsCanceled++;
      } catch (e) {
        errors.push(`cancel ${sub.id}: ${e instanceof Error ? e.message : "unknown"}`);
      }
    }

    if (input.refundAllPayments) {
      try {
        const invoices = await stripe.invoices.list({
          customer: customerId,
          limit: 100,
          expand: ["data.payments"],
        });
        for (const inv of invoices.data) {
          if (inv.status !== "paid" || (inv.amount_paid ?? 0) <= 0) continue;
          const paymentRecord = inv.payments?.data.find(
            (p) =>
              p.status === "paid" &&
              p.payment?.type === "payment_intent" &&
              p.payment.payment_intent,
          );
          const piRef = paymentRecord?.payment?.payment_intent ?? null;
          const piId = typeof piRef === "string" ? piRef : (piRef?.id ?? null);
          if (!piId) continue;
          try {
            const refund = await stripe.refunds.create({ payment_intent: piId });
            invoicesRefunded++;
            refundedTotalCents += refund.amount ?? 0;
          } catch (e) {
            // "charge_already_refunded" is expected if an admin already
            // refunded manually — skip silently rather than counting it
            // as an error the operator needs to act on.
            const msg = e instanceof Error ? e.message : "unknown";
            if (!/already.*refunded|amount=0/i.test(msg)) {
              errors.push(`refund invoice ${inv.id}: ${msg}`);
            }
          }
        }
      } catch (e) {
        errors.push(`list invoices for ${customerId}: ${e instanceof Error ? e.message : "unknown"}`);
      }
    }
  }

  // Step 3: delete every subscriptions row for the user.
  let subscriptionRowsDeleted = 0;
  const { data: deletedSubs, error: delErr } = await admin
    .from("subscriptions")
    .delete()
    .eq("user_id", input.userId)
    .select("id");
  if (delErr) errors.push(`subscriptions delete: ${delErr.message}`);
  else subscriptionRowsDeleted = (deletedSubs ?? []).length;

  // Step 4: revoke active comp_grants.
  let compGrantsRevoked = 0;
  const { data: revokedGrants, error: revErr } = await admin
    .from("comp_grants")
    .update({ revoked_at: new Date().toISOString(), revoked_by: gate.userId })
    .eq("user_id", input.userId)
    .is("revoked_at", null)
    .select("id");
  if (revErr) errors.push(`comp_grants revoke: ${revErr.message}`);
  else compGrantsRevoked = (revokedGrants ?? []).length;

  revalidatePath("/settings");
  return {
    ok: true,
    subscriptionsCanceled,
    invoicesRefunded,
    refundedTotalCents,
    subscriptionRowsDeleted,
    compGrantsRevoked,
    errors,
  };
}

export type GiftCodeRow = {
  id: string;
  code: string;
  tier: SubscriptionTier;
  durationDays: number | null;
  maxUses: number;
  usedCount: number;
  note: string | null;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
};

function generateCode(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 10; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

export async function createGiftCodeAction(input: {
  tier: SubscriptionTier;
  durationDays: number | null;
  maxUses: number;
  note?: string;
  expiresAt?: string | null;
  code?: string;
}) {
  const gate = await assertAdmin();
  if (!gate.ok) return gate;

  const code = (input.code?.trim() || generateCode()).toUpperCase();
  if (!/^[A-Z0-9-]{6,64}$/.test(code)) {
    return { ok: false as const, error: "Code must be 6–64 chars, A-Z/0-9/-." };
  }
  if (input.maxUses < 1) {
    return { ok: false as const, error: "maxUses must be >= 1." };
  }

  const admin = createServiceRoleClient();
  const { error } = await admin.from("gift_codes").insert({
    code,
    tier: input.tier,
    duration_days: input.durationDays,
    max_uses: input.maxUses,
    note: input.note ?? null,
    created_by: gate.userId,
    expires_at: input.expiresAt ?? null,
  });
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/settings");
  return { ok: true as const, code };
}

export async function listGiftCodesAction(): Promise<
  { ok: true; codes: GiftCodeRow[] } | { ok: false; error: string }
> {
  const gate = await assertAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from("gift_codes")
    .select("id, code, tier, duration_days, max_uses, used_count, note, created_at, expires_at, revoked_at")
    .order("created_at", { ascending: false });
  if (error) return { ok: false, error: error.message };

  const codes: GiftCodeRow[] = (data ?? []).map((c) => ({
    id: c.id,
    code: c.code,
    tier: c.tier as SubscriptionTier,
    durationDays: c.duration_days,
    maxUses: c.max_uses,
    usedCount: c.used_count,
    note: c.note,
    createdAt: c.created_at,
    expiresAt: c.expires_at,
    revokedAt: c.revoked_at,
  }));

  return { ok: true, codes };
}

export async function getStripeConfigStatusAction(): Promise<
  { ok: true; status: StripeConfigStatus } | { ok: false; error: string }
> {
  const gate = await assertAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  try {
    const status = await getStripeConfigStatus();
    return { ok: true, status };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not load Stripe config." };
  }
}

export async function saveStripeConfigAction(input: {
  secretKey?: string;
  publishableKey?: string;
  webhookSecret?: string;
  priceCoachMonth?: string;
  priceCoachYear?: string;
  priceCoachAiMonth?: string;
  priceCoachAiYear?: string;
  priceSeatMonth?: string;
  priceSeatYear?: string;
  priceCoachCalPack?: string;
}) {
  const gate = await assertAdmin();
  if (!gate.ok) return gate;

  const patch: Record<string, string | null> = { updated_at: new Date().toISOString() };

  function normalize(v: string | undefined): string | null | undefined {
    if (v === undefined) return undefined;
    const t = v.trim();
    return t.length === 0 ? null : t;
  }

  const secret = normalize(input.secretKey);
  if (secret !== undefined) {
    if (secret !== null && !secret.startsWith("sk_test_") && !secret.startsWith("sk_live_")) {
      return { ok: false as const, error: "Secret key should start with sk_test_ or sk_live_." };
    }
    patch.stripe_secret_key = secret;
  }

  const pub = normalize(input.publishableKey);
  if (pub !== undefined) {
    if (pub !== null && !pub.startsWith("pk_test_") && !pub.startsWith("pk_live_")) {
      return { ok: false as const, error: "Publishable key should start with pk_test_ or pk_live_." };
    }
    patch.stripe_publishable_key = pub;
  }

  const hook = normalize(input.webhookSecret);
  if (hook !== undefined) {
    if (hook !== null && !hook.startsWith("whsec_")) {
      return { ok: false as const, error: "Webhook secret should start with whsec_." };
    }
    patch.stripe_webhook_secret = hook;
  }

  const priceFields: Array<[keyof typeof input, PriceKey]> = [
    ["priceCoachMonth", "stripe_price_coach_month"],
    ["priceCoachYear", "stripe_price_coach_year"],
    ["priceCoachAiMonth", "stripe_price_coach_ai_month"],
    ["priceCoachAiYear", "stripe_price_coach_ai_year"],
    ["priceSeatMonth", "stripe_price_seat_month"],
    ["priceSeatYear", "stripe_price_seat_year"],
    ["priceCoachCalPack", "stripe_price_coach_cal_pack"],
  ];
  for (const [inKey, dbKey] of priceFields) {
    const v = normalize(input[inKey]);
    if (v !== undefined) {
      if (v !== null && !v.startsWith("price_")) {
        return { ok: false as const, error: "Price IDs must start with price_." };
      }
      patch[dbKey] = v;
    }
  }

  const admin = createServiceRoleClient();
  const { error } = await admin.from("site_settings").update(patch).eq("id", SITE_ROW_ID);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/settings");
  return { ok: true as const };
}

export async function clearStripeConfigAction() {
  const gate = await assertAdmin();
  if (!gate.ok) return gate;
  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("site_settings")
    .update({
      stripe_secret_key: null,
      stripe_publishable_key: null,
      stripe_webhook_secret: null,
      stripe_price_coach_month: null,
      stripe_price_coach_year: null,
      stripe_price_coach_ai_month: null,
      stripe_price_coach_ai_year: null,
      stripe_price_seat_month: null,
      stripe_price_seat_year: null,
      stripe_price_coach_cal_pack: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", SITE_ROW_ID);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/settings");
  return { ok: true as const };
}

export async function testStripeSecretAction(proposed?: string) {
  const gate = await assertAdmin();
  if (!gate.ok) return gate;
  const admin = createServiceRoleClient();
  let key = (proposed ?? "").trim();
  if (!key) {
    const { data } = await admin
      .from("site_settings")
      .select("stripe_secret_key")
      .eq("id", SITE_ROW_ID)
      .maybeSingle();
    key = data?.stripe_secret_key ?? "";
  }
  if (!key) return { ok: false as const, error: "No key to test — paste one above or save first." };

  const res = await fetch("https://api.stripe.com/v1/balance", {
    headers: { Authorization: `Bearer ${key}` },
    cache: "no-store",
  });
  if (!res.ok) {
    let msg = `Request failed (${res.status}).`;
    try {
      const j = (await res.json()) as { error?: { message?: string } };
      if (j.error?.message) msg = j.error.message;
    } catch {
      /* ignore */
    }
    return { ok: false as const, error: msg };
  }
  return {
    ok: true as const,
    message: `Connection OK — mode: ${key.startsWith("sk_live_") ? "live" : "test"}.`,
  };
}

export async function setCoachAiTierEnabledAction(next: boolean) {
  const gate = await assertAdmin();
  if (!gate.ok) return gate;
  try {
    await setCoachAiTierEnabled(next);
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Could not save." };
  }
  revalidatePath("/settings");
  revalidatePath("/pricing");
  return { ok: true as const };
}

export async function revokeGiftCodeAction(codeId: string) {
  const gate = await assertAdmin();
  if (!gate.ok) return gate;

  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("gift_codes")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", codeId);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/settings");
  return { ok: true as const };
}

export async function reinstateGiftCodeAction(codeId: string) {
  const gate = await assertAdmin();
  if (!gate.ok) return gate;

  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("gift_codes")
    .update({ revoked_at: null })
    .eq("id", codeId);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/settings");
  return { ok: true as const };
}

export async function updateGiftCodeDurationAction(
  codeId: string,
  durationDays: number | null,
) {
  const gate = await assertAdmin();
  if (!gate.ok) return gate;

  if (durationDays !== null) {
    if (
      !Number.isFinite(durationDays) ||
      !Number.isInteger(durationDays) ||
      durationDays < 1
    ) {
      return {
        ok: false as const,
        error: "Duration must be a positive whole number of days, or unlimited.",
      };
    }
  }

  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("gift_codes")
    .update({ duration_days: durationDays })
    .eq("id", codeId);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/settings");
  return { ok: true as const };
}

export async function updateGiftCodeMaxUsesAction(codeId: string, maxUses: number) {
  const gate = await assertAdmin();
  if (!gate.ok) return gate;

  if (!Number.isFinite(maxUses) || !Number.isInteger(maxUses) || maxUses < 1) {
    return { ok: false as const, error: "Max uses must be a positive whole number." };
  }

  const admin = createServiceRoleClient();
  const { data: existing, error: readErr } = await admin
    .from("gift_codes")
    .select("used_count")
    .eq("id", codeId)
    .single();
  if (readErr) return { ok: false as const, error: readErr.message };
  if (maxUses < (existing?.used_count ?? 0)) {
    return {
      ok: false as const,
      error: `Max uses can't go below the number already redeemed (${existing.used_count}).`,
    };
  }

  const { error } = await admin
    .from("gift_codes")
    .update({ max_uses: maxUses })
    .eq("id", codeId);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/settings");
  return { ok: true as const };
}

/**
 * Combined cancellation signal: every row from our in-app pre-portal survey,
 * plus every subscription that carries a Stripe-portal cancellation reason
 * (reason / feedback enum / free-text comment).
 *
 * Both streams resolved to the user's email + display name so the admin can
 * scan and reach out without joining tables manually.
 */
export type CancellationFeedbackRow = {
  id: string;
  source: "in_app" | "stripe_portal";
  email: string;
  displayName: string | null;
  reason: string | null;
  feedback: string | null;
  message: string | null;
  stripeSubscriptionId: string | null;
  createdAt: string;
};

export async function listCancellationFeedbackForAdminAction(): Promise<
  | { ok: true; rows: CancellationFeedbackRow[] }
  | { ok: false; error: string }
> {
  const gate = await assertAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const admin = createServiceRoleClient();
  const [{ data: surveyRows, error: sErr }, { data: subRows, error: subErr }, { data: authData }] =
    await Promise.all([
      admin
        .from("subscription_cancellation_feedback")
        .select("id, user_id, message, stripe_subscription_id, created_at")
        .order("created_at", { ascending: false })
        .limit(500),
      admin
        .from("subscriptions")
        .select(
          "id, user_id, stripe_subscription_id, stripe_cancellation_reason, stripe_cancellation_feedback, stripe_cancellation_comment, updated_at",
        )
        .or(
          "stripe_cancellation_reason.not.is.null,stripe_cancellation_feedback.not.is.null,stripe_cancellation_comment.not.is.null",
        ),
      admin.auth.admin.listUsers({ perPage: 1000, page: 1 }),
    ]);
  if (sErr) return { ok: false, error: sErr.message };
  if (subErr) return { ok: false, error: subErr.message };

  const { data: profiles } = await admin.from("profiles").select("id, display_name");
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p.display_name as string | null]));
  const emailById = new Map(
    (authData?.users ?? []).map((u) => [u.id, u.email ?? ""]),
  );

  const rows: CancellationFeedbackRow[] = [];
  for (const r of surveyRows ?? []) {
    rows.push({
      id: `survey:${r.id}`,
      source: "in_app",
      email: emailById.get(r.user_id) ?? "",
      displayName: profileById.get(r.user_id) ?? null,
      reason: null,
      feedback: null,
      message: r.message,
      stripeSubscriptionId: r.stripe_subscription_id,
      createdAt: r.created_at,
    });
  }
  for (const r of subRows ?? []) {
    rows.push({
      id: `stripe:${r.id}`,
      source: "stripe_portal",
      email: emailById.get(r.user_id) ?? "",
      displayName: profileById.get(r.user_id) ?? null,
      reason: r.stripe_cancellation_reason,
      feedback: r.stripe_cancellation_feedback,
      message: r.stripe_cancellation_comment,
      stripeSubscriptionId: r.stripe_subscription_id,
      createdAt: r.updated_at,
    });
  }
  rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { ok: true, rows };
}

export type BillingSummary = {
  paidUsers: number;
  trialingUsers: number;
  mrr: number;
  lifetimeRevenue: number;
  asOf: string;
};

export type RevenueTierKey = "coach" | "coach_ai" | "pack" | "other";

export type RevenueBreakdown = {
  asOf: string;
  byTier: Array<{ tier: RevenueTierKey; count: number; mrr: number }>;
  monthly: Array<{
    month: string;
    total: number;
  }>;
  topCustomers: Array<{
    customerId: string;
    userId: string | null;
    email: string | null;
    displayName: string | null;
    tier: RevenueTierKey | null;
    lifetimeSpend: number;
  }>;
  summary: BillingSummary;
};

type StripeAggregate = {
  asOf: string;
  /** Subscriptions in status "active" — these contribute MRR. */
  activeSubs: Array<{
    customerId: string;
    tier: RevenueTierKey;
    interval: BillingInterval | null;
    mrrCents: number;
  }>;
  trialingCount: number;
  /** Last-12-months revenue by year-month. */
  byMonth: Record<string, { totalCents: number }>;
  /** Lifetime spend keyed by canonical buyer key — email-first so one-time
   *  Coach Cal pack purchases (which lack a Stripe customer.id) still
   *  aggregate per buyer. Falls back to `cust:${customerId}` when no email
   *  is on the charge. */
  byCustomer: Record<
    string,
    {
      totalCents: number;
      email: string | null;
      customerId: string | null;
    }
  >;
  /** Per-buyer tier — uses email as the key when matchable to an active
   *  sub's customer email, else customer.id. Buyers with no active sub but
   *  with one-time charges land in "pack". */
  tierByCustomer: Record<string, RevenueTierKey>;
  lifetimeNetCents: number;
};

// Single shared cache for the expensive Stripe iteration. Both the Overview
// summary and the Revenue tab derive from it.
let stripeAggregateCache: { ts: number; data: StripeAggregate } | null = null;
const STRIPE_AGGREGATE_TTL_MS = 60 * 60 * 1000;

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function last12MonthKeys(now = new Date()): string[] {
  const out: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push(monthKey(d));
  }
  return out;
}

async function buildStripeAggregate(): Promise<StripeAggregate> {
  const { stripe, config } = await getStripeClient();

  const aggregate: StripeAggregate = {
    asOf: new Date().toISOString(),
    activeSubs: [],
    trialingCount: 0,
    byMonth: {},
    byCustomer: {},
    tierByCustomer: {},
    lifetimeNetCents: 0,
  };

  // Map Stripe customer.id -> email so we can canonicalize tier lookups by
  // email later. Populated as we walk active subs (we expand the customer
  // so we get .email cheaply).
  const customerIdToEmail = new Map<string, string>();

  for (const status of ["active", "trialing"] as const) {
    let cursor: string | undefined;
    while (true) {
      const page: Awaited<ReturnType<typeof stripe.subscriptions.list>> =
        await stripe.subscriptions.list({
          status,
          limit: 100,
          starting_after: cursor,
          expand: ["data.items.data.price", "data.customer"],
        });
      for (const sub of page.data) {
        if (status === "trialing") {
          aggregate.trialingCount += 1;
          continue;
        }
        const customerObj =
          typeof sub.customer === "string" ? null : sub.customer;
        const customerId =
          typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? "";
        const customerEmail =
          customerObj && "email" in customerObj
            ? (customerObj.email ?? null)?.toLowerCase() ?? null
            : null;
        if (customerId && customerEmail) {
          customerIdToEmail.set(customerId, customerEmail);
        }
        let mrrCents = 0;
        let tier: RevenueTierKey = "other";
        let interval: BillingInterval | null = null;
        for (const item of sub.items.data) {
          const price = item.price;
          const unitAmount = price?.unit_amount ?? 0;
          const qty = item.quantity ?? 1;
          const intv = price?.recurring?.interval;
          if (unitAmount && intv) {
            const amount = unitAmount * qty;
            if (intv === "month") mrrCents += amount;
            else if (intv === "year") mrrCents += Math.round(amount / 12);
          }
          if (tier === "other" && price?.id) {
            const mapped = tierForPriceId(config, price.id);
            if (mapped) {
              tier = mapped.tier === "coach_ai" ? "coach_ai" : "coach";
              interval = mapped.interval;
            }
          }
        }
        aggregate.activeSubs.push({ customerId, tier, interval, mrrCents });
        // Key tier by email when available — that way pack charges (which
        // only carry an email, no customer.id) can still resolve a tier.
        const tierKey = customerEmail ?? (customerId ? `cust:${customerId}` : null);
        if (tierKey) aggregate.tierByCustomer[tierKey] = tier;
      }
      if (!page.has_more) break;
      cursor = page.data[page.data.length - 1]?.id;
      if (!cursor) break;
    }
  }

  const twelveMonthCutoff = (() => {
    const d = new Date();
    d.setUTCMonth(d.getUTCMonth() - 11, 1);
    d.setUTCHours(0, 0, 0, 0);
    return d.getTime();
  })();

  let chargeCursor: string | undefined;
  let pages = 0;
  const MAX_PAGES = 200;
  while (pages < MAX_PAGES) {
    const page: Awaited<ReturnType<typeof stripe.charges.list>> =
      await stripe.charges.list({
        limit: 100,
        starting_after: chargeCursor,
        expand: ["data.customer"],
      });
    for (const ch of page.data) {
      if (!ch.paid) continue;

      // Only count charges that are tied to an XOGridmaker product. XOGM's
      // checkout flows (subscriptions + Coach Cal packs) always attach a
      // Stripe customer; charges from any other business sharing this
      // Stripe account (e.g. Payment Links) have `customer: null` and are
      // skipped here so they don't pollute the revenue dashboard.
      const customerObj =
        typeof ch.customer === "string" || !ch.customer ? null : ch.customer;
      const customerId =
        typeof ch.customer === "string"
          ? ch.customer
          : ch.customer?.id ?? "";
      if (!customerId) continue;

      const net = (ch.amount_captured ?? 0) - (ch.amount_refunded ?? 0);
      aggregate.lifetimeNetCents += net;

      // Prefer the customer's email (from the expanded object, falling back
      // to whatever we cached when we walked active subs); else use the
      // customer ID itself so per-charge totals still aggregate.
      const expandedEmail =
        customerObj && "email" in customerObj
          ? (customerObj.email ?? null)?.toLowerCase() ?? null
          : null;
      const subEmail = customerIdToEmail.get(customerId) ?? null;
      const email = expandedEmail ?? subEmail;
      const key = email ? `email:${email}` : `cust:${customerId}`;
      const slot = aggregate.byCustomer[key] ?? {
        totalCents: 0,
        email: null,
        customerId: null,
      };
      slot.totalCents += net;
      if (!slot.email && email) slot.email = email;
      if (!slot.customerId) slot.customerId = customerId;
      aggregate.byCustomer[key] = slot;

      const createdMs = (ch.created ?? 0) * 1000;
      if (createdMs >= twelveMonthCutoff) {
        const monthBucketKey = monthKey(new Date(createdMs));
        const bucket = aggregate.byMonth[monthBucketKey] ?? { totalCents: 0 };
        bucket.totalCents += net;
        aggregate.byMonth[monthBucketKey] = bucket;
      }
    }
    pages += 1;
    if (!page.has_more) break;
    chargeCursor = page.data[page.data.length - 1]?.id;
    if (!chargeCursor) break;
  }

  return aggregate;
}

async function getStripeAggregate(): Promise<StripeAggregate> {
  if (
    stripeAggregateCache &&
    Date.now() - stripeAggregateCache.ts < STRIPE_AGGREGATE_TTL_MS
  ) {
    return stripeAggregateCache.data;
  }
  const data = await buildStripeAggregate();
  stripeAggregateCache = { ts: Date.now(), data };
  return data;
}

function summaryFromAggregate(agg: StripeAggregate): BillingSummary {
  const mrrCents = agg.activeSubs.reduce((s, a) => s + a.mrrCents, 0);
  return {
    paidUsers: agg.activeSubs.length,
    trialingUsers: agg.trialingCount,
    mrr: mrrCents / 100,
    lifetimeRevenue: agg.lifetimeNetCents / 100,
    asOf: agg.asOf,
  };
}

export async function getBillingSummaryForOverviewAction(): Promise<
  | { ok: true; summary: BillingSummary; cached: boolean }
  | { ok: false; error: string }
> {
  const gate = await assertAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const cacheHit =
    stripeAggregateCache &&
    Date.now() - stripeAggregateCache.ts < STRIPE_AGGREGATE_TTL_MS;

  try {
    const agg = await getStripeAggregate();
    return { ok: true, summary: summaryFromAggregate(agg), cached: !!cacheHit };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { ok: false, error: msg };
  }
}

export async function getRevenueBreakdownAction(): Promise<
  | { ok: true; breakdown: RevenueBreakdown; cached: boolean }
  | { ok: false; error: string }
> {
  const gate = await assertAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const cacheHit =
    stripeAggregateCache &&
    Date.now() - stripeAggregateCache.ts < STRIPE_AGGREGATE_TTL_MS;

  try {
    const agg = await getStripeAggregate();

    const tierTotals: Record<RevenueTierKey, { count: number; mrrCents: number }> = {
      coach: { count: 0, mrrCents: 0 },
      coach_ai: { count: 0, mrrCents: 0 },
      pack: { count: 0, mrrCents: 0 },
      other: { count: 0, mrrCents: 0 },
    };
    for (const sub of agg.activeSubs) {
      tierTotals[sub.tier].count += 1;
      tierTotals[sub.tier].mrrCents += sub.mrrCents;
    }
    const byTier: RevenueBreakdown["byTier"] = (
      ["coach", "coach_ai", "pack", "other"] as RevenueTierKey[]
    )
      .map((tier) => ({
        tier,
        count: tierTotals[tier].count,
        mrr: tierTotals[tier].mrrCents / 100,
      }))
      .filter((row) => row.count > 0 || row.mrr > 0);

    const months = last12MonthKeys();
    const monthly: RevenueBreakdown["monthly"] = months.map((month) => {
      const bucket = agg.byMonth[month] ?? { totalCents: 0 };
      return { month, total: bucket.totalCents / 100 };
    });

    const customerEntries = Object.entries(agg.byCustomer)
      .map(([key, info]) => ({ key, ...info }))
      .filter((c) => c.totalCents > 0)
      .sort((a, b) => b.totalCents - a.totalCents)
      .slice(0, 20);

    const admin = createServiceRoleClient();
    const [{ data: authData }, { data: profileRows }] = await Promise.all([
      admin.auth.admin.listUsers({ perPage: 1000, page: 1 }),
      admin.from("profiles").select("id, display_name"),
    ]);
    const emailToUserId = new Map<string, string>();
    for (const u of authData?.users ?? []) {
      if (u.email) emailToUserId.set(u.email.toLowerCase(), u.id);
    }
    const displayNameById = new Map<string, string | null>();
    for (const p of profileRows ?? []) {
      displayNameById.set(
        p.id as string,
        (p as { display_name: string | null }).display_name,
      );
    }

    const topCustomers: RevenueBreakdown["topCustomers"] = customerEntries.map(
      (c) => {
        const email = c.email ?? null;
        const userId = email
          ? emailToUserId.get(email.toLowerCase()) ?? null
          : null;
        // Tier resolution: by email first (covers pack buyers who match a
        // subscriber), then by customer ID, else label as "pack" when we
        // have at least an email (i.e. one-time pack buyer), else null.
        const tierByEmail = email ? agg.tierByCustomer[email] : undefined;
        const tierByCust = c.customerId
          ? agg.tierByCustomer[`cust:${c.customerId}`]
          : undefined;
        const tier =
          tierByEmail ?? tierByCust ?? (email ? "pack" : null);
        return {
          customerId: c.customerId ?? "",
          userId,
          email,
          displayName: userId ? displayNameById.get(userId) ?? null : null,
          tier,
          lifetimeSpend: c.totalCents / 100,
        };
      },
    );

    return {
      ok: true,
      breakdown: {
        asOf: agg.asOf,
        byTier,
        monthly,
        topCustomers,
        summary: summaryFromAggregate(agg),
      },
      cached: !!cacheHit,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { ok: false, error: msg };
  }
}
