"use server";

import { getAppleIapConfig } from "@/lib/site/apple-iap-config";

// Client-safe IAP config for the native app. Pure-Apple StoreKit needs no client
// keys — just whether IAP is enabled (the kill-switch). The purchase UI stays
// dark until the toggle is on.

export type IapClientConfig = { enabled: boolean };

export async function getIapClientConfig(): Promise<IapClientConfig> {
  try {
    const cfg = await getAppleIapConfig();
    return { enabled: cfg.enabled };
  } catch {
    return { enabled: false };
  }
}
