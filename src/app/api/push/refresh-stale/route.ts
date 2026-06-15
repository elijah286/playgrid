import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { loadApnsConfig } from "@/lib/site/apns-config";
import { sendApnsToTokens } from "@/lib/notifications/apns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cron: keep dormant iOS push tokens alive.
 *
 * A logged-in user who rarely reopens the app still receives pushes — UNLESS
 * the token rotates or APNs starts dropping it, which the app can't re-report
 * without running. We send a silent (content-available, type=background) push
 * to iOS tokens that haven't checked in recently; iOS wakes the backgrounded
 * app, AppDelegate.didReceiveRemoteNotification reports the current token to
 * /api/push/refresh, and the row's last_seen_at is bumped. Tokens APNs reports
 * as permanently dead are soft-disabled here so the health metrics stay honest.
 *
 * Limits: Apple throttles background pushes and will NOT wake a force-quit app
 * — this recovers backgrounded/suspended installs, not ones the user killed.
 * Android needs no equivalent: its FCM service forwards onNewToken natively
 * even when killed (see PushTokenService).
 *
 * Auth: `Authorization: Bearer <CRON_SECRET>`. Suggested cadence: daily.
 */

const STALE_AFTER_DAYS = 21;
const BATCH_LIMIT = 500;

async function handle(req: Request): Promise<NextResponse> {
  if (!hasSupabaseEnv()) {
    return NextResponse.json({ ok: false, error: "Server not configured" }, { status: 503 });
  }
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET not set" }, { status: 503 });
  }
  const auth = req.headers.get("authorization") ?? "";
  const presented = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : auth.trim();
  if (presented !== expected) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const admin = createServiceRoleClient();
  const apnsCfg = await loadApnsConfig(admin);
  if (!apnsCfg) return NextResponse.json({ ok: true, configured: false, pinged: 0 });

  const staleBefore = new Date(Date.now() - STALE_AFTER_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: rows } = await admin
    .from("device_tokens")
    .select("id, token")
    .eq("platform", "ios")
    .is("disabled_at", null)
    .lt("last_seen_at", staleBefore)
    .limit(BATCH_LIMIT);

  const tokens = (rows ?? []).map((r) => ({ id: r.id as string, token: r.token as string }));
  if (tokens.length === 0) return NextResponse.json({ ok: true, configured: true, pinged: 0 });

  const { delivered, deadTokenIds } = await sendApnsToTokens(apnsCfg, tokens, {
    title: "",
    body: "",
    contentAvailable: true,
    data: { kind: "token_refresh" },
  });

  if (deadTokenIds.length > 0) {
    await admin
      .from("device_tokens")
      .update({ disabled_at: new Date().toISOString(), disabled_reason: "apns_unregistered" })
      .in("id", deadTokenIds);
  }

  return NextResponse.json({
    ok: true,
    configured: true,
    candidates: tokens.length,
    pinged: delivered,
    disabled: deadTokenIds.length,
  });
}

export async function POST(req: Request): Promise<NextResponse> {
  return handle(req);
}
export async function GET(req: Request): Promise<NextResponse> {
  return handle(req);
}
