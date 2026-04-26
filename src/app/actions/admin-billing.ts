"use server";

import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import type { SubscriptionTier } from "@/lib/billing/entitlement";
import { getStripeConfigStatus, type StripeConfigStatus } from "@/lib/site/stripe-config";
import { setCoachAiTierEnabled } from "@/lib/site/pricing-config";

const SITE_ROW_ID = "default";

type PriceKey =
  | "stripe_price_coach_month"
  | "stripe_price_coach_year"
  | "stripe_price_coach_ai_month"
  | "stripe_price_coach_ai_year"
  | "stripe_price_seat_month"
  | "stripe_price_seat_year";

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
