import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { loadApnsConfig } from "@/lib/site/apns-config";
import { sendApnsToTokens } from "@/lib/notifications/apns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * TEMP diagnostic — runs the real APNs send path ON Cloud Run against the
 * admin's own iOS tokens and reports transport-level results, plus whether the
 * FCM metadata auth works here. Gated by CRON_SECRET. Remove after diagnosis.
 */
export async function GET(request: NextRequest) {
  const secret = new URL(request.url).searchParams.get("secret");
  if (!secret || secret !== process.env.CRON_SECRET) {
    return new NextResponse("not found", { status: 404 });
  }

  const admin = createServiceRoleClient();
  const { data: admins } = await admin.from("profiles").select("id").eq("role", "admin");
  const adminId = admins?.[0]?.id as string | undefined;
  if (!adminId) return NextResponse.json({ error: "no admin" }, { status: 500 });

  const { data: toks } = await admin
    .from("device_tokens")
    .select("id, token, platform")
    .eq("user_id", adminId)
    .is("disabled_at", null);
  const ios = (toks ?? []).filter((t) => t.platform === "ios").map((t) => ({ id: t.id as string, token: t.token as string }));
  const android = (toks ?? []).filter((t) => t.platform === "android");

  // --- APNs on Cloud Run ---
  const apnsCfg = await loadApnsConfig(admin);
  let apnsResult: unknown = "apns not configured";
  if (apnsCfg) {
    apnsResult = await sendApnsToTokens(apnsCfg, ios, {
      title: "Diag ✅",
      body: "Cloud Run APNs probe",
      link: "/admin/users",
    });
  }

  // --- FCM metadata auth on Cloud Run ---
  const metaToken = await fetch(
    "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
    { headers: { "Metadata-Flavor": "Google" } },
  ).then((r) => (r.ok ? r.json() : null)).catch((e) => ({ err: String(e) }));
  const metaProject = await fetch(
    "http://metadata.google.internal/computeMetadata/v1/project/project-id",
    { headers: { "Metadata-Flavor": "Google" } },
  ).then((r) => (r.ok ? r.text() : null)).catch((e) => String(e));

  return NextResponse.json({
    onCloudRun: Boolean(process.env.K_SERVICE),
    kService: process.env.K_SERVICE ?? null,
    iosTokenCount: ios.length,
    androidTokenCount: android.length,
    apnsConfigured: apnsCfg !== null,
    apnsPrimaryHost: apnsCfg?.primaryHost ?? null,
    apnsResult,
    fcmMetaTokenAcquired: Boolean((metaToken as { access_token?: string })?.access_token),
    fcmMetaTokenError: (metaToken as { err?: string })?.err ?? null,
    fcmMetaProject: metaProject,
  });
}
