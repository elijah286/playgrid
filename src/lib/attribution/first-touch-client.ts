import { FIRST_TOUCH_COOKIE, FIRST_TOUCH_MAX_AGE_SECONDS, type FirstTouchPayload } from "./first-touch";

// Client-side mirror of setFirstTouchCookieIfMissing. We write the cookie
// in the browser before the recordPageViewAction server call fires so the
// attribution survives the case where the user clicks an OAuth button
// (window.location redirect) before the server action's Set-Cookie
// response lands. Without this, ~58% of signups arrived with a NULL
// first_landing_path because the in-flight server request was cancelled
// by the navigation.
//
// The server-side setFirstTouchCookieIfMissing remains a backup for
// non-JS edge cases, and is a no-op once the client cookie exists.

export function readFirstTouchCookieClient(): FirstTouchPayload | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${FIRST_TOUCH_COOKIE}=`));
  if (!match) return null;
  const raw = match.slice(FIRST_TOUCH_COOKIE.length + 1);
  try {
    return JSON.parse(decodeURIComponent(raw)) as FirstTouchPayload;
  } catch {
    return null;
  }
}

function isMeaningful(p: Omit<FirstTouchPayload, "ts">): boolean {
  return Object.values(p).some((v) => v !== null && v !== undefined && v !== "");
}

export function setFirstTouchCookieClientIfMissing(
  fields: Omit<FirstTouchPayload, "ts">,
): void {
  if (typeof document === "undefined") return;
  if (readFirstTouchCookieClient()) return;
  if (!isMeaningful(fields)) return;
  const payload: FirstTouchPayload = { ts: new Date().toISOString(), ...fields };
  const value = encodeURIComponent(JSON.stringify(payload));
  const secure = typeof window !== "undefined" && window.location.protocol === "https:";
  document.cookie = `${FIRST_TOUCH_COOKIE}=${value}; path=/; max-age=${FIRST_TOUCH_MAX_AGE_SECONDS}; samesite=lax${secure ? "; secure" : ""}`;
}
