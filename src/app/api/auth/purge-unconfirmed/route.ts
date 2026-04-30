import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Hard-delete sweep for stale unconfirmed signups. Removes auth.users
// rows where the user has never had a session AND was created more than
// RETENTION_DAYS ago. These rows are typically the result of:
//   - Typo'd email addresses (e.g. user@gmail.con) that never received
//     the OTP / magic link
//   - Abandoned signup attempts
//   - OAuth round-trips that didn't complete
//
// Anything cascading off auth.users (profiles, etc.) goes with it via
// the existing FK relationships. Deletions use the auth admin API so
// session/token cleanup runs server-side.
//
// Auth: header `Authorization: Bearer <CRON_SECRET>`. Recommended
// cadence: once per day.

const RETENTION_DAYS = 30;
const BATCH_LIMIT = 200;

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
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;

  // Walk all auth users and pick out the never-signed-in stale ones.
  // listUsers paginates at 1000/page; we cap at one full page per run
  // to keep the request bounded. If purge volume ever exceeds that the
  // job runs again the next day and chips away at the backlog.
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const stale = (data?.users ?? []).filter((u) => {
    if (u.last_sign_in_at) return false;
    const created = u.created_at ? Date.parse(u.created_at) : null;
    if (!created || Number.isNaN(created)) return false;
    return created < cutoff;
  });

  const candidates = stale.slice(0, BATCH_LIMIT);
  let deleted = 0;
  const failures: Array<{ id: string; email: string | null; error: string }> = [];
  for (const u of candidates) {
    const res = await admin.auth.admin.deleteUser(u.id);
    if (res.error) {
      failures.push({ id: u.id, email: u.email ?? null, error: res.error.message });
      continue;
    }
    deleted += 1;
  }

  return NextResponse.json({
    ok: true,
    cutoff: new Date(cutoff).toISOString(),
    scanned: data?.users?.length ?? 0,
    eligible: stale.length,
    deleted,
    failures,
  });
}

export async function POST(req: Request) {
  return handle(req);
}

export async function GET(req: Request) {
  return handle(req);
}
