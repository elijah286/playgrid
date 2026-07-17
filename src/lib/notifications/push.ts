import { createSign } from "node:crypto";
import type { createServiceRoleClient } from "@/lib/supabase/admin";
import { sendApnsToTokens } from "@/lib/notifications/apns";
import { loadApnsConfig } from "@/lib/site/apns-config";
import type { PushCategory } from "@/lib/notifications/categories";
import { computeInboxBadgeCount } from "@/lib/inbox/derive";

type Admin = ReturnType<typeof createServiceRoleClient>;

/**
 * Native push fan-out via FCM HTTP v1.
 *
 * Auth has two paths, tried in order:
 *   1. FCM_SERVICE_ACCOUNT_JSON — full service-account JSON. We mint the OAuth2
 *      token ourselves with Node crypto (RS256 JWT), no extra dependency.
 *   2. Cloud Run's attached service account via the GCP metadata server — no
 *      key file (the project's org policy disables service-account keys). Used
 *      whenever we're on Cloud Run (K_SERVICE set) or FCM_PROJECT_ID is set;
 *      the runtime SA must hold roles/firebasecloudmessaging.admin.
 *
 * When neither path is available — local dev, tests, or before Firebase is
 * wired — every send is a silent no-op, the same graceful-degradation contract
 * the Resend email path uses. Push is always best-effort: the in-app row /
 * email is the source of truth. Tokens are cached process-wide until ~1 min
 * before expiry.
 */

const METADATA_TOKEN_URL =
  "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token";
const METADATA_PROJECT_URL =
  "http://metadata.google.internal/computeMetadata/v1/project/project-id";

// Upper bound on a single FCM send. FCM normally responds in well under a
// second; this just guarantees a hung connection can't stall the fan-out.
const FCM_SEND_TIMEOUT_MS = 10_000;

export type { PushCategory };

export type PushMessage = {
  title: string;
  body: string;
  /** Deep-link path opened when the notification is tapped (e.g. /playbooks/x?tab=calendar). */
  link?: string;
  /** Extra string key/values delivered in the data payload. */
  data?: Record<string, string>;
  /**
   * iOS interruption level. "time-sensitive" breaks through Focus / Do Not
   * Disturb and floats the banner above ordinary notifications — reserved for
   * the highest-signal alerts (e.g. coach feedback). Omitted → Apple's default
   * ("active"). Has no effect on Android, which already sends at high priority.
   */
  interruptionLevel?: "active" | "time-sensitive";
};

type ServiceAccount = {
  clientEmail: string;
  privateKey: string;
  projectId: string;
};

