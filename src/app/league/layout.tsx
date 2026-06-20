import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { hasLeagueAccess, leagueOpsEnabled } from "@/lib/league/access";

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

  return <div className="min-h-full">{children}</div>;
}
