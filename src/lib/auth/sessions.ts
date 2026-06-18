import { createServiceRoleClient } from "@/lib/supabase/admin";

export type DeviceClass = "desktop" | "mobile";

/** Concurrent session policy. Uniform across tiers: every user gets 1
 *  desktop slot + 2 mobile slots. A new sign-in only evicts within its own
 *  bucket — a desktop login can never kick a phone, and vice versa. Two
 *  mobile slots covers the common phone + tablet pairing without needing
 *  (notoriously unreliable) tablet UA detection. Capacitor / native-app
 *  traffic counts as mobile. */
export const SESSION_CAP_BY_CLASS: Record<DeviceClass, number> = {
  desktop: 1,
  mobile: 2,
};

export const DEVICE_ID_COOKIE = "xog_device_id";
/** Stamp cookie that lets middleware short-circuit DB work when the session
 *  was touched recently. Format: `<unix-ms>`. */
export const SESSION_TOUCH_COOKIE = "xog_sess_touched";
export const SESSION_TOUCH_INTERVAL_MS = 60_000;

export type TouchResult =
  | { kind: "ok" }
  | { kind: "revoked"; reason: string | null };

/**
 * Idempotent per-request session touch. Inserts a row on first sight of a
 * (user, device) pair (and enforces the bucket-scoped concurrent-session
 * cap by revoking the LRU active row in the same device class when over).
 * Updates last_seen_at on subsequent requests.
 *
 * Returns `revoked` only when the row was revoked AND the request is still
 * the SAME sign-in that got kicked. A NEW sign-in on a revoked device
 * reclaims the slot instead (latest-sign-in-wins): it clears revoked_at and
 * re-runs the cap, which evicts the real LRU peer rather than the device the
 * user just signed in on. The discriminator is the Supabase `session_id`
 * claim — stable across token refreshes within one sign-in, fresh on every
 * new sign-in — passed in as `authSessionId`.
 */
export async function touchUserSession(input: {
  userId: string;
  deviceId: string;
  ip: string | null;
  userAgent: string | null;
  /** Supabase auth `session_id` of the request's current sign-in, or null
   *  when it couldn't be decoded. */
  authSessionId: string | null;
}): Promise<TouchResult> {
  const admin = createServiceRoleClient();
  const { data: existing } = await admin
    .from("user_sessions")
    .select("id, revoked_at, revoked_reason, auth_session_id, device_class")
    .eq("user_id", input.userId)
    .eq("device_id", input.deviceId)
    .maybeSingle();

  if (existing) {
    if (existing.revoked_at) {
      // Is this the same kicked session merely navigating, or a fresh
      // sign-in on this device? Keep it revoked ONLY when we can positively
      // confirm it's the same session (both ids present and equal). Any other
      // case — a new session id, or an id we couldn't read — biases toward
      // letting the sign-in through: a false lock-out (the user can't get
      // back in on their own device) is far worse than a bucket briefly over
      // cap. This is the "revoked_at is cleared on re-auth" behavior the
      // schema has always documented (see 0090_user_sessions.sql).
      const sameSession =
        !!input.authSessionId &&
        !!existing.auth_session_id &&
        input.authSessionId === existing.auth_session_id;
      if (sameSession) {
        return { kind: "revoked", reason: existing.revoked_reason ?? null };
      }
      const deviceClass =
        (existing.device_class as DeviceClass | null) ??
        deviceClassForUserAgent(input.userAgent);
      await admin
        .from("user_sessions")
        .update({
          revoked_at: null,
          revoked_reason: null,
          auth_session_id: input.authSessionId,
          last_seen_at: new Date().toISOString(),
          ip: input.ip,
          user_agent: input.userAgent,
        })
        .eq("id", existing.id);
      // The just-reclaimed row now has the most recent last_seen_at, so the
      // cap evicts the LRU *other* peer in this bucket — never this device.
      await enforceSessionCap(input.userId, deviceClass);
      return { kind: "ok" };
    }
    // Active row: move last_seen_at forward and keep the stored session id
    // current so a future cap-kick + re-auth comparison stays accurate. Don't
    // clobber a known id with null on a transient decode miss.
    await admin
      .from("user_sessions")
      .update({
        last_seen_at: new Date().toISOString(),
        auth_session_id: input.authSessionId ?? existing.auth_session_id,
      })
      .eq("id", existing.id);
    return { kind: "ok" };
  }

  // First time we've seen this device for this user. Insert + cap-enforce.
  const label = labelForUserAgent(input.userAgent);
  const deviceClass = deviceClassForUserAgent(input.userAgent);
  await admin.from("user_sessions").insert({
    user_id: input.userId,
    device_id: input.deviceId,
    ip: input.ip,
    user_agent: input.userAgent,
    device_label: label,
    device_class: deviceClass,
    auth_session_id: input.authSessionId,
  });
  await enforceSessionCap(input.userId, deviceClass);
  return { kind: "ok" };
}

/**
 * Counts active sessions for the user *within the given device class*; if
 * over the bucket cap, revokes least-recently-active rows in that bucket
 * until we're at the cap. The just-inserted row has the most recent
 * last_seen_at, so it survives by construction. The other bucket is
 * untouched.
 */
async function enforceSessionCap(
  userId: string,
  deviceClass: DeviceClass,
): Promise<void> {
  const admin = createServiceRoleClient();
  const cap = SESSION_CAP_BY_CLASS[deviceClass];
  const { data: active } = await admin
    .from("user_sessions")
    .select("id, last_seen_at")
    .eq("user_id", userId)
    .eq("device_class", deviceClass)
    .is("revoked_at", null)
    .order("last_seen_at", { ascending: false });

  const rows = active ?? [];
  if (rows.length <= cap) return;
  const toRevoke = rows.slice(cap).map((r) => r.id as string);
  await admin
    .from("user_sessions")
    .update({ revoked_at: new Date().toISOString(), revoked_reason: "cap_kicked" })
    .in("id", toRevoke);
}

/** Best-effort UA → "Chrome on Mac" string. Cheap regex; intentionally
 *  imprecise — it's a hint for the audit list, not a security signal. */
export function labelForUserAgent(ua: string | null): string {
  if (!ua) return "Unknown device";
  if (/PlaybookApp|Capacitor/i.test(ua)) return "Playbook app";
  const browser =
    /Edg\//.test(ua) ? "Edge" :
    /Chrome\//.test(ua) ? "Chrome" :
    /Firefox\//.test(ua) ? "Firefox" :
    /Safari\//.test(ua) ? "Safari" :
    "Browser";
  const os =
    /iPhone|iPad|iPod/.test(ua) ? "iOS" :
    /Android/.test(ua) ? "Android" :
    /Mac OS X|Macintosh/.test(ua) ? "Mac" :
    /Windows/.test(ua) ? "Windows" :
    /Linux/.test(ua) ? "Linux" :
    "device";
  return `${browser} on ${os}`;
}

/** Bucket a UA into desktop vs mobile for concurrent-session caps. The
 *  Capacitor wrapper / native app counts as mobile regardless of host OS.
 *  Caveat: iPadOS Safari ships a Mac desktop UA by default, so an iPad in
 *  the browser will be classed as desktop — by design, since reliably
 *  detecting iPad server-side from UA alone isn't possible. The native
 *  app wrapper avoids this. */
export function deviceClassForUserAgent(ua: string | null): DeviceClass {
  if (!ua) return "desktop";
  if (/PlaybookApp|Capacitor/i.test(ua)) return "mobile";
  if (/iPhone|iPod|Android|Mobile/i.test(ua)) return "mobile";
  return "desktop";
}
