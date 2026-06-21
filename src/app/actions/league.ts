"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { isLeagueOrganizer } from "@/lib/league/access";

/**
 * Organizer self-service: create a league. Authorization is enforced twice —
 * here (nice error) and in the create_league SECURITY DEFINER RPC (hard gate).
 */
export async function createLeagueAction(name: string) {
  if (!hasSupabaseEnv()) {
    return { ok: false as const, error: "Supabase is not configured." };
  }
  if (!(await isLeagueOrganizer())) {
    return { ok: false as const, error: "You are not a league organizer." };
  }
  const trimmed = name.trim();
  if (!trimmed) return { ok: false as const, error: "Enter a league name." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_league", { p_name: trimmed });
  if (error) return { ok: false as const, error: error.message };

  revalidatePath("/league");
  return { ok: true as const, leagueId: data as string };
}
