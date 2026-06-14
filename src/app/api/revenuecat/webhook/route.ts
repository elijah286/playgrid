import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getRevenueCatConfig } from "@/lib/site/revenuecat-config";
import { buildIapSubscriptionRow, type RevenueCatEvent } from "@/lib/billing/iap-webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Structural mirror of the Stripe webhook (src/app/api/stripe/webhook): verify
// the sender, resolve our user id, map product → tier, and upsert a row keyed by
// the store's stable subscription id (original_transaction_id). The differences:
// RevenueCat authenticates with a shared Authorization header (no payload
// signature), and the lifecycle is Apple's — we only mirror it, never drive it.
// All mapping logic lives in iap-webhook.ts so it can be unit-tested directly.

function headerMatchesSecret(headerValue: string | null, secret: string): boolean {
  if (!headerValue) return false;
  const a = Buffer.from(headerValue);
  const b = Buffer.from(secret);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(req: Request): Promise<NextResponse> {
  const config = await getRevenueCatConfig();
  if (!config.webhookSecret) {
    return NextResponse.json(
      { error: "RevenueCat webhook secret not configured." },
      { status: 503 },
    );
  }

  // RevenueCat authenticates by sending the exact Authorization header value you
  // configure in its dashboard — there is no payload signature to verify.
  if (!headerMatchesSecret(req.headers.get("authorization"), config.webhookSecret)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: { event?: RevenueCatEvent };
  try {
    body = (await req.json()) as { event?: RevenueCatEvent };
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const event = body.event;
  if (!event) return NextResponse.json({ received: true }); // TEST pings etc.

  const built = buildIapSubscriptionRow(event, Date.now());
  if (!built.ok) {
    // Unmappable (anonymous user, unknown product, non-apple store, no txn id).
    // 200 so RevenueCat doesn't retry forever; log loudly for unattributed buys.
    console.warn(`[revenuecat webhook] skipped ${event.type ?? "?"}: ${built.reason}`);
    return NextResponse.json({ received: true, skipped: built.reason });
  }

  try {
    const admin = createServiceRoleClient();
    const { error } = await admin
      .from("iap_subscriptions")
      .upsert(built.row, { onConflict: "original_transaction_id" });
    if (error) throw new Error(`iap_subscriptions upsert failed: ${error.message}`);
    return NextResponse.json({ received: true });
  } catch (e) {
    // 500 → RevenueCat retries (transient DB failure).
    console.error("[revenuecat webhook] handler error", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Webhook handler error." },
      { status: 500 },
    );
  }
}
