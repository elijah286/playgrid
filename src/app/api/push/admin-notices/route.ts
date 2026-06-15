import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { sweepUnpushedAdminNotices } from "@/lib/notifications/inbox-dispatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cron: push every recent admin notice (new signup / purchase / cancellation)
 * that hasn't been pushed yet — regardless of how the signup happened.
 *
 * The per-route hooks (auth callback, Stripe webhook) miss signups that bypass
 * them (native social sign-in, implicit-flow OAuth, delayed email confirms).
 * Those still write a system_notices row via the DB trigger, so this sweep —
 * reading that canonical feed — guarantees the admin alert fires. Idempotent
 * (pushed_at claim), so running it alongside the instant hooks never doubles.
 *
 * Auth: `Authorization: Bearer <CRON_SECRET>`. Suggested cadence: every minute.
 */
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
  const { pushed } = await sweepUnpushedAdminNotices({ admin });
  return NextResponse.json({ ok: true, pushed });
}

export async function POST(req: Request): Promise<NextResponse> {
  return handle(req);
}
export async function GET(req: Request): Promise<NextResponse> {
  return handle(req);
}
