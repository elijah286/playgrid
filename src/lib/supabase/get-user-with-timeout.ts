import type { SupabaseClient, User } from "@supabase/supabase-js";

/**
 * Maximum time we'll wait for `supabase.auth.getUser()` before giving up
 * and treating the caller as unauthenticated for this request.
 *
 * Why: middleware and the root layout both await getUser() on every
 * navigation. When a tab resumes after hours of idle, the cached access
 * token has expired and getUser() triggers a refresh-token round-trip to
 * Supabase. On flaky mobile networks that round-trip occasionally hangs
 * for tens of seconds — long enough that the browser shows a stuck
 * progress bar and the user kills the tab. A short timeout lets the page
 * render in a degraded (anonymous) state instead of stalling forever;
 * the next request from the now-loaded page retries the refresh and
 * recovers normally.
 *
 * 3s is comfortably above normal cold-refresh latency (~150ms) but well
 * under any human "this page is broken" threshold.
 */
export const AUTH_USER_TIMEOUT_MS = 3000;

export type GetUserResult =
  | { kind: "ok"; user: User | null }
  | { kind: "timeout" };

/**
 * Race `supabase.auth.getUser()` against a timeout. On timeout the caller
 * should treat the request as unauthenticated and fall through — never
 * block navigation on a hung auth refresh.
 */
export async function getUserWithTimeout(
  supabase: SupabaseClient,
  timeoutMs: number = AUTH_USER_TIMEOUT_MS,
): Promise<GetUserResult> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race<GetUserResult>([
      supabase.auth.getUser().then(({ data }) => ({
        kind: "ok" as const,
        user: data.user,
      })),
      new Promise<GetUserResult>((resolve) => {
        timer = setTimeout(() => resolve({ kind: "timeout" }), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
