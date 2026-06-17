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

/**
 * Load the native-purchases plugin. CRITICAL: never return the plugin object
 * bare from an async function. `mod.NativePurchases` is a Capacitor Proxy that
 * forwards EVERY property access — including `.then` — to a native method call.
 * An async fn that returns it does `Promise.resolve(proxy)`, which sees a
 * truthy `.then`, treats the proxy as a thenable, and calls `NativePurchases
 * .then(resolve, reject)` natively → "NativePurchases.then() is not implemented
 * on ios", rejecting before getProducts/purchase ever runs (the IAP-load bug).
 * Nesting the proxy under a key keeps the resolved value a plain (non-thenable)
 * object, so it's passed through untouched.
 */
async function plugin() {
  const mod = await import("@capgo/native-purchases");
  return { NativePurchases: mod.NativePurchases };
}

const COACH_PRODUCT_IDS = [IAP_COACH_MONTHLY, IAP_COACH_ANNUAL];

export type CoachOffer = {
  interval: BillingInterval;
  productId: string;
  /** Localized StoreKit price, e.g. "$9.99" — never hardcode. */
  priceString: string;
};

/**
 * StoreKit's product fetch can hang indefinitely when there is no StoreKit
 * configuration (a simulator with no .storekit file and no Sandbox account
 * signed in) or on a flaky network — which would leave the purchase panel
 * spinning on "Loading plans…" forever, a state a coach OR an App Store
 * reviewer could get stuck on. Cap it so the panel degrades to a
 * "couldn't load — try again" state instead.
 */
const PRODUCTS_TIMEOUT_MS = 12_000;

export function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms),
    ),
  ]);
}

/** Coach monthly/annual offers from StoreKit (monthly first). Throws if the
 *  StoreKit fetch fails or times out, so the panel can show a retry state
 *  rather than an infinite spinner. */
async function fetchCoachProducts() {
  const { NativePurchases } = await plugin();
  const { products } = await NativePurchases.getProducts({
    productIdentifiers: COACH_PRODUCT_IDS,
  });
  return products;
}

export async function getCoachOffers(): Promise<CoachOffer[]> {
  if (!iosOnly()) return [];
  // Time out the WHOLE fetch — the dynamic plugin import AND the StoreKit call —
  // since either can hang on a flaky native bridge, and an un-timed await would
  // leave the panel spinning on "Loading plans…" forever.
  const products = await withTimeout(
    fetchCoachProducts(),
    PRODUCTS_TIMEOUT_MS,
    "StoreKit getProducts",
  ).catch((e: unknown) => {
    console.warn("[iap] getCoachOffers: StoreKit getProducts failed/timed out", {
      productIds: COACH_PRODUCT_IDS,
      error: e instanceof Error ? e.message : String(e),
    });
    throw e;
  });
  if (!products.length) {
    console.warn(
      "[iap] getCoachOffers: 0 products returned — verify the ids match App Store Connect and are 'Ready to Submit'",
      { productIds: COACH_PRODUCT_IDS },
    );
  }
  const offers: CoachOffer[] = [];
  for (const p of products) {
    const interval: BillingInterval | null =
      p.identifier === IAP_COACH_MONTHLY ? "month" : p.identifier === IAP_COACH_ANNUAL ? "year" : null;
    if (!interval) continue;
    offers.push({ interval, productId: p.identifier, priceString: p.priceString });
  }
  offers.sort(
    (a, b) => (a.interval === "month" ? 0 : 1) - (b.interval === "month" ? 0 : 1),
  );
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
  const { NativePurchases } = await plugin();
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
  const { NativePurchases } = await plugin();
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
  const { NativePurchases } = await plugin();
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
    const { NativePurchases } = await plugin();
    await NativePurchases.manageSubscriptions();
  } catch {
    try {
      window.open("itms-apps://apps.apple.com/account/subscriptions", "_system");
    } catch {
      /* ignore */
    }
  }
}
