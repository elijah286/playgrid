"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { CLICK_ID_PARAMS, type ClickIds } from "@/lib/attribution/click-ids";
import { setFirstTouchCookieIfMissing } from "@/lib/attribution/first-touch";
import { lookupGeo } from "@/lib/geo/maxmind";
import { clientIpFromHeaders } from "@/lib/geo/request-ip";
import { readConsentCookie, shouldSuppressTracking } from "@/lib/attribution/consent";

const BOT_RE = /bot|crawl|spider|slurp|bingpreview|headlesschrome/i;

// Routes that carry a share token in the path. Extracted so the admin
// virality view can join inbound visits back to the originating share.
const SHARE_TOKEN_PATH_RE = /^\/(copy|share|invite)\/([A-Za-z0-9_\-]{8,})/;

function extractShareToken(path: string | null | undefined): string | null {
  if (!path) return null;
  const m = SHARE_TOKEN_PATH_RE.exec(path);
  return m ? m[2] : null;
}

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
    let isEu = false;
    if (!country && !region && !city) {
      const ip = clientIpFromHeaders(h);
      const geo = await lookupGeo(ip);
      country = geo.country;
      region = geo.region;
      city = geo.city;
      isEu = geo.isEu;
    }
    const consent = await readConsentCookie();
    const suppress = shouldSuppressTracking({ isEu, consent });

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

    // EU/UK visitors who haven't consented: drop everything that could be
    // considered identifying. Country stays (less precise than region/city).
    const admin = createServiceRoleClient();
    const shareToken = extractShareToken(input.path);
    await admin.from("page_views").insert({
      session_id: input.sessionId,
      path: input.path.slice(0, 2048),
      share_token: shareToken,
      referrer: suppress ? null : referrer,
      utm_source: suppress ? null : utmSource,
      utm_medium: suppress ? null : utmMedium,
      utm_campaign: suppress ? null : utmCampaign,
      utm_content: suppress ? null : utmContent,
      utm_term: suppress ? null : utmTerm,
      landing_path: suppress ? null : landingPath,
      country: decodedCountry,
      region: suppress ? null : decodedRegion,
      city: suppress ? null : decodedCity,
      user_agent: ua,
      device: input.device ?? null,
      user_id: userId,
      is_bot: isBot,
      ...(suppress ? {} : clickIds),
    });

    if (input.isFirstSessionEvent && !isBot && !suppress) {
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
