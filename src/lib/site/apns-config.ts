import type { createServiceRoleClient } from "@/lib/supabase/admin";
import {
  PROD_HOST,
  SANDBOX_HOST,
  type ApnsConfig,
} from "@/lib/notifications/apns";

type Admin = ReturnType<typeof createServiceRoleClient>;

const SITE_ROW_ID = "default";

/**
 * Load the APNs (iOS push) config from site_settings — the same place every
 * other third-party key lives (Stripe, Resend, Claude, MaxMind, …), so it's
 * managed in Site Admin rather than via deploy-time env vars.
 *
 * Columns: apns_key_p8 (the .p8 PEM), apns_key_id, apns_team_id,
 * apns_bundle_id, apns_use_sandbox (bool). Returns null (graceful no-op,
 * same contract as the FCM path) unless all required values are present.
 */
export async function loadApnsConfig(admin: Admin): Promise<ApnsConfig | null> {
  const { data, error } = await admin
    .from("site_settings")
    .select(
      "apns_key_p8, apns_key_id, apns_team_id, apns_bundle_id, apns_use_sandbox",
    )
    .eq("id", SITE_ROW_ID)
    .maybeSingle();
  if (error || !data) return null;

  const keyId = trimOrNull(data.apns_key_id);
  const teamId = trimOrNull(data.apns_team_id);
  const bundleId = trimOrNull(data.apns_bundle_id);
  const privateKey = trimOrNull(data.apns_key_p8);
  if (!keyId || !teamId || !bundleId || !privateKey) return null;

  return {
    keyId,
    teamId,
    bundleId,
    // Secret stores often escape newlines; normalize back to real ones.
    privateKey: privateKey.replace(/\\n/g, "\n"),
    primaryHost: data.apns_use_sandbox === true ? SANDBOX_HOST : PROD_HOST,
  };
}

function trimOrNull(v: unknown): string | null {
  const t = typeof v === "string" ? v.trim() : "";
  return t.length > 0 ? t : null;
}

/** Admin-UI helper: a non-secret summary of the stored key. */
export function previewApnsKey(p8: string | null | undefined): {
  configured: boolean;
  label: string;
} {
  const t = (p8 ?? "").trim();
  if (!t) return { configured: false, label: "No APNs key is saved yet." };
  return { configured: true, label: "APNs auth key saved." };
}
