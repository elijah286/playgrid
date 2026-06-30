import { getRequestUser } from "@/lib/supabase/request-user";
import { getCachedUserRole } from "@/lib/auth/profile-cache";
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
  // Shared request-scoped auth check (see request-user.ts) — dedupes the
  // getUser() round-trip with the root layout + SiteHeader. On timeout or no
  // session we render nothing (anon shell); the next request retries.
  const authResult = await getRequestUser();
  const user = authResult.kind === "ok" ? authResult.user : null;
  if (!user) return null;

  // Role + entitlement + beta flags all hit the same request-scoped caches
  // the SiteHeader uses (getCachedUserRole is unstable_cache-backed), so this
  // nav adds no DB round-trips of its own.
  const [role, entitlement, betaFeatures] = await Promise.all([
    getCachedUserRole(user.id),
    getCurrentEntitlement(),
    getBetaFeatures(),
  ]);

  const isAdmin = role === "admin";
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
