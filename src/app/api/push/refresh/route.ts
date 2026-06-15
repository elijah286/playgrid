/**
 * Dormant-device token refresh — UNAUTHENTICATED by session, authenticated by
 * the per-device refresh_secret issued at register time.
 *
 * Called by the native layer (Android FirebaseMessagingService.onNewToken, iOS
 * silent-push handler) when the OS hands the app a rotated push token while the
 * app is backgrounded/killed and there's no WebView session to authenticate a
 * normal /api/push/register. The secret identifies the device_tokens row; we
 * swap in the new token so a never-reopened install keeps receiving pushes.
 *
 * Public path (see middleware allowlist) — the secret is the credential.
 */
import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/config";

const PLATFORMS = new Set(["ios", "android", "web"]);

export async function POST(req: Request): Promise<Response> {
  if (!hasSupabaseEnv()) {
    return NextResponse.json({ ok: false, error: "Not configured" }, { status: 503 });
  }

  let body: { secret?: string; token?: string; platform?: string; appVersion?: string } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    /* handled below */
  }
  const secret = body.secret?.trim();
  const token = body.token?.trim();
  const platform = body.platform?.trim();
  if (!secret || !token) {
    return NextResponse.json({ ok: false, error: "secret and token are required" }, { status: 400 });
  }
  if (platform && !PLATFORMS.has(platform)) {
    return NextResponse.json({ ok: false, error: "invalid platform" }, { status: 400 });
  }

  const admin = createServiceRoleClient();
  const { data: row } = await admin
    .from("device_tokens")
    .select("id, user_id, token")
    .eq("refresh_secret", secret)
    .maybeSingle();
  // Don't reveal whether the secret exists — same 204 either way.
  if (!row) return new NextResponse(null, { status: 204 });

  const patch = {
    last_seen_at: new Date().toISOString(),
    disabled_at: null,
    disabled_reason: null,
    ...(body.appVersion?.trim() ? { app_version: body.appVersion.trim() } : {}),
  };

  if (row.token === token) {
    // Same token — just a liveness ping; keep the row fresh and enabled.
    await admin.from("device_tokens").update(patch).eq("id", row.id);
    return new NextResponse(null, { status: 204 });
  }

  // Token rotated. Clear any pre-existing row that already holds the new token
  // for this user so the (user_id, token) uniqueness constraint can't trip.
  await admin
    .from("device_tokens")
    .delete()
    .eq("user_id", row.user_id)
    .eq("token", token)
    .neq("id", row.id);

  await admin
    .from("device_tokens")
    .update({ token, ...patch })
    .eq("id", row.id);

  return new NextResponse(null, { status: 204 });
}
