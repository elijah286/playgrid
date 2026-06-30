import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { getUserWithTimeout } from "@/lib/supabase/get-user-with-timeout";
import { getCurrentEntitlement } from "@/lib/billing/entitlement";
import { canUseAiFeatures } from "@/lib/billing/features";
import {
  getBetaFeatures,
  isBetaFeatureAvailable,
} from "@/lib/site/beta-features-config";
import { HomeBottomNav } from "@/app/(dashboard)/home/HomeBottomNav";

/**
 * Server wrapper that mounts the global mobile bottom nav for any
 * authenticated user, on every route. Rendered once at the root layout so
 * the toolbar is present on resource/marketing surfaces (e.g. `/learn/*`,
 * `/pricing`) the same way it is on `/home` — coaches never land on an
 * in-app page with no way back.
 *
 * `HomeBottomNav` itself bails (returns null) on routes that own their own
 * bottom toolbar — the play & practice editors, the viewer, and full-screen
 * Cal — via `isOwnBottomBarRoute`, so we never stack two bars. Anonymous
 * visitors get nothing here; the header's Resources hamburger + marketing
 * CTAs cover them.
 *
 * This is the single mount point: the `(dashboard)` layout no longer renders
 * its own copy, so there's no double-render on dashboard routes.
 */
export async function GlobalBottomNav() {
  if (!hasSupabaseEnv()) return null;

  const supabase = await createClient();
  // Time-bound the auth check — an offline Capacitor shell must not block
  // the whole tree here. On timeout we treat the request as anonymous and
  // render nothing; the next request retries.
  let user: User | null = null;
  try {
    const result = await getUserWithTimeout(supabase);
    if (result.kind === "ok") user = result.user;
  } catch {
    /* network/config failure → render nothing (anon shell) */
  }
  if (!user) return null;

  const [selfRoleRow, entitlement, betaFeatures] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
    getCurrentEntitlement(),
    getBetaFeatures(),
  ]);

  const isAdmin = (selfRoleRow?.data?.role as string | null) === "admin";
  const coachAiAvailable = isAdmin || canUseAiFeatures(entitlement);
  // Authed users without Team Coach still get the Cal slot — tapping opens
  // the upgrade prompt instead of the chat. Mirrors the prior dashboard
  // layout behavior so Cal stays in the same toolbar position everywhere.
  const showCoachCalPromo = !coachAiAvailable;
  const teamCalendarAvailable = isBetaFeatureAvailable(
    betaFeatures.team_calendar,
    { isAdmin, isEntitled: true },
  );

  return (
    <HomeBottomNav
      showCalendar={teamCalendarAvailable}
      showCoachCal={coachAiAvailable || showCoachCalPromo}
      isAdmin={isAdmin}
    />
  );
}
