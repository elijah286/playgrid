"use server";

import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import type { SubscriptionTier } from "@/lib/billing/entitlement";

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

export async function getStripeConfigStatusAction(): Promise<{
  ok: true;
  hasSecretKey: boolean;
  hasWebhookSecret: boolean;
  mode: "test" | "live" | null;
} | { ok: false; error: string }> {
  const gate = await assertAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const secret = process.env.STRIPE_SECRET_KEY ?? "";
  const hasSecretKey = secret.startsWith("sk_");
  const mode: "test" | "live" | null = secret.startsWith("sk_test_")
    ? "test"
    : secret.startsWith("sk_live_")
      ? "live"
      : null;
  return {
    ok: true,
    hasSecretKey,
    hasWebhookSecret: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
    mode,
  };
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
