import { createServiceRoleClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { classifySignupSource } from "@/lib/analytics/signup-source";
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

    // Enrich the user_signup system notice the trigger created moments
    // ago. The trigger fires on profile insert (before first-touch is
    // stamped), so the notice initially says "X signed up". Once we know
    // how the user got here, the inbox row should reflect that — admins
    // can see at a glance whether a signup came from a copy link, a
    // campaign, etc., without clicking through to the user detail.
    await enrichSignupNotice(admin, userId, payload).catch(() => {
      // Notice enrichment is non-critical; never block sign-in for it.
    });
  } catch {
    // Best-effort; never block sign-in on attribution stamping.
  }
}

async function enrichSignupNotice(
  admin: ReturnType<typeof createServiceRoleClient>,
  userId: string,
  payload: NonNullable<Awaited<ReturnType<typeof readFirstTouchCookie>>>,
): Promise<void> {
  const cls = classifySignupSource({
    landingPath: payload.landing_path,
    utmSource: payload.utm_source,
    utmMedium: payload.utm_medium,
    utmCampaign: payload.utm_campaign,
    referrer: payload.referrer,
  });

  // Find the most recent user_signup notice for this user. Trigger
  // inserts it well before this code runs, so it should always exist —
  // but if anything went sideways we fail soft.
  const { data: notice } = await admin
    .from("system_notices")
    .select("id, body, user_display_name, user_email")
    .eq("kind", "user_signup")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!notice) return;

  // Resolve "via" detail. For copy-link landings we look up the playbook
  // + the original sender so the notice reads
  // `Alice signed up via copy link to "Examples vs. 1-3-1 Blitz" (sent by Bob)`.
  let via = cls.label.toLowerCase();
  let extra: string | null = cls.detail;
  if (cls.kind === "copy_link" && cls.shareToken) {
    const { data: cl } = await admin
      .from("playbook_copy_links")
      .select("playbook_id, created_by")
      .eq("token", cls.shareToken)
      .maybeSingle();
    if (cl) {
      let pbName: string | null = null;
      let senderLabel: string | null = null;
      if (cl.playbook_id) {
        const { data: pb } = await admin
          .from("playbooks")
          .select("name")
          .eq("id", cl.playbook_id as string)
          .maybeSingle();
        pbName = (pb?.name as string | null) ?? null;
      }
      if (cl.created_by) {
        const { data: senderUser } = await admin.auth.admin.getUserById(
          cl.created_by as string,
        );
        const { data: senderProfile } = await admin
          .from("profiles")
          .select("display_name")
          .eq("id", cl.created_by as string)
          .maybeSingle();
        senderLabel =
          (senderProfile?.display_name as string | null) ||
          senderUser?.user?.email ||
          null;
      }
      via = `copy link${pbName ? ` to "${pbName}"` : ""}${senderLabel ? ` (sent by ${senderLabel})` : ""}`;
      extra = null;
    }
  }

  const who =
    notice.user_display_name?.trim() || notice.user_email || "A new user";
  const newBody =
    cls.kind === "unknown"
      ? `${who} signed up`
      : `${who} signed up via ${via}${extra && cls.kind !== "copy_link" ? ` · ${extra}` : ""}`;

  await admin
    .from("system_notices")
    .update({
      body: newBody,
      detail: {
        signup_source_kind: cls.kind,
        signup_source_label: cls.label,
        landing_path: payload.landing_path,
        utm_source: payload.utm_source,
        utm_medium: payload.utm_medium,
        utm_campaign: payload.utm_campaign,
        share_token: cls.shareToken,
        referrer: payload.referrer,
      },
    })
    .eq("id", notice.id as string);
}
