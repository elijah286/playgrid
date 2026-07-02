import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { hasLeagueAccess, leagueOpsEnabled, leagueAiEnabled } from "@/lib/league/access";
import { capabilitiesForLeague } from "@/lib/league/authorize";
import { getLeagueNavData } from "@/lib/league/console";
import { LeagueRail } from "@/features/league/LeagueRail";
import { LeagueMobileNav } from "@/features/league/LeagueMobileNav";

// Always evaluate the gate per-request; never statically render the surface.
export const dynamic = "force-dynamic";

/**
 * Guard for the entire /league surface (Wave 0).
 *
 * Invisible-by-default: a non-member — i.e. every current XO Gridmaker user —
 * gets a 404 here, so the surface and its data are unreachable. The global
 * kill switch (LEAGUE_OPS_ENABLED=off) 404s everyone with no deploy.
 */
export default async function LeagueLayout({
  children,
}: {
  children: ReactNode;
}) {
  if (!leagueOpsEnabled()) notFound();
  if (!hasSupabaseEnv()) redirect("/login");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!(await hasLeagueAccess())) notFound();

  const { leagues, orgs, activeOrgId } = await getLeagueNavData();
  // No leagues in the active org → the first-run prompt renders clean, no rail.
  if (leagues.length === 0) return <div className="min-h-full">{children}</div>;

  // Per-league capabilities drive the rail's section filtering: a member (roles
  // present) gets null → the full rail; a delegated member (no roles) gets exactly
  // their granted capabilities → only the sections they can actually use.
  const railLeagues = (
    await Promise.all(
      leagues.map(async (l) => ({
        id: l.id,
        name: l.name,
        sport: l.sport,
        location: l.location,
        capabilities:
          l.roles.length > 0 ? null : await capabilitiesForLeague(user.email ?? null, l.id),
      })),
    )
  ).sort((a, b) => a.name.localeCompare(b.name));
  const leoOn = leagueAiEnabled();

  return (
    <div className="md:flex">
      <LeagueRail leagues={railLeagues} leoEnabled={leoOn} orgs={orgs} activeOrgId={activeOrgId} />
      {/* Clears the fixed league bottom bar on mobile: its own 48px content height
          plus the safe-area inset it pads itself with (LeagueMobileNav.tsx), so this
          can't drift out of sync on notched devices the way a static pb-16 did. */}
      <div className="min-w-0 flex-1 pb-[calc(48px_+_env(safe-area-inset-bottom,0px))] md:pb-0">
        {children}
      </div>
      <LeagueMobileNav leagues={railLeagues} leoEnabled={leoOn} orgs={orgs} activeOrgId={activeOrgId} />
    </div>
  );
}

