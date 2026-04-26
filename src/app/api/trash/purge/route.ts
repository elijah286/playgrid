import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Hard-delete sweep for the 30-day trash. Removes plays and playbook_groups
// whose deleted_at is older than the retention window. Cascades remove
// dependent rows (play_versions, etc.).
//
// Auth: header `Authorization: Bearer <CRON_SECRET>`. Recommended cadence:
// once per day.

const RETENTION_DAYS = 30;

async function handle(req: Request): Promise<NextResponse> {
  if (!hasSupabaseEnv()) {
    return NextResponse.json({ ok: false, error: "Server not configured" }, { status: 503 });
  }
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET not set on server" }, { status: 503 });
  }
  const auth = req.headers.get("authorization") ?? "";
  const presented = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : auth.trim();
  if (presented !== expected) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const admin = createServiceRoleClient();
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const [playsRes, groupsRes] = await Promise.all([
    admin.from("plays").delete().lt("deleted_at", cutoff).select("id"),
    admin.from("playbook_groups").delete().lt("deleted_at", cutoff).select("id"),
  ]);

  if (playsRes.error) {
    return NextResponse.json({ ok: false, error: playsRes.error.message }, { status: 500 });
  }
  if (groupsRes.error) {
    return NextResponse.json({ ok: false, error: groupsRes.error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    purgedPlays: playsRes.data?.length ?? 0,
    purgedGroups: groupsRes.data?.length ?? 0,
  });
}

export async function POST(req: Request) {
  return handle(req);
}

export async function GET(req: Request) {
  return handle(req);
}
