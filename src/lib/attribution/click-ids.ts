// Per-platform click IDs that ad networks attach to landing-page URLs.
// We capture them so we can reconcile site traffic / signups against the
// platform's own conversion data later (Meta CAPI, Google enhanced
// conversions, TikTok Events API, etc).
export const CLICK_ID_PARAMS = [
  "fbclid",
  "gclid",
  "gbraid",
  "wbraid",
  "ttclid",
  "li_fat_id",
  "twclid",
  "msclkid",
] as const;

export type ClickIdParam = (typeof CLICK_ID_PARAMS)[number];

export type ClickIds = Partial<Record<ClickIdParam, string | null>>;

export function pickClickIds(query: URLSearchParams): ClickIds {
  const out: ClickIds = {};
  for (const k of CLICK_ID_PARAMS) {
    const v = query.get(k);
    if (v) out[k] = v.slice(0, 512);
  }
  return out;
}
