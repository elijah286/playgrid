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
  // Supabase admin listUsers doesn't take an email filter, but we can
  // look up via the GoTrue REST endpoint with a `filter` query. The JS
  // SDK surfaces this through listUsers({ perPage, page }) only, so we
  // fall back to a direct fetch against the admin users endpoint.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const resp = await fetch(
    `${url}/auth/v1/admin/users?filter=${encodeURIComponent(`email = "${trimmed}"`)}`,
    {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      cache: "no-store",
    },
  );
  if (!resp.ok) {
    // If the filter query fails (older GoTrue), fall back to listing.
    const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const match = data?.users?.some((u) => u.email?.toLowerCase() === trimmed);
    const hasPassword = match ? await lookupHasPassword(admin, trimmed) : false;
    return { ok: true, exists: Boolean(match), hasPassword };
  }
  const json = (await resp.json()) as { users?: { email?: string }[] };
  const exists = Array.isArray(json.users) && json.users.length > 0;
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
