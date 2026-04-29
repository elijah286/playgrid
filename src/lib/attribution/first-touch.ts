import { cookies } from "next/headers";
import type { ClickIds } from "./click-ids";

// Cookie holding the first-ever attribution payload for this browser.
// Persists across sessions for the industry-default 30-day window so we can
// stamp it onto profiles.first_* when the user eventually signs up.
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

function isMeaningful(p: Omit<FirstTouchPayload, "ts">): boolean {
  return Object.values(p).some((v) => v !== null && v !== undefined && v !== "");
}

export async function readFirstTouchCookie(): Promise<FirstTouchPayload | null> {
  const store = await cookies();
  const raw = store.get(FIRST_TOUCH_COOKIE)?.value;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as FirstTouchPayload;
  } catch {
    return null;
  }
}

export async function setFirstTouchCookieIfMissing(
  fields: Omit<FirstTouchPayload, "ts">,
): Promise<void> {
  if (!isMeaningful(fields)) return;
  const store = await cookies();
  if (store.get(FIRST_TOUCH_COOKIE)) return;
  const payload: FirstTouchPayload = { ts: new Date().toISOString(), ...fields };
  store.set(FIRST_TOUCH_COOKIE, JSON.stringify(payload), {
    path: "/",
    maxAge: FIRST_TOUCH_MAX_AGE_SECONDS,
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
}

export async function clearFirstTouchCookie(): Promise<void> {
  const store = await cookies();
  store.set(FIRST_TOUCH_COOKIE, "", { path: "/", maxAge: 0 });
}
