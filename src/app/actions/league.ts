"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { isLeagueOrganizer } from "@/lib/league/access";
import { seedStandardDivisions } from "@/lib/league/divisions";
import { isLeagueSport } from "@/lib/league/sportConfig";

/**
 * Organizer self-service: create a league. Authorization is enforced twice —
 * here (nice error) and in the create_league SECURITY DEFINER RPC (hard gate).
 */
export async function createLeagueAction(name: string, sport: string = "football") {
  if (!hasSupabaseEnv()) {
    return { ok: false as const, error: "Supabase is not configured." };
  }
  if (!(await isLeagueOrganizer())) {
    return { ok: false as const, error: "You are not a league organizer." };
  }
  const trimmed = name.trim();
  if (!trimmed) return { ok: false as const, error: "Enter a league name." };
  const p_sport = isLeagueSport(sport) ? sport : "football";

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_league", { p_name: trimmed, p_sport });
  if (error) return { ok: false as const, error: error.message };

  const leagueId = data as string;
  // Pre-populate the standard Co-ed divisions so a new league lands with its age
  // groups ready to toggle. Best-effort: if it fails, the divisions page exposes
  // an "Add standard divisions" recovery CTA, so we don't fail league creation.
  await seedStandardDivisions(leagueId);

  revalidatePath("/league");
  return { ok: true as const, leagueId };
}
