import { isNativeApp, nativePlatform } from "@/lib/native/isNativeApp";
import {
  IAP_COACH_MONTHLY,
  IAP_COACH_ANNUAL,
  RC_ENTITLEMENT_COACH,
} from "@/lib/billing/iap-products";
import type { BillingInterval } from "@/lib/billing/stripe";
import type { CustomerInfo } from "@revenuecat/purchases-capacitor";

// Web-safe wrapper around @revenuecat/purchases-capacitor. The plugin is
// dynamically imported so the web bundle never pulls in native code, and every
// function no-ops (or returns a safe default) anywhere but iOS. `configure` is
// idempotent; nothing else does anything until it has run.

function iosOnly(): boolean {
  return isNativeApp() && nativePlatform() === "ios";
}

let configured = false;

async function rc() {
  return import("@revenuecat/purchases-capacitor");
}

function coachActive(info: CustomerInfo): boolean {
  return Boolean(info.entitlements.active[RC_ENTITLEMENT_COACH]);
}

/** Configure the SDK with the public iOS key (from getIapClientConfig). Idempotent. */
export async function configureIap(apiKey: string): Promise<void> {
  if (!iosOnly() || configured) return;
  const { Purchases, LOG_LEVEL } = await rc();
  await Purchases.configure({ apiKey });
  try {
    await Purchases.setLogLevel({ level: LOG_LEVEL.ERROR });
  } catch {
    /* non-fatal */
  }
  configured = true;
}

/** Link RevenueCat events to our Supabase user so the webhook can attribute them. */
export async function identifyIapUser(appUserID: string): Promise<void> {
  if (!iosOnly() || !configured) return;
  const { Purchases } = await rc();
  try {
    await Purchases.logIn({ appUserID });
  } catch {
    /* best-effort */
  }
}

export async function logOutIap(): Promise<void> {
  if (!iosOnly() || !configured) return;
  const { Purchases } = await rc();
  try {
    await Purchases.logOut();
  } catch {
    /* best-effort */
  }
}

export type CoachOffer = {
  interval: BillingInterval;
  productId: string;
  /** Localized price, e.g. "$9.99" — comes straight from StoreKit, never hardcode. */
  priceString: string;
  /** RevenueCat package identifier, passed back to purchaseCoach. */
  packageId: string;
};

/** The Coach monthly/annual offers from the current RevenueCat offering (monthly first). */
export async function getCoachOffers(): Promise<CoachOffer[]> {
  if (!iosOnly() || !configured) return [];
  const { Purchases } = await rc();
  const offerings = await Purchases.getOfferings();
  const packages = offerings.current?.availablePackages ?? [];
  const offers: CoachOffer[] = [];
  for (const p of packages) {
    const productId = p.product.identifier;
    const interval: BillingInterval | null =
      productId === IAP_COACH_MONTHLY ? "month" : productId === IAP_COACH_ANNUAL ? "year" : null;
    if (!interval) continue;
    offers.push({ interval, productId, priceString: p.product.priceString, packageId: p.identifier });
  }
  offers.sort((a) => (a.interval === "month" ? -1 : 1));
  return offers;
}

export type PurchaseResult = {
  ok: boolean;
  entitled: boolean;
  cancelled?: boolean;
  error?: string;
};

/** Run the StoreKit purchase sheet for a Coach package. Server entitlement still
 *  syncs via the RevenueCat webhook; `entitled` is the instant client signal. */
export async function purchaseCoach(packageId: string): Promise<PurchaseResult> {
  if (!iosOnly() || !configured) return { ok: false, entitled: false, error: "IAP unavailable" };
  const { Purchases } = await rc();
  const offerings = await Purchases.getOfferings();
  const pkg = offerings.current?.availablePackages.find((p) => p.identifier === packageId);
  if (!pkg) return { ok: false, entitled: false, error: "package not found" };
  try {
    const res = await Purchases.purchasePackage({ aPackage: pkg });
    return { ok: true, entitled: coachActive(res.customerInfo) };
  } catch (e) {
    const err = e as { userCancelled?: boolean; code?: string; message?: string };
    if (err?.userCancelled) return { ok: false, entitled: false, cancelled: true };
    return { ok: false, entitled: false, error: err?.message ?? "Purchase failed" };
  }
}

/** Restore a prior purchase (e.g. after reinstall / new device). */
export async function restoreCoach(): Promise<{ entitled: boolean }> {
  if (!iosOnly() || !configured) return { entitled: false };
  const { Purchases } = await rc();
  try {
    const res = await Purchases.restorePurchases();
    return { entitled: coachActive(res.customerInfo) };
  } catch {
    return { entitled: false };
  }
}

/** Instant client read of whether Coach is active via Apple (server stays source of truth). */
export async function isCoachEntitledViaIap(): Promise<boolean> {
  if (!iosOnly() || !configured) return false;
  const { Purchases } = await rc();
  try {
    const res = await Purchases.getCustomerInfo();
    return coachActive(res.customerInfo);
  } catch {
    return false;
  }
}

/** Apple-purchased subs are managed in iOS Settings → Subscriptions. The plugin
 *  exposes no manage helper, so open Apple's subscriptions screen directly. */
export function openManageAppleSubscription(): void {
  try {
    window.open("itms-apps://apps.apple.com/account/subscriptions", "_system");
  } catch {
    window.location.href = "https://apps.apple.com/account/subscriptions";
  }
}
