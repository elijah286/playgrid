"use server";

import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import type { SubscriptionTier } from "@/lib/billing/entitlement";
import { getStripeConfigStatus, type StripeConfigStatus } from "@/lib/site/stripe-config";
import { setCoachAiTierEnabled } from "@/lib/site/pricing-config";
import { getStripeClient } from "@/lib/billing/stripe";

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
