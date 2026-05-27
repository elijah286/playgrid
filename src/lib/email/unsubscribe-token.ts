import { createHmac, timingSafeEqual } from "node:crypto";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://www.xogridmaker.com";

/** Secret used to sign unsubscribe tokens. We prefer an explicit
 *  `EMAIL_TOKEN_SECRET` env var, but fall back to a derived value from
 *  `SUPABASE_SERVICE_ROLE_KEY` so test-sends work without extra config.
 *  In production set `EMAIL_TOKEN_SECRET` so rotating the service role
 *  doesn't invalidate already-sent unsubscribe links. */
function secret(): string {
  const explicit = process.env.EMAIL_TOKEN_SECRET;
  if (explicit && explicit.length >= 16) return explicit;
  const fallback = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!fallback) {
    throw new Error(
      "Missing EMAIL_TOKEN_SECRET (and no SUPABASE_SERVICE_ROLE_KEY fallback)",
    );
  }
  return `unsub:${fallback}`;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

/**
 * Build a one-click unsubscribe URL. Token format:
 *   `${userId}.${category}.${hmac-of-userId|category}`
 *
 * The endpoint at `/api/email/unsubscribe` verifies the HMAC before
 * writing an `email_opt_outs` row. Without HMAC we'd let anyone
 * unsubscribe anyone given a UUID — annoying-but-not-dangerous.
 */
export function buildUnsubscribeUrl(input: {
  userId: string;
  category: string;
}): string {
  const payload = `${input.userId}|${input.category}`;
  const tok = sign(payload);
  const url = new URL(`${SITE_URL.replace(/\/$/, "")}/api/email/unsubscribe`);
  url.searchParams.set("u", input.userId);
  url.searchParams.set("c", input.category);
  url.searchParams.set("t", tok);
  return url.toString();
}

/**
 * Verify a token presented at the unsubscribe endpoint. Constant-time
 * comparison so a successful guess can't be inferred from timing.
 * Returns the parsed userId/category or null on any failure.
 */
export function verifyUnsubscribeToken(input: {
  userId: string;
  category: string;
  token: string;
}): { userId: string; category: string } | null {
  if (!input.userId || !input.category || !input.token) return null;
  const expected = sign(`${input.userId}|${input.category}`);
  const a = Buffer.from(expected);
  const b = Buffer.from(input.token);
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;
  return { userId: input.userId, category: input.category };
}
