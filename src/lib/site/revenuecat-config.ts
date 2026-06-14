import { createServiceRoleClient } from "@/lib/supabase/admin";

// RevenueCat config lives in the single site_settings row, mirroring the Stripe
// key pattern in stripe-config.ts. The iOS SDK key is a *public* key (safe to
// ship to the native client); the webhook secret is server-only.

const SITE_ROW_ID = "default";

export type RevenueCatConfig = {
  iosSdkKey: string | null;
  webhookSecret: string | null;
  /** Master switch for the iOS purchase UI — false until products + dashboard are live. */
  iapEnabled: boolean;
};

export type RevenueCatConfigStatus = {
  hasIosSdkKey: boolean;
  hasWebhookSecret: boolean;
  iapEnabled: boolean;
  /** Public SDK key — safe to return to the client to configure the SDK. */
  iosSdkKey: string | null;
  updatedAt: string | null;
};

/** Full config incl. the webhook secret — SERVER ONLY. */
export async function getRevenueCatConfig(): Promise<RevenueCatConfig> {
  const admin = createServiceRoleClient();
  const { data } = await admin
    .from("site_settings")
    .select("revenuecat_ios_sdk_key, revenuecat_webhook_secret, revenuecat_iap_enabled")
    .eq("id", SITE_ROW_ID)
    .maybeSingle();
  return {
    iosSdkKey: data?.revenuecat_ios_sdk_key ?? null,
    webhookSecret: data?.revenuecat_webhook_secret ?? null,
    iapEnabled: data?.revenuecat_iap_enabled ?? false,
  };
}

/** Safe-for-UI status — never includes the webhook secret. iosSdkKey is public. */
export async function getRevenueCatConfigStatus(): Promise<RevenueCatConfigStatus> {
  const admin = createServiceRoleClient();
  const { data } = await admin
    .from("site_settings")
    .select("revenuecat_ios_sdk_key, revenuecat_webhook_secret, revenuecat_iap_enabled, updated_at")
    .eq("id", SITE_ROW_ID)
    .maybeSingle();
  return {
    hasIosSdkKey: Boolean(data?.revenuecat_ios_sdk_key),
    hasWebhookSecret: Boolean(data?.revenuecat_webhook_secret),
    iapEnabled: data?.revenuecat_iap_enabled ?? false,
    iosSdkKey: data?.revenuecat_ios_sdk_key ?? null,
    updatedAt: data?.updated_at ?? null,
  };
}
