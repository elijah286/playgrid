import { createServiceRoleClient } from "@/lib/supabase/admin";

type Tier = "free" | "coach" | "coach_ai";

/** Concurrent session cap by tier. Free is intentionally tight (1 device);
 *  Coach allows desktop + mobile; Coach AI adds a third for power users. */
export const SESSION_CAP_BY_TIER: Record<Tier, number> = {
  free: 1,
  coach: 2,
  coach_ai: 3,
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
 * (user, device) pair (and enforces the concurrent-session cap by revoking
 * the LRU active row when over). Updates last_seen_at on subsequent
 * requests. Returns `revoked` if the row has been revoked elsewhere — the
 * caller should sign the user out.
 */
export async function touchUserSession(input: {
  userId: string;
  deviceId: string;
  ip: string | null;
  userAgent: string | null;
}): Promise<TouchResult> {
  const admin = createServiceRoleClient();
  const { data: existing } = await admin
    .from("user_sessions")
    .select("id, revoked_at, revoked_reason, last_seen_at")
    .eq("user_id", input.userId)
    .eq("device_id", input.deviceId)
    .maybeSingle();

  if (existing) {
    if (existing.revoked_at) {
      return { kind: "revoked", reason: existing.revoked_reason ?? null };
    }
    await admin
      .from("user_sessions")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", existing.id);
    return { kind: "ok" };
  }

  // First time we've seen this device for this user. Insert + cap-enforce.
  const label = labelForUserAgent(input.userAgent);
  await admin.from("user_sessions").insert({
    user_id: input.userId,
    device_id: input.deviceId,
    ip: input.ip,
    user_agent: input.userAgent,
    device_label: label,
  });
  await enforceSessionCap(input.userId);
  return { kind: "ok" };
}

/**
 * Counts active sessions for the user; if over the tier cap, revokes
 * least-recently-active rows until we're at the cap. The just-inserted row
 * has the most recent last_seen_at, so it survives by construction.
 */
async function enforceSessionCap(userId: string): Promise<void> {
  const admin = createServiceRoleClient();
  const { data: entRow } = await admin
    .from("user_entitlements")
    .select("tier")
    .eq("user_id", userId)
    .maybeSingle();
  const tier = ((entRow?.tier as Tier | null) ?? "free") as Tier;
  const cap = SESSION_CAP_BY_TIER[tier];
  const { data: active } = await admin
    .from("user_sessions")
    .select("id, last_seen_at")
    .eq("user_id", userId)
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
