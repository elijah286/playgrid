"use server";

import { getRevenueCatConfig } from "@/lib/site/revenuecat-config";
import { RC_ENTITLEMENT_COACH } from "@/lib/billing/iap-products";

// Client-safe RevenueCat config for the native app. The iOS SDK key is a public
// key (safe to ship), but we only hand it out when IAP is actually enabled so the
// purchase UI stays fully dark until the kill-switch (revenuecat_iap_enabled) is on.

export type IapClientConfig = {
  enabled: boolean;
  iosSdkKey: string | null;
  entitlementId: string;
};

export async function getIapClientConfig(): Promise<IapClientConfig> {
  try {
    const cfg = await getRevenueCatConfig();
    const enabled = cfg.iapEnabled && Boolean(cfg.iosSdkKey);
    return {
      enabled,
      iosSdkKey: enabled ? cfg.iosSdkKey : null,
      entitlementId: RC_ENTITLEMENT_COACH,
    };
  } catch {
    // Config row / columns not present yet (e.g. migration unapplied) → IAP off.
    return { enabled: false, iosSdkKey: null, entitlementId: RC_ENTITLEMENT_COACH };
  }
}
