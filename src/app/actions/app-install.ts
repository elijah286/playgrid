"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import {
  buildAppOpenWrite,
  clipStr,
  isAppPlatform,
  type AppInstallRow,
  type AppPlatform,
} from "@/lib/analytics/app-open";

export type RecordAppOpenInput = {
  installId: string;
  platform: AppPlatform;
  appVersion?: string | null;
  installReferrer?: string | null;
};

/**
 * Record a native app launch. The first launch of an install (install_id not
 * seen before) is our "install" signal — it inserts the row. Repeat opens bump
 * last_opened_at and attach the user once authenticated. Best-effort: failures
 * are swallowed so analytics never breaks the app. Only the native shell calls
 * this (it no-ops elsewhere), so there's no web traffic on this path.
 */
export async function recordAppOpenAction(input: RecordAppOpenInput) {
  try {
    if (!hasSupabaseEnv()) return { ok: true as const };
    const installId = clipStr(input?.installId, 128);
    if (!installId || !isAppPlatform(input?.platform)) return { ok: true as const };

    let userId: string | null = null;
    try {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      userId = user?.id ?? null;
    } catch {
      userId = null;
    }

    const admin = createServiceRoleClient();
    const { data: existing } = await admin
      .from("app_installs")
      .select("install_id, user_id, install_referrer")
      .eq("install_id", installId)
      .maybeSingle();

    const write = buildAppOpenWrite((existing as AppInstallRow | null) ?? null, {
      installId,
      platform: input.platform,
      userId,
      appVersion: clipStr(input.appVersion, 32),
      installReferrer: clipStr(input.installReferrer, 512),
      now: new Date().toISOString(),
    });

    if (write.action === "insert") {
      await admin.from("app_installs").insert(write.row);
    } else {
      await admin.from("app_installs").update(write.patch).eq("install_id", installId);
    }
    return { ok: true as const, firstOpen: write.action === "insert" };
  } catch {
    return { ok: true as const };
  }
}
