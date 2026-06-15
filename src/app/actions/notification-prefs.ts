"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import {
  PUSH_CATEGORIES,
  PUSH_CATEGORY_META,
  isPushCategory,
  type PushCategory,
} from "@/lib/notifications/categories";

export type NotificationPrefsState = {
  /** category → enabled (true = receiving pushes). */
  categories: Record<PushCategory, boolean>;
  /** Whether the user has at least one active registered device. */
  deviceRegistered: boolean;
  /** Site admins additionally see the admin_ops toggle. */
  isAdmin: boolean;
};

function defaultEnabled(): Record<PushCategory, boolean> {
  return Object.fromEntries(PUSH_CATEGORIES.map((c) => [c, true])) as Record<
    PushCategory,
    boolean
  >;
}

/**
 * Read the signed-in user's push preferences for the account-settings card.
 * Opt-out is the model: a row in push_opt_outs means "off"; absence means "on".
 */
export async function getNotificationPrefsAction(): Promise<
  { ok: true; state: NotificationPrefsState } | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const admin = createServiceRoleClient();

  const [optOuts, devices, profile] = await Promise.all([
    admin.from("push_opt_outs").select("category").eq("user_id", user.id),
    admin
      .from("device_tokens")
      .select("id")
      .eq("user_id", user.id)
      .is("disabled_at", null)
      .limit(1),
    admin.from("profiles").select("role").eq("id", user.id).maybeSingle(),
  ]);

  const categories = defaultEnabled();
  for (const row of optOuts.data ?? []) {
    const c = row.category as string;
    if (isPushCategory(c)) categories[c] = false;
  }
  // Locked-on categories can never be off, regardless of any stray row.
  for (const c of PUSH_CATEGORIES) {
    if (PUSH_CATEGORY_META[c].lockedOn) categories[c] = true;
  }

  return {
    ok: true,
    state: {
      categories,
      deviceRegistered: (devices.data ?? []).length > 0,
      isAdmin: (profile.data?.role as string | null) === "admin",
    },
  };
}

/**
 * Toggle one category. enabled=false writes an opt-out row; enabled=true clears
 * it. Locked-on (critical) categories and admin-only categories for non-admins
 * are rejected.
 */
export async function setNotificationPrefAction(input: {
  category: string;
  enabled: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { category, enabled } = input;
  if (!isPushCategory(category)) return { ok: false, error: "Unknown category." };
  const meta = PUSH_CATEGORY_META[category];
  if (meta.lockedOn) {
    return { ok: false, error: "This category can't be turned off." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const admin = createServiceRoleClient();

  if (meta.audience === "admin") {
    const { data: profile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if ((profile?.role as string | null) !== "admin") {
      return { ok: false, error: "Forbidden." };
    }
  }

  if (enabled) {
    const { error } = await admin
      .from("push_opt_outs")
      .delete()
      .eq("user_id", user.id)
      .eq("category", category);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await admin.from("push_opt_outs").upsert(
      {
        user_id: user.id,
        category,
        opted_out_at: new Date().toISOString(),
        source: "settings",
      },
      { onConflict: "user_id,category" },
    );
    if (error) return { ok: false, error: error.message };
  }

  return { ok: true };
}
