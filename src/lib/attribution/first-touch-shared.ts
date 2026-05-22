import type { ClickIds } from "./click-ids";

// Shared constants + types for the first-touch cookie. Kept separate from
// first-touch.ts because that file imports next/headers (server-only) and
// Turbopack refuses to pull a next/headers-importing module into a client
// bundle — even when the client only needs the constants. The client-side
// cookie writer (first-touch-client.ts) imports from this file instead.

export const FIRST_TOUCH_COOKIE = "pg_first_touch";
export const FIRST_TOUCH_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export type FirstTouchPayload = {
  ts: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  referrer: string | null;
  landing_path: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
} & ClickIds;
