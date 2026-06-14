import { isNativeApp, nativePlatform } from "@/lib/native/isNativeApp";
import { createClient } from "@/lib/supabase/client";
import { IAP_COACH_MONTHLY, IAP_COACH_ANNUAL } from "@/lib/billing/iap-products";
import type { BillingInterval } from "@/lib/billing/stripe";

// Web-safe wrapper around @capgo/native-purchases (pure StoreKit 2). The plugin is
// dynamically imported so the web bundle never loads native code, and every
// function no-ops off iOS. After a purchase we report the signed transaction to
// our server (/api/iap/apple/verify), which is the authoritative entitlement
// source; renewals/cancels flow in via App Store Server Notifications.

function iosOnly(): boolean {
  return isNativeApp() && nativePlatform() === "ios";
}

async function plugin() {
  const mod = await import("@capgo/native-purchases");
  return mod.NativePurchases;
}

const COACH_PRODUCT_IDS = [IAP_COACH_MONTHLY, IAP_COACH_ANNUAL];

export type CoachOffer = {
  interval: BillingInterval;
  productId: string;
  /** Localized StoreKit price, e.g. "$9.99" — never hardcode. */
  priceString: string;
};

/** Coach monthly/annual offers from StoreKit (monthly first). */
export async function getCoachOffers(): Promise<CoachOffer[]> {
  if (!iosOnly()) return [];
  const NativePurchases = await plugin();
  const { products } = await NativePurchases.getProducts({ productIdentifiers: COACH_PRODUCT_IDS });
  const offers: CoachOffer[] = [];
  for (const p of products) {
    const interval: BillingInterval | null =
      p.identifier === IAP_COACH_MONTHLY ? "month" : p.identifier === IAP_COACH_ANNUAL ? "year" : null;
    if (!interval) continue;
    offers.push({ interval, productId: p.identifier, priceString: p.priceString });
  }
  offers.sort((a) => (a.interval === "month" ? -1 : 1));
  return offers;
}

async function currentUserId(): Promise<string | null> {
  try {
    const { data } = await createClient().auth.getUser();
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

/** Verify a signed StoreKit transaction with our server (authoritative). */
async function verifyWithServer(jwsRepresentation: string): Promise<boolean> {
  try {
    const res = await fetch("/api/iap/apple/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jwsRepresentation }),
    });
    if (!res.ok) return false;
    const json = (await res.json()) as { entitled?: boolean };
    return Boolean(json.entitled);
  } catch {
    return false;
  }
}

function isCancellation(err: { code?: string; message?: string }): boolean {
  const s = `${err.code ?? ""} ${err.message ?? ""}`.toLowerCase();
  return s.includes("cancel");
}

export type PurchaseResult = {
  ok: boolean;
  entitled: boolean;
  cancelled?: boolean;
  error?: string;
};

export async function purchaseCoach(productId: string): Promise<PurchaseResult> {
  if (!iosOnly()) return { ok: false, entitled: false, error: "IAP unavailable" };
  const NativePurchases = await plugin();
  const userId = await currentUserId(); // Supabase user id is a UUID → StoreKit appAccountToken
  try {
    const tx = await NativePurchases.purchaseProduct({
      productIdentifier: productId,
      ...(userId ? { appAccountToken: userId } : {}),
    });
    if (tx.jwsRepresentation) {
      const entitled = await verifyWithServer(tx.jwsRepresentation);
      return { ok: true, entitled };
    }
    return { ok: true, entitled: Boolean(tx.isActive) };
  } catch (e) {
    const err = e as { code?: string; message?: string };
    if (isCancellation(err)) return { ok: false, entitled: false, cancelled: true };
    return { ok: false, entitled: false, error: err?.message ?? "Purchase failed" };
  }
}

export async function restoreCoach(): Promise<{ entitled: boolean }> {
  if (!iosOnly()) return { entitled: false };
  const NativePurchases = await plugin();
  try {
    await NativePurchases.restorePurchases();
    const { purchases } = await NativePurchases.getPurchases({ onlyCurrentEntitlements: true });
    let entitled = false;
    for (const tx of purchases) {
      if (!COACH_PRODUCT_IDS.includes(tx.productIdentifier)) continue;
      if (tx.jwsRepresentation) {
        if (await verifyWithServer(tx.jwsRepresentation)) entitled = true;
      } else if (tx.isActive) {
        entitled = true;
      }
    }
    return { entitled };
  } catch {
    return { entitled: false };
  }
}

/** Instant client read of whether Coach is active via StoreKit (server stays truth). */
export async function isCoachEntitledViaIap(): Promise<boolean> {
  if (!iosOnly()) return false;
  const NativePurchases = await plugin();
  try {
    const { purchases } = await NativePurchases.getPurchases({ onlyCurrentEntitlements: true });
    return purchases.some(
      (tx) => COACH_PRODUCT_IDS.includes(tx.productIdentifier) && tx.isActive === true,
    );
  } catch {
    return false;
  }
}

/** Open iOS Settings → Subscriptions for the app (StoreKit-native). */
export async function openManageAppleSubscription(): Promise<void> {
  if (!iosOnly()) {
    try {
      window.open("itms-apps://apps.apple.com/account/subscriptions", "_system");
    } catch {
      /* no-op on web */
    }
    return;
  }
  try {
    const NativePurchases = await plugin();
    await NativePurchases.manageSubscriptions();
  } catch {
    try {
      window.open("itms-apps://apps.apple.com/account/subscriptions", "_system");
    } catch {
      /* ignore */
    }
  }
}
