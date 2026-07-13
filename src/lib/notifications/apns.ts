import { createSign } from "node:crypto";
import http2 from "node:http2";

/**
 * Direct APNs (Apple Push Notification service) sender for iOS devices.
 *
 * Why a separate path from FCM: the iOS app registers via
 * `@capacitor/push-notifications`, which returns a raw **APNs device token**
 * (not an FCM registration token). Feeding that to FCM's v1 endpoint fails,
 * so iOS pushes go straight to Apple over HTTP/2 here, while Android keeps
 * using FCM in push.ts. Backend auth uses an APNs Auth Key (.p8, ES256 JWT)
 * — the same token-based auth Apple recommends, refreshed well within the
 * 1-hour ceiling.
 *
 * Config is loaded from the database (site_settings.apns_*) via
 * src/lib/site/apns-config.ts — managed in Site Admin alongside the other
 * third-party keys (Stripe, Resend, Claude, MaxMind, …), not via deploy-time
 * env vars. Graceful no-op when unset, same contract as the FCM path and
 * Resend email. Columns: apns_key_p8 (the .p8 PEM), apns_key_id,
 * apns_team_id, apns_bundle_id, apns_use_sandbox (bool).
 *
 * APNs distinguishes a "sandbox" host (development-signed builds) from the
 * production host (TestFlight + App Store). A token minted by a dev build
 * only works on sandbox and vice versa, so when a production send returns
 * BadDeviceToken we transparently retry once on sandbox (covers mixed
 * dev/TestFlight testing without per-token environment tracking).
 */

export const PROD_HOST = "api.push.apple.com";
export const SANDBOX_HOST = "api.development.push.apple.com";

// Upper bound on a single APNs HTTP/2 request so a hung connection can't
// stall the push fan-out.
const APNS_REQUEST_TIMEOUT_MS = 10_000;

export type ApnsMessage = {
  title: string;
  body: string;
  /** Deep-link path opened on tap (delivered as a top-level `link` key). */
  link?: string;
  /** Extra string key/values delivered alongside `aps`. */
  data?: Record<string, string>;
  /**
   * iOS interruption level (aps.interruption-level). "time-sensitive" breaks
   * through Focus / Do Not Disturb so the highest-signal alerts still land.
   * Omitted → Apple's default. Ignored for silent (content-available) pushes.
   */
  interruptionLevel?: "active" | "time-sensitive";
  /**
   * Silent push: sets aps.content-available and sends as an
   * `apns-push-type: background` at priority 5. With no title/body this wakes
   * the app to do background work (e.g. token refresh) without showing a
   * banner. Apple throttles these and won't wake a force-quit app on demand.
   */
  contentAvailable?: boolean;
  /**
   * Absolute value for the app-icon badge (aps.badge). iOS renders this on the
   * home-screen icon with zero app-side code — set it to the recipient's live
   * inbox count so the badge matches the in-app bell. `0` explicitly clears the
   * badge; `undefined` leaves whatever badge is already showing untouched.
   * APNs has no increment — the sender always supplies the absolute number.
   */
  badge?: number;
};

export type ApnsConfig = {
  keyId: string;
  teamId: string;
  bundleId: string;
  privateKey: string;
  /** Primary host: PROD_HOST normally, SANDBOX_HOST for dev builds. */
  primaryHost: string;
};

// Config is sourced from the database (site_settings.apns_*) — see
// src/lib/site/apns-config.ts — so it's managed in Site Admin alongside the
// other third-party keys, not via deploy-time env vars.

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

// APNs provider tokens are valid up to 1 hour; Apple rejects tokens older
// than that and also rate-limits very frequent regeneration. Refresh at
// ~50 minutes — comfortably inside both bounds.
let cachedJwt: { value: string; iat: number } | null = null;
const JWT_REFRESH_SECONDS = 50 * 60;

