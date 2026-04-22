"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/config";

const BOT_RE = /bot|crawl|spider|slurp|bingpreview|headlesschrome/i;

export type RecordPageViewInput = {
  sessionId: string;
  path: string;
  referrer?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  device?: "mobile" | "tablet" | "desktop" | null;
  userAgent?: string | null;
};

export async function recordPageViewAction(input: RecordPageViewInput) {
  try {
    if (!hasSupabaseEnv()) return { ok: true as const };
    if (!input?.sessionId || !input?.path) return { ok: true as const };

    const h = await headers();
    const country = h.get("x-vercel-ip-country");
    const region = h.get("x-vercel-ip-country-region");
    const city = h.get("x-vercel-ip-city");

    // Auth user is optional; best-effort.
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

    const ua = input.userAgent ?? h.get("user-agent") ?? null;
    const isBot = ua ? BOT_RE.test(ua) : false;

    const admin = createServiceRoleClient();
    await admin.from("page_views").insert({
      session_id: input.sessionId,
      path: input.path.slice(0, 2048),
      referrer: input.referrer ?? null,
      utm_source: input.utmSource ?? null,
      utm_medium: input.utmMedium ?? null,
      utm_campaign: input.utmCampaign ?? null,
      country: country ? decodeURIComponent(country) : null,
      region: region ? decodeURIComponent(region) : null,
      city: city ? decodeURIComponent(city) : null,
      user_agent: ua,
      device: input.device ?? null,
      user_id: userId,
      is_bot: isBot,
    });
    return { ok: true as const };
  } catch {
    // Best-effort telemetry — never bubble up.
    return { ok: true as const };
  }
}
