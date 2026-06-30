import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import {
  getUserWithTimeout,
  type GetUserResult,
} from "@/lib/supabase/get-user-with-timeout";

/**
 * Resolve the current request's authenticated user, time-bounded.
 *
 * This is the testable implementation behind {@link getRequestUser}. Prefer
 * importing `getRequestUser` everywhere in the render tree; this raw form
 * exists so unit tests can exercise the contract without React's
 * request-scoped `cache()` memoizing results across cases.
 *
 * Failure handling mirrors the inline call sites it replaced: a missing-env
 * or thrown client treats the caller as anonymous (`{ kind: "ok", user: null
 * }`); a hung refresh surfaces as `{ kind: "timeout" }` so callers fall
 * through without blocking navigation. Never throws.
 */
export async function loadRequestUser(): Promise<GetUserResult> {
  if (!hasSupabaseEnv()) return { kind: "ok", user: null };
  try {
    const supabase = await createClient();
    return await getUserWithTimeout(supabase);
  } catch {
    return { kind: "ok", user: null };
  }
}

/**
 * Request-scoped, deduplicated auth check shared by the root layout and the
 * chrome it renders (SiteHeader, GlobalBottomNav).
 *
 * Before this, each of those three independently called `createClient()` +
 * `getUser()`, so a single authenticated navigation fired THREE
 * refresh-token round-trips to Supabase — each carrying the 3s timeout from
 * get-user-with-timeout — before the first byte could ship. React `cache()`
 * memoizes the result for the lifetime of one server render pass, collapsing
 * those three into one.
 *
 * Middleware (src/lib/supabase/middleware.ts) runs in a SEPARATE invocation
 * from the render — it gates the request and may redirect to /login before
 * rendering begins — so it keeps its own getUser() and can't share this
 * render-scoped cache. Deduping that fourth call would mean handing the
 * validated identity from middleware to the render via a request header: a
 * deliberately separate, higher-risk change left out of this pass.
 */
export const getRequestUser = cache(loadRequestUser);