/** Mint (or reuse) the ES256 provider JWT for APNs token-based auth. */
export function mintApnsJwt(
  cfg: Pick<ApnsConfig, "keyId" | "teamId" | "privateKey">,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): string {
  if (cachedJwt && nowSeconds - cachedJwt.iat < JWT_REFRESH_SECONDS) {
    return cachedJwt.value;
  }
  const header = base64url(JSON.stringify({ alg: "ES256", kid: cfg.keyId }));
  const claims = base64url(JSON.stringify({ iss: cfg.teamId, iat: nowSeconds }));
  const signingInput = `${header}.${claims}`;
  const signature = createSign("SHA256")
    .update(signingInput)
    // EC P-256 signatures are DER by default; APNs/JOSE need raw r||s.
    .sign({ key: cfg.privateKey, dsaEncoding: "ieee-p1363" })
    .toString("base64url");
  const jwt = `${signingInput}.${signature}`;
  cachedJwt = { value: jwt, iat: nowSeconds };
  return jwt;
}

/** Build the APNs JSON payload from a platform-neutral message. */
export function buildApnsPayload(message: ApnsMessage): string {
  const aps: Record<string, unknown> = {};
  if (message.contentAvailable) aps["content-available"] = 1;
  // Set the app-icon badge whenever a number is supplied — including 0, which
  // clears it. Independent of the alert block: a silent (content-available)
  // push can still carry a badge update. Omitted → key absent → iOS leaves the
  // current badge as-is.
  if (typeof message.badge === "number") {
    aps.badge = Math.max(0, Math.trunc(message.badge));
  }
  // Only attach a visible alert when there's something to show; a pure silent
  // refresh push has neither title nor body.
  if (message.title || message.body) {
    aps.alert = { title: message.title, body: message.body };
    aps.sound = "default";
    // Elevate stand-out alerts so they pierce Focus / DND. Only on visible
    // pushes — silent refreshes never carry an interruption level.
    if (message.interruptionLevel) aps["interruption-level"] = message.interruptionLevel;
  }
  const payload: Record<string, unknown> = { aps };
  for (const [k, v] of Object.entries(message.data ?? {})) payload[k] = v;
  if (message.link) payload.link = message.link;
  return JSON.stringify(payload);
}

export type ApnsSendResult =
  | { ok: true }
  | { ok: false; dead: boolean; retrySandbox: boolean };

/**
 * Classify an APNs HTTP/2 response. 410 (Unregistered) and the terminal
 * 400 reasons mean the token will never work again → soft-disable it.
 * BadDeviceToken on the production host may just be a dev-build token, so we
 * flag a one-time sandbox retry before giving up.
 */
export function classifyApnsResponse(
  status: number,
  reason: string,
  triedSandbox: boolean,
): ApnsSendResult {
  if (status === 200) return { ok: true };
  const retrySandbox = !triedSandbox && reason === "BadDeviceToken";
  const dead =
    !retrySandbox &&
    (status === 410 ||
      reason === "Unregistered" ||
      reason === "BadDeviceToken" ||
      reason === "DeviceTokenNotForTopic");
  return { ok: false, dead, retrySandbox };
}