function loadServiceAccount(): ServiceAccount | null {
  const raw = process.env.FCM_SERVICE_ACCOUNT_JSON;
  if (!raw || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as {
      client_email?: string;
      private_key?: string;
      project_id?: string;
    };
    if (!parsed.client_email || !parsed.private_key || !parsed.project_id) {
      return null;
    }
    return {
      clientEmail: parsed.client_email,
      // Secret stores often escape newlines; normalize back to real ones.
      privateKey: parsed.private_key.replace(/\\n/g, "\n"),
      projectId: parsed.project_id,
    };
  } catch {
    return null;
  }
}

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function tokenFromServiceAccount(sa: ServiceAccount): Promise<{ value: string; expiresIn: number } | null> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({
      iss: sa.clientEmail,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const signingInput = `${header}.${claims}`;
  const signature = createSign("RSA-SHA256")
    .update(signingInput)
    .sign(sa.privateKey)
    .toString("base64url");
  const assertion = `${signingInput}.${signature}`;

  let res: Response;
  try {
    res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) return null;
  return { value: json.access_token, expiresIn: json.expires_in ?? 3600 };
}

async function metadataGet(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);
    const res = await fetch(url, {
      headers: { "Metadata-Flavor": "Google" },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function tokenFromMetadataServer(): Promise<{ value: string; expiresIn: number } | null> {
  const body = await metadataGet(METADATA_TOKEN_URL);
  if (!body) return null;
  try {
    const json = JSON.parse(body) as { access_token?: string; expires_in?: number };
    if (!json.access_token) return null;
    return { value: json.access_token, expiresIn: json.expires_in ?? 3600 };
  } catch {
    return null;
  }
}

/**
 * Resolve an access token + the FCM project id, or null when push isn't
 * configured for this environment. Caches the token until ~1 min before expiry.
 */
async function getAuth(): Promise<{ accessToken: string; projectId: string } | null> {
  const sa = loadServiceAccount();
  const onGcp = Boolean(process.env.K_SERVICE) || Boolean(process.env.FCM_PROJECT_ID);
  if (!sa && !onGcp) return null;

  const projectId =
    sa?.projectId ??
    process.env.FCM_PROJECT_ID ??
    (await metadataGet(METADATA_PROJECT_URL));
  if (!projectId) return null;

  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt - 60 > now) {
    return { accessToken: cachedToken.value, projectId };
  }

  const minted = sa
    ? await tokenFromServiceAccount(sa)
    : await tokenFromMetadataServer();
  if (!minted) return null;
  cachedToken = { value: minted.value, expiresAt: now + minted.expiresIn };
  return { accessToken: minted.value, projectId };
}

type TokenRow = { id: string; token: string; platform: string | null; user_id: string };

async function activeTokensForUsers(
  admin: Admin,
  userIds: string[],
): Promise<TokenRow[]> {
  if (userIds.length === 0) return [];
  const { data } = await admin
    .from("device_tokens")
    .select("id, token, platform, user_id")
    .in("user_id", userIds)
    .is("disabled_at", null);
  return (data ?? []) as TokenRow[];
}

// Cap on how many recipients we'll compute a live badge count for in one
// fan-out. Each count is a small handful of indexed queries; typical inbox
// pushes target 1–3 owners, so this only trips on wide broadcasts (e.g. a
// league-wide announcement) where the exact per-user badge isn't worth N
// derivations. Above the cap we skip badges for the send — the count self-heals
// on the next targeted push (and, once shipped, the native set-on-open path).
const MAX_BADGE_RECIPIENTS = 50;

/**
 * Map each recipient user id → their live inbox badge count (or omit them when
 * the count can't be derived). Runs the shared inbox derivation once per user,
 * concurrently. Returns an empty map — i.e. no badges — when the recipient set
 * is larger than MAX_BADGE_RECIPIENTS, so a wide broadcast never triggers N
 * derivations. Always resolves; never throws (each count is itself best-effort).
 */
async function resolveBadgeCounts(
  admin: Admin,
  userIds: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (userIds.length === 0 || userIds.length > MAX_BADGE_RECIPIENTS) return out;
  await Promise.all(
    userIds.map(async (uid) => {
      const count = await computeInboxBadgeCount(admin, uid);
      if (typeof count === "number") out.set(uid, count);
    }),
  );
  return out;
}

/** True when the FCM (Android) send path can authenticate in this env. */
function fcmConfigured(): boolean {
  return (
    Boolean(loadServiceAccount()) ||
    Boolean(process.env.K_SERVICE) ||
    Boolean(process.env.FCM_PROJECT_ID)
  );
}

async function filterOptedOut(
  admin: Admin,
  userIds: string[],
  category: PushCategory,
): Promise<string[]> {
  if (userIds.length === 0) return [];
  const { data } = await admin
    .from("push_opt_outs")
    .select("user_id")
    .eq("category", category)
    .in("user_id", userIds);
  const optedOut = new Set((data ?? []).map((r) => r.user_id as string));
  return userIds.filter((id) => !optedOut.has(id));
}

// FCM v1 returns these errorCodes when a token is permanently dead. We
// soft-disable those rows so we stop sending and keep an audit trail.
const DEAD_TOKEN_CODES = new Set(["UNREGISTERED", "NOT_FOUND", "INVALID_ARGUMENT"]);

async function sendOne(opts: {
  projectId: string;
  accessToken: string;
  token: string;
  message: PushMessage;
  /** Absolute app-icon badge for this recipient (Android best-effort). */
  badge?: number;
}): Promise<{ ok: true } | { ok: false; dead: boolean }> {
  const data: Record<string, string> = { ...(opts.message.data ?? {}) };
  if (opts.message.link) data.link = opts.message.link;

  // Android has no OS-level "set badge to N" API; launchers that support
  // badging (Samsung One UI, some others) read AndroidNotification.notification_count.
  // Best-effort — most launchers show a dot regardless and ignore this.
  const androidNotification: Record<string, unknown> = { default_sound: true };
  if (typeof opts.badge === "number") {
    androidNotification.notification_count = Math.max(0, Math.trunc(opts.badge));
  }

  // Hard timeout: a stalled FCM call must never hang the request. Without
  // this, a single slow send could block the whole push fan-out (and, when
  // FCM ran before APNs, silently starve the iOS send).
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FCM_SEND_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(
      `https://fcm.googleapis.com/v1/projects/${opts.projectId}/messages:send`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${opts.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: {
            token: opts.token,
            notification: {
              title: opts.message.title,
              body: opts.message.body,
            },
            data,
            android: { priority: "high", notification: androidNotification },
            apns: {
              payload: { aps: { sound: "default" } },
            },
          },
        }),
        signal: controller.signal,
      },
    );
  } catch {
    return { ok: false, dead: false };
  } finally {
    clearTimeout(timer);
  }
  if (res.ok) return { ok: true };
  let code = "";
  try {
    const err = (await res.json()) as {
      error?: { details?: Array<{ errorCode?: string }>; status?: string };
    };
    code =
      err.error?.details?.find((d) => d.errorCode)?.errorCode ??
      err.error?.status ??
      "";
  } catch {
    /* non-JSON error body */
  }
  return { ok: false, dead: res.status === 404 || DEAD_TOKEN_CODES.has(code) };
}

