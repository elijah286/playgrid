"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { CLICK_ID_PARAMS, type ClickIds } from "@/lib/attribution/click-ids";
import { setFirstTouchCookieIfMissing } from "@/lib/attribution/first-touch";
import { lookupGeo } from "@/lib/geo/maxmind";
import { clientIpFromHeaders } from "@/lib/geo/request-ip";

const BOT_RE = /bot|crawl|spider|slurp|bingpreview|headlesschrome/i;

export type RecordPageViewInput = {
  sessionId: string;
  path: string;
  referrer?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  utmTerm?: string | null;
  landingPath?: string | null;
  clickIds?: ClickIds | null;
  device?: "mobile" | "tablet" | "desktop" | null;
  userAgent?: string | null;
  isFirstSessionEvent?: boolean;
};

function safeDecode(v: string | null | undefined): string | null {
  if (!v) return null;
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

function trim(v: string | null | undefined, max = 512): string | null {
  if (!v) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
}

export async function recordPageViewAction(input: RecordPageViewInput) {
  try {
    if (!hasSupabaseEnv()) return { ok: true as const };
    if (!input?.sessionId || !input?.path) return { ok: true as const };

    const h = await headers();
    // Try Vercel-style geo headers first (free if we ever move under Vercel),
    // then fall back to a MaxMind GeoLite2 lookup using the client IP.
    let country = h.get("x-vercel-ip-country");
    let region = h.get("x-vercel-ip-country-region");
    let city = h.get("x-vercel-ip-city");
    if (!country && !region && !city) {
      const ip = clientIpFromHeaders(h);
      const geo = await lookupGeo(ip);
      country = geo.country;
      region = geo.region;
      city = geo.city;
    }

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

    const utmSource = trim(input.utmSource);
    const utmMedium = trim(input.utmMedium);
    const utmCampaign = trim(input.utmCampaign);
    const utmContent = trim(input.utmContent);
    const utmTerm = trim(input.utmTerm);
    const referrer = trim(input.referrer, 2048);
    const landingPath = trim(input.landingPath, 2048);
    const decodedCountry = safeDecode(country);
    const decodedRegion = safeDecode(region);
    const decodedCity = safeDecode(city);

    const clickIds: ClickIds = {};
    if (input.clickIds) {
      for (const k of CLICK_ID_PARAMS) {
        const v = trim(input.clickIds[k] ?? null);
        if (v) clickIds[k] = v;
      }
    }

    const admin = createServiceRoleClient();
    await admin.from("page_views").insert({
      session_id: input.sessionId,
      path: input.path.slice(0, 2048),
      referrer,
      utm_source: utmSource,
      utm_medium: utmMedium,
      utm_campaign: utmCampaign,
      utm_content: utmContent,
      utm_term: utmTerm,
      landing_path: landingPath,
      country: decodedCountry,
      region: decodedRegion,
      city: decodedCity,
      user_agent: ua,
      device: input.device ?? null,
      user_id: userId,
      is_bot: isBot,
      ...clickIds,
    });

    if (input.isFirstSessionEvent && !isBot) {
      await setFirstTouchCookieIfMissing({
        utm_source: utmSource,
        utm_medium: utmMedium,
        utm_campaign: utmCampaign,
        utm_content: utmContent,
        utm_term: utmTerm,
        referrer,
        landing_path: landingPath,
        country: decodedCountry,
        region: decodedRegion,
        city: decodedCity,
        ...clickIds,
      });
    }

    return { ok: true as const };
  } catch {
    // Best-effort telemetry — never bubble up.
    return { ok: true as const };
  }
}
