import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getAppleIapConfig } from "@/lib/site/apple-iap-config";
import { verifyAppleNotification, verifyAppleTransaction } from "@/lib/billing/apple-iap";
import { buildIapRowFromTransaction } from "@/lib/billing/apple-iap-map";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// App Store Server Notifications V2. Apple POSTs a signed JWS payload; the
// signature IS the authentication (only Apple can produce a valid one — verified
// against Apple's root certs). No shared secret. Mirrors the Stripe webhook's
// shape: verify → resolve user → upsert iap_subscriptions.
export async function POST(req: Request): Promise<NextResponse> {
  const { appAppleId } = await getAppleIapConfig();

  let body: { signedPayload?: string };
  try {
    body = (await req.json()) as { signedPayload?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  if (!body.signedPayload) {
    return NextResponse.json({ error: "Missing signedPayload." }, { status: 400 });
  }

  let notification;
  try {
    notification = await verifyAppleNotification(body.signedPayload, appAppleId);
  } catch (e) {
    console.warn("[apple-iap] notification verification failed:", (e as Error).message);
    return NextResponse.json({ error: "Verification failed." }, { status: 400 });
  }

  const notificationType = notification.notificationType;
  const subtype = notification.subtype;
  const signedTx = notification.data?.signedTransactionInfo;
  // TEST pings (and a few non-subscription types) carry no transaction — ack so
  // Apple stops retrying.
  if (!signedTx) return NextResponse.json({ received: true });

  try {
    const tx = await verifyAppleTransaction(signedTx, appAppleId);
    const admin = createServiceRoleClient();

    // Resolve the user: appAccountToken (set on every purchase) is our user id.
    // If absent (e.g. a transaction predating tokens), match an existing row by
    // original_transaction_id — created when the client verified the purchase.
    let userId: string | null = tx.appAccountToken ?? null;
    const originalTxnId = tx.originalTransactionId ?? tx.transactionId ?? null;
    if (!userId && originalTxnId) {
      const { data } = await admin
        .from("iap_subscriptions")
        .select("user_id")
        .eq("original_transaction_id", originalTxnId)
        .maybeSingle();
      userId = data?.user_id ?? null;
    }

    const built = buildIapRowFromTransaction(tx, {
      userId,
      nowMs: Date.now(),
      notificationType,
      subtype,
    });
    if (!built.ok) {
      console.warn(`[apple-iap] notification skipped ${notificationType ?? "?"}: ${built.reason}`);
      return NextResponse.json({ received: true, skipped: built.reason });
    }

    const { error } = await admin
      .from("iap_subscriptions")
      .upsert(built.row, { onConflict: "original_transaction_id" });
    if (error) throw new Error(`iap_subscriptions upsert failed: ${error.message}`);
    return NextResponse.json({ received: true });
  } catch (e) {
    // 500 → Apple retries (transient failure).
    console.error("[apple-iap] notification handler error", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