/**
 * Fan a push out to every active device token of the given users, minus
 * anyone opted out of this category. Best-effort and idempotent-safe to call
 * alongside the existing email/in-app writes. Returns how many devices were
 * successfully delivered to (0 when push isn't configured).
 */
export async function sendPushToUsers(opts: {
  admin: Admin;
  userIds: string[];
  category: PushCategory;
  message: PushMessage;
}): Promise<{ delivered: number; configured: boolean }> {
  // Cheap check first: bail before any DB work when neither push transport
  // (FCM for Android, APNs for iOS) can be configured in this environment.
  const fcmReady = fcmConfigured();
  const apnsCfg = await loadApnsConfig(opts.admin);
  const apnsReady = apnsCfg !== null;
  if (!fcmReady && !apnsReady) {
    return { delivered: 0, configured: false };
  }

  const uniqueUserIds = Array.from(new Set(opts.userIds)).filter(Boolean);
  const eligible = await filterOptedOut(opts.admin, uniqueUserIds, opts.category);
  const tokens = await activeTokensForUsers(opts.admin, eligible);
  if (tokens.length === 0) return { delivered: 0, configured: true };

  // iOS device tokens are raw APNs tokens and go directly to Apple; every
  // other platform (Android) is an FCM registration token.
  const iosTokens = tokens.filter((t) => t.platform === "ios");
  const fcmTokens = tokens.filter((t) => t.platform !== "ios");

  // Resolve each recipient's live app-icon badge (their current inbox count) so
  // aps.badge / notification_count match the in-app bell. Derived from the same
  // code path as the bell (src/lib/inbox/derive.ts) — no separate counter to
  // drift. Skipped on wide broadcasts (see MAX_BADGE_RECIPIENTS) and always
  // best-effort: a null count just omits the badge, never blocks the push.
  const badgeByUser = await resolveBadgeCounts(
    opts.admin,
    Array.from(new Set(tokens.map((t) => t.user_id))),
  );
  const badgeFor = (userId: string): number | undefined =>
    badgeByUser.get(userId) ?? undefined;

  const deadFcmIds: string[] = [];
  const deadApnsIds: string[] = [];

  // Run the two transports CONCURRENTLY. They are independent (different
  // devices, different providers), so a slow or stalled FCM call must not
  // delay — or, as in the old sequential FCM→APNs order, entirely starve —
  // the iOS send. Each task is self-contained and best-effort.
  const fcmTask = async (): Promise<number> => {
    if (!fcmReady || fcmTokens.length === 0) return 0;
    const auth = await getAuth();
    if (!auth) return 0;
    let n = 0;
    await Promise.all(
      fcmTokens.map(async (t) => {
        const r = await sendOne({
          projectId: auth.projectId,
          accessToken: auth.accessToken,
          token: t.token,
          message: opts.message,
          badge: badgeFor(t.user_id),
        });
        if (r.ok) n += 1;
        else if (r.dead) deadFcmIds.push(t.id);
      }),
    );
    return n;
  };

  const apnsTask = async (): Promise<number> => {
    if (!apnsCfg || iosTokens.length === 0) return 0;
    const r = await sendApnsToTokens(
      apnsCfg,
      iosTokens.map((t) => ({ id: t.id, token: t.token, badge: badgeFor(t.user_id) })),
      opts.message,
    );
    deadApnsIds.push(...r.deadTokenIds);
    return r.delivered;
  };

  const [fcmDelivered, apnsDelivered] = await Promise.all([fcmTask(), apnsTask()]);
  const delivered = fcmDelivered + apnsDelivered;

  if (deadFcmIds.length > 0) {
    await opts.admin
      .from("device_tokens")
      .update({ disabled_at: new Date().toISOString(), disabled_reason: "fcm_unregistered" })
      .in("id", deadFcmIds);
  }
  if (deadApnsIds.length > 0) {
    await opts.admin
      .from("device_tokens")
      .update({ disabled_at: new Date().toISOString(), disabled_reason: "apns_unregistered" })
      .in("id", deadApnsIds);
  }

  // Record the badge each surviving token now shows, so the reconcile path can
  // tell a stuck icon from a correct one and skip the no-op push. Grouped by
  // value: a fan-out is typically 1–3 users, so this is one small update per
  // distinct count. Best-effort — a miss only costs a redundant reconcile push.
  await recordDeliveredBadges(
    opts.admin,
    tokens.filter((t) => !deadFcmIds.includes(t.id) && !deadApnsIds.includes(t.id)),
    badgeFor,
  );

  return { delivered, configured: true };
}

/**
 * Persist `device_tokens.last_badge` for tokens we just badged. Skips tokens the
 * send carried no badge for (a wide broadcast past MAX_BADGE_RECIPIENTS), since
 * those left whatever was already on the icon untouched — recording a value we
 * didn't send would make the reconcile skip a genuinely stuck badge.
 */
async function recordDeliveredBadges(
  admin: Admin,
  tokens: TokenRow[],
  badgeFor: (userId: string) => number | undefined,
): Promise<void> {
  const idsByBadge = new Map<number, string[]>();
  for (const t of tokens) {
    const b = badgeFor(t.user_id);
    if (typeof b !== "number") continue;
    const list = idsByBadge.get(b);
    if (list) list.push(t.id);
    else idsByBadge.set(b, [t.id]);
  }
  await Promise.all(
    Array.from(idsByBadge.entries()).map(([badge, ids]) =>
      admin.from("device_tokens").update({ last_badge: badge }).in("id", ids),
    ),
  );
}

/** Test seam: clear the cached access token between unit tests. */
export function __resetPushTokenCacheForTests(): void {
  cachedToken = null;
}
