"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { reconcileBadgeForUser } from "@/lib/notifications/badge-reconcile";

/**
 * Repair the caller's own stuck app-icon badge via a badge-only push.
 *
 * Called by `NativeBadgeSync` only when the native badge plugin isn't in the
 * running build (iOS <= 1.0.1), where the icon can't be written from JS and the
 * badge would otherwise stay stuck forever. See badge-reconcile.ts.
 *
 * Takes no count: the number is derived server-side from the caller's own
 * inbox, so a client can neither badge another user nor pick the number.
 */
export async function reconcileAppBadgeAction(): Promise<{ ok: boolean }> {
  if (!hasSupabaseEnv()) return { ok: false };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };

  // Service role: the reconcile reads device_tokens and writes last_badge /
  // disabled_at, none of which the caller's RLS-scoped session can touch. The
  // user id comes from the verified session above, never from the client.
  const res = await reconcileBadgeForUser(createServiceRoleClient(), user.id);
  return { ok: res.ok };
}
