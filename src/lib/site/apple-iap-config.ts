import { createServiceRoleClient } from "@/lib/supabase/admin";

// Apple IAP config from the single site_settings row. Pure-Apple StoreKit needs
// almost nothing server-side: the on/off flag plus the app's numeric Apple ID
// (required by Apple's verifier to bind production signatures to THIS app). No
// SDK key, no webhook secret — Apple signs everything itself.
//
// The flag column is `revenuecat_iap_enabled` (named before the pivot); it's the
// generic IAP kill-switch now.

const SITE_ROW_ID = "default";

export type AppleIapConfig = {
  enabled: boolean;
  /** App Store Connect → App Information → Apple ID (numeric). */
  appAppleId: number | null;
};

export async function getAppleIapConfig(): Promise<AppleIapConfig> {
  try {
    const admin = createServiceRoleClient();
    const { data } = await admin
      .from("site_settings")
      .select("revenuecat_iap_enabled, apple_app_apple_id")
      .eq("id", SITE_ROW_ID)
      .maybeSingle();
    const raw = data?.apple_app_apple_id;
    const appAppleId = raw != null ? Number(raw) : null;
    return {
      enabled: Boolean(data?.revenuecat_iap_enabled),
      appAppleId: appAppleId != null && Number.isFinite(appAppleId) ? appAppleId : null,
    };
  } catch {
    // Columns/row not present yet (migration unapplied) → IAP off.
    return { enabled: false, appAppleId: null };
  }
}
