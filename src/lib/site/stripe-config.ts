import { createServiceRoleClient } from "@/lib/supabase/admin";

const SITE_ROW_ID = "default";

export type StripeConfig = {
  secretKey: string | null;
  publishableKey: string | null;
  webhookSecret: string | null;
  priceIds: {
    coach_month: string | null;
    coach_year: string | null;
    coach_ai_month: string | null;
    coach_ai_year: string | null;
  };
};

export type StripeConfigStatus = {
  hasSecretKey: boolean;
  hasWebhookSecret: boolean;
  hasPublishableKey: boolean;
  mode: "test" | "live" | null;
  updatedAt: string | null;
  priceIds: StripeConfig["priceIds"];
  publishableKey: string | null;
};

function modeFromSecret(secret: string | null): "test" | "live" | null {
  if (!secret) return null;
  if (secret.startsWith("sk_test_")) return "test";
  if (secret.startsWith("sk_live_")) return "live";
  return null;
}

/** Full config incl. secrets — SERVER ONLY. */
export async function getStripeConfig(): Promise<StripeConfig> {
  const admin = createServiceRoleClient();
  const { data } = await admin
    .from("site_settings")
    .select(
      "stripe_secret_key, stripe_publishable_key, stripe_webhook_secret, stripe_price_coach_month, stripe_price_coach_year, stripe_price_coach_ai_month, stripe_price_coach_ai_year",
    )
    .eq("id", SITE_ROW_ID)
    .maybeSingle();
  return {
    secretKey: data?.stripe_secret_key ?? null,
    publishableKey: data?.stripe_publishable_key ?? null,
    webhookSecret: data?.stripe_webhook_secret ?? null,
    priceIds: {
      coach_month: data?.stripe_price_coach_month ?? null,
      coach_year: data?.stripe_price_coach_year ?? null,
      coach_ai_month: data?.stripe_price_coach_ai_month ?? null,
      coach_ai_year: data?.stripe_price_coach_ai_year ?? null,
    },
  };
}

/** Safe-for-UI status — never includes secret or webhook values. */
export async function getStripeConfigStatus(): Promise<StripeConfigStatus> {
  const admin = createServiceRoleClient();
  const { data } = await admin
    .from("site_settings")
    .select(
      "stripe_secret_key, stripe_publishable_key, stripe_webhook_secret, stripe_price_coach_month, stripe_price_coach_year, stripe_price_coach_ai_month, stripe_price_coach_ai_year, updated_at",
    )
    .eq("id", SITE_ROW_ID)
    .maybeSingle();
  return {
    hasSecretKey: Boolean(data?.stripe_secret_key),
    hasWebhookSecret: Boolean(data?.stripe_webhook_secret),
    hasPublishableKey: Boolean(data?.stripe_publishable_key),
    mode: modeFromSecret(data?.stripe_secret_key ?? null),
    updatedAt: data?.updated_at ?? null,
    publishableKey: data?.stripe_publishable_key ?? null,
    priceIds: {
      coach_month: data?.stripe_price_coach_month ?? null,
      coach_year: data?.stripe_price_coach_year ?? null,
      coach_ai_month: data?.stripe_price_coach_ai_month ?? null,
      coach_ai_year: data?.stripe_price_coach_ai_year ?? null,
    },
  };
}
