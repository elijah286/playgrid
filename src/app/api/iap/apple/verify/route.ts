import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getAppleIapConfig } from "@/lib/site/apple-iap-config";
import { verifyAppleTransaction } from "@/lib/billing/apple-iap";
import { buildIapRowFromTransaction } from "@/lib/billing/apple-iap-map";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The client reports a fresh StoreKit purchase (its jwsRepresentation) so the
// user's entitlement unlocks immediately, rather than waiting for the server
// notification. We verify the JWS against Apple's certs and record it for the
// AUTHENTICATED user (session is authoritative for the linkage).
export async function POST(req: Request): Promise<NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });

  let body: { jwsRepresentation?: string };
  try {
    body = (await req.json()) as { jwsRepresentation?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }
  if (!body.jwsRepresentation) {
    return NextResponse.json({ ok: false, error: "Missing jwsRepresentation." }, { status: 400 });
  }

  const { appAppleId } = await getAppleIapConfig();
  try {
    const tx = await verifyAppleTransaction(body.jwsRepresentation, appAppleId);
    const built = buildIapRowFromTransaction(tx, { userId: user.id, nowMs: Date.now() });
    if (!built.ok) return NextResponse.json({ ok: false, error: built.reason }, { status: 400 });

    const admin = createServiceRoleClient();
    const { error } = await admin
      .from("iap_subscriptions")
      .upsert(built.row, { onConflict: "original_transaction_id" });
    if (error) throw new Error(`iap_subscriptions upsert failed: ${error.message}`);

    const entitled =
      built.row.status === "active" ||
      built.row.status === "trialing" ||
      built.row.status === "in_grace_period";
    return NextResponse.json({ ok: true, entitled });
  } catch (e) {
    console.error("[apple-iap] verify error", e);
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }
}
