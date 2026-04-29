import { createServiceRoleClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { readFirstTouchCookie } from "./first-touch";

// Window after auth.users.created_at during which we still consider a sign-in
// to be the "signup" event for attribution purposes. The OAuth roundtrip is
// usually under a minute; 5 min covers slow networks and email-confirmation
// flows. Outside this window we treat the auth callback as a returning login
// and don't touch profiles.
const SIGNUP_GRACE_MS = 5 * 60 * 1000;

// Stamp the pg_first_touch cookie payload onto the user's profile, exactly
// once. Called from the auth callback after a successful exchange. Idempotent:
// if first_touch_at is already set, this is a no-op so a returning user's
// original attribution survives a second sign-in from a different campaign.
export async function snapshotFirstTouchToProfile(
  userId: string,
  userCreatedAt: string | null | undefined,
): Promise<void> {
  if (!hasSupabaseEnv() || !userId) return;
  if (!userCreatedAt) return;
  const createdMs = new Date(userCreatedAt).getTime();
  if (!Number.isFinite(createdMs)) return;
  if (Date.now() - createdMs > SIGNUP_GRACE_MS) return;
  try {
    const payload = await readFirstTouchCookie();
    if (!payload) return;

    const admin = createServiceRoleClient();
    const { data: existing, error: readErr } = await admin
      .from("profiles")
      .select("first_touch_at")
      .eq("id", userId)
      .maybeSingle();
    if (readErr || existing?.first_touch_at) return;

    await admin
      .from("profiles")
      .update({
        first_touch_at: payload.ts,
        first_utm_source: payload.utm_source,
        first_utm_medium: payload.utm_medium,
        first_utm_campaign: payload.utm_campaign,
        first_utm_content: payload.utm_content,
        first_utm_term: payload.utm_term,
        first_referrer: payload.referrer,
        first_landing_path: payload.landing_path,
        first_country: payload.country,
        first_region: payload.region,
        first_city: payload.city,
        first_fbclid: payload.fbclid ?? null,
        first_gclid: payload.gclid ?? null,
        first_gbraid: payload.gbraid ?? null,
        first_wbraid: payload.wbraid ?? null,
        first_ttclid: payload.ttclid ?? null,
        first_li_fat_id: payload.li_fat_id ?? null,
        first_twclid: payload.twclid ?? null,
        first_msclkid: payload.msclkid ?? null,
      })
      .eq("id", userId)
      .is("first_touch_at", null);
  } catch {
    // Best-effort; never block sign-in on attribution stamping.
  }
}
