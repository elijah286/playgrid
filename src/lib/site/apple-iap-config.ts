import { createServiceRoleClient } from "@/lib/supabase/admin";

// Apple IAP config from the single site_settings row. Pure-Apple StoreKit needs
// almost nothing server-side: just the app's numeric Apple ID (required by
// Apple's verifier to bind production signatures to THIS app). No SDK key, no
// webhook secret — Apple signs everything itself.
//
// IAP is permanently ON. The old `revenuecat_iap_enabled` kill-switch was
// removed: it shipped defaulting to `false` with no admin UI, so it silently
// hid the purchase panel behind the neutral fallback — no purchasable product
// and no EULA/Privacy links — which got the app rejected (2.1(b) + 3.1.2(c)).
// The DB column is now unread (left in place; safe to drop in a follow-up).

const SITE_ROW_ID = "default";

export type AppleIapConfig = {
  /** App Store Connect → App Information → Apple ID (numeric). */
  appAppleId: number | null;
};

export async function getAppleIapConfig(): Promise<AppleIapConfig> {
  try {
    const admin = createServiceRoleClient();
    const { data } = await admin
      .from("site_settings")
      .select("apple_app_apple_id")
      .eq("id", SITE_ROW_ID)
      .maybeSingle();
    const raw = data?.apple_app_apple_id;
    const appAppleId = raw != null ? Number(raw) : null;
    return {
      appAppleId: appAppleId != null && Number.isFinite(appAppleId) ? appAppleId : null,
    };
  } catch {
    // Row not present yet (migration unapplied) → no Apple ID; the verifier
    // falls back to offline JWS checks.
    return { appAppleId: null };
  }
}
