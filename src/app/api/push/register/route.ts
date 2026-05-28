/**
 * Native push: register / unregister this device's FCM token.
 *
 * POST   { token, platform, appId?, appVersion?, deviceLabel? } — upsert the
 *        token for the signed-in user. Re-registration refreshes last_seen_at
 *        and clears any prior soft-disable. Conflict key is (user_id, token).
 * DELETE { token } — drop the token (called on sign-out so a shared device
 *        stops receiving the previous coach's pushes).
 *
 * The session is validated with the auth-aware server client; the actual
 * write uses the service-role client because device_tokens only grants
 * table access to service_role (RLS self-policies exist but are inert without
 * an `authenticated` grant — see the migration header).
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/config";

const PLATFORMS = new Set(["ios", "android", "web"]);

export async function POST(req: Request): Promise<Response> {
  if (!hasSupabaseEnv()) {
    return NextResponse.json({ ok: false, error: "Not configured" }, { status: 503 });
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
  }

  let body: {
    token?: string;
    platform?: string;
    appId?: string;
    appVersion?: string;
    deviceLabel?: string;
  } = {};
  try { body = (await req.json()) as typeof body; } catch { /* handled below */ }

  const token = body.token?.trim();
  const platform = body.platform?.trim();
  if (!token || !platform || !PLATFORMS.has(platform)) {
    return NextResponse.json(
      { ok: false, error: "token and a valid platform are required" },
      { status: 400 },
    );
  }

  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("device_tokens")
    .upsert(
      {
        user_id: user.id,
        token,
        platform,
        app_id: body.appId?.trim() || null,
        app_version: body.appVersion?.trim() || null,
        device_label: body.deviceLabel?.trim() || null,
        last_seen_at: new Date().toISOString(),
        disabled_at: null,
        disabled_reason: null,
      },
      { onConflict: "user_id,token" },
    );
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request): Promise<Response> {
  if (!hasSupabaseEnv()) {
    return NextResponse.json({ ok: false, error: "Not configured" }, { status: 503 });
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
  }

  let body: { token?: string } = {};
  try { body = (await req.json()) as typeof body; } catch { /* handled below */ }
  const token = body.token?.trim();
  if (!token) {
    return NextResponse.json({ ok: false, error: "token is required" }, { status: 400 });
  }

  const admin = createServiceRoleClient();
  await admin
    .from("device_tokens")
    .delete()
    .eq("user_id", user.id)
    .eq("token", token);
  return NextResponse.json({ ok: true });
}