function postToApns(
  host: string,
  cfg: ApnsConfig,
  jwt: string,
  token: string,
  body: string,
  nowSeconds: number,
  pushType: "alert" | "background",
): Promise<{ status: number; reason: string } | null> {
  return new Promise((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const done = (v: { status: number; reason: string } | null) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(v);
    };
    let client: http2.ClientHttp2Session;
    try {
      client = http2.connect(`https://${host}`);
    } catch {
      done(null);
      return;
    }
    // Guard against a hung connection so the push fan-out can't stall.
    timer = setTimeout(() => {
      done(null);
      try {
        client.close();
      } catch {
        /* noop */
      }
    }, APNS_REQUEST_TIMEOUT_MS);
    client.on("error", () => {
      done(null);
      try {
        client.close();
      } catch {
        /* noop */
      }
    });
    const req = client.request({
      ":method": "POST",
      ":path": `/3/device/${token}`,
      authorization: `bearer ${jwt}`,
      "apns-topic": cfg.bundleId,
      // Silent refresh pushes must be type "background" at priority 5 or Apple
      // rejects / throttles them; visible alerts are "alert" at priority 10.
      "apns-push-type": pushType,
      "apns-priority": pushType === "background" ? "5" : "10",
      // Allow APNs to retry delivery for a day (good for reminders).
      "apns-expiration": String(nowSeconds + 24 * 60 * 60),
      "content-type": "application/json",
    });
    let status = 0;
    let data = "";
    req.on("response", (headers) => {
      status = Number(headers[":status"]) || 0;
    });
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => {
      let reason = "";
      if (data) {
        try {
          reason = (JSON.parse(data) as { reason?: string }).reason ?? "";
        } catch {
          /* non-JSON body */
        }
      }
      done({ status, reason });
      try {
        client.close();
      } catch {
        /* noop */
      }
    });
    req.on("error", () => {
      done(null);
      try {
        client.close();
      } catch {
        /* noop */
      }
    });
    req.end(body);
  });
}

async function sendOneApns(
  cfg: ApnsConfig,
  jwt: string,
  token: string,
  body: string,
  nowSeconds: number,
  pushType: "alert" | "background",
): Promise<ApnsSendResult> {
  const otherHost =
    cfg.primaryHost === PROD_HOST ? SANDBOX_HOST : PROD_HOST;

  const first = await postToApns(cfg.primaryHost, cfg, jwt, token, body, nowSeconds, pushType);
  if (!first) return { ok: false, dead: false, retrySandbox: false };

  const verdict = classifyApnsResponse(
    first.status,
    first.reason,
    cfg.primaryHost === SANDBOX_HOST,
  );
  if (!verdict.ok && verdict.retrySandbox) {
    const second = await postToApns(otherHost, cfg, jwt, token, body, nowSeconds, pushType);
    if (!second) return { ok: false, dead: false, retrySandbox: false };
    return classifyApnsResponse(second.status, second.reason, true);
  }
  return verdict;
}

/**
 * Send a message to a set of iOS APNs device tokens. The caller supplies the
 * config (loaded from the DB via apns-config.ts). Returns delivered count and
 * the ids of tokens that are permanently dead (so the caller can soft-disable).
 */
export async function sendApnsToTokens(
  cfg: ApnsConfig,
  tokens: { id: string; token: string; badge?: number }[],
  message: ApnsMessage,
): Promise<{ delivered: number; deadTokenIds: string[] }> {
  if (tokens.length === 0) return { delivered: 0, deadTokenIds: [] };

  const nowSeconds = Math.floor(Date.now() / 1000);
  const jwt = mintApnsJwt(cfg, nowSeconds);
  const pushType: "alert" | "background" = message.contentAvailable ? "background" : "alert";

  // The badge is per-recipient (each user has a different inbox count), so the
  // payload is built per token. Everything else is identical; when no token
  // carries a badge this collapses to a single reused body via the cache below.
  const bodyCache = new Map<number | "none", string>();
  const bodyFor = (badge: number | undefined): string => {
    const key = typeof badge === "number" ? badge : "none";
    const cached = bodyCache.get(key);
    if (cached) return cached;
    const built = buildApnsPayload(
      typeof badge === "number" ? { ...message, badge } : message,
    );
    bodyCache.set(key, built);
    return built;
  };

  const deadTokenIds: string[] = [];
  let delivered = 0;
  await Promise.all(
    tokens.map(async (t) => {
      const r = await sendOneApns(cfg, jwt, t.token, bodyFor(t.badge), nowSeconds, pushType);
      if (r.ok) delivered += 1;
      else if (r.dead) deadTokenIds.push(t.id);
    }),
  );
  return { delivered, deadTokenIds };
}

/** Test seam: clear the cached provider JWT between unit tests. */
export function __resetApnsJwtCacheForTests(): void {
  cachedJwt = null;
}
