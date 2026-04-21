"use server";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { clientIp, rateLimit } from "@/lib/rate-limit";

/**
 * Does this email already have an account?
 *
 * Drives the unified auth flow: if true we show the password step,
 * if false we send a signup code. Supabase's admin API supports a
 * direct filter here so we don't need to scan.
 *
 * Trade-off: this exposes account existence to anyone (account
 * enumeration). The UX win is large enough that every modern
 * consumer auth UI accepts the trade-off; if that changes, revert
 * this to "always ask for password, fall back to code on failure".
 */
export async function emailHasAccountAction(
  email: string,
): Promise<
  | { ok: true; exists: boolean; hasPassword: boolean }
  | { ok: false; error: string }
> {
  if (!hasSupabaseEnv()) {
    return { ok: false, error: "Supabase is not configured." };
  }
  const trimmed = email.trim().toLowerCase();
  if (!trimmed || !trimmed.includes("@")) {
    return { ok: false, error: "Enter a valid email." };
  }

  const ip = await clientIp();
  const allowed = await rateLimit(`auth-lookup:${ip}`, {
    windowSeconds: 60,
    max: 10,
  });
  if (!allowed) {
    return { ok: false, error: "Too many attempts. Try again in a minute." };
  }

  const admin = createServiceRoleClient();
  // Go direct to auth.users via our own RPC. The GoTrue admin `filter`
  // endpoint returns HTTP 200 with an empty users array on some versions
  // even when the address exists, so we can't rely on it.
  const { data: existsData, error: existsErr } = await admin.rpc("email_exists", {
    p_email: trimmed,
  });
  if (existsErr) return { ok: false, error: existsErr.message };
  const exists = Boolean(existsData);
  const hasPassword = exists ? await lookupHasPassword(admin, trimmed) : false;
  return { ok: true, exists, hasPassword };
}

async function lookupHasPassword(
  admin: ReturnType<typeof createServiceRoleClient>,
  email: string,
): Promise<boolean> {
  const { data, error } = await admin.rpc("email_has_password", {
    p_email: email,
  });
  if (error) return false;
  return Boolean(data);
}
