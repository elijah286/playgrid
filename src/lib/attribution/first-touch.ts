import { cookies } from "next/headers";
import {
  FIRST_TOUCH_COOKIE,
  FIRST_TOUCH_MAX_AGE_SECONDS,
  type FirstTouchPayload,
} from "./first-touch-shared";

// Re-export so existing server-side imports keep working without changes.
export {
  FIRST_TOUCH_COOKIE,
  FIRST_TOUCH_MAX_AGE_SECONDS,
  type FirstTouchPayload,
};

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
    // httpOnly:false so PageViewTracker can write the cookie client-side
    // before OAuth redirects cancel in-flight server actions. Server still
    // writes as backup; whichever lands first wins. Payload is attribution
    // metadata, not credentials — JS exposure is acceptable.
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
  });
}

export async function clearFirstTouchCookie(): Promise<void> {
  const store = await cookies();
  store.set(FIRST_TOUCH_COOKIE, "", { path: "/", maxAge: 0 });
}
