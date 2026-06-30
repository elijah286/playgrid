"use server";

import { revalidatePath } from "next/cache";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { isLeagueAdmin } from "@/lib/league/access";
import { gateLeagueCapability } from "@/lib/league/authorize";
import { normalizeLeagueSlug } from "@/lib/league/slug";

export type LeagueSettings = { name: string; slug: string | null; sport: string };

// Settings edits require manage_settings (owners always have it).
function gateAdmin(leagueId: string) {
  return gateLeagueCapability(leagueId, "manage_settings");
}

export async function getLeagueSettingsAction(leagueId: string): Promise<LeagueSettings | null> {
  const gate = await gateAdmin(leagueId);
  if (!gate.ok) return null;
  const { data } = await gate.supabase
    .from("leagues")
    .select("name, slug, sport")
    .eq("id", leagueId)
    .maybeSingle();
  if (!data) return null;
  return {
    name: data.name as string,
    slug: (data.slug as string | null) ?? null,
    sport: (data.sport as string) ?? "other",
  };
}

export async function renameLeagueAction(leagueId: string, name: string) {
  const gate = await gateAdmin(leagueId);
  if (!gate.ok) return gate;
  const n = name.trim().slice(0, 120);
  if (!n) return { ok: false as const, error: "Enter a league name." };
  const { error } = await gate.supabase.from("leagues").update({ name: n }).eq("id", leagueId);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath(`/league/${leagueId}`);
  revalidatePath("/league");
  return { ok: true as const };
}

export async function setLeagueSlugAction(leagueId: string, slug: string) {
  const gate = await gateAdmin(leagueId);
  if (!gate.ok) return gate;
  const norm = normalizeLeagueSlug(slug);
  if (!norm.ok) {
    return {
      ok: false as const,
      error: "Use lowercase letters, numbers, and hyphens (e.g. waco-spring-2027).",
    };
  }
  const { error } = await gate.supabase
    .from("leagues")
    .update({ slug: norm.slug })
    .eq("id", leagueId);
  if (error) {
    // unique violation
    if (/duplicate|unique/i.test(error.message)) {
      return { ok: false as const, error: "That link is already taken — try another." };
    }
    return { ok: false as const, error: error.message };
  }
  revalidatePath(`/league/${leagueId}`);
  return { ok: true as const, slug: norm.slug };
}

/** Destructive: deletes the league and everything under it (cascades). Requires
 *  the operator to type the league name to confirm. */
export async function deleteLeagueAction(leagueId: string, confirmName: string) {
  const gate = await gateAdmin(leagueId);
  if (!gate.ok) return gate;
  // Deleting a league is owner-only — never a delegated capability.
  if (!(await isLeagueAdmin(leagueId))) {
    return { ok: false as const, error: "Only a league owner can delete a league." };
  }
  const { data: league } = await gate.supabase
    .from("leagues")
    .select("name")
    .eq("id", leagueId)
    .maybeSingle();
  if (!league) return { ok: false as const, error: "League not found." };
  if (confirmName.trim() !== (league.name as string).trim()) {
    return { ok: false as const, error: "The name you typed doesn't match." };
  }
  // Delete via service role (gated above by isLeagueAdmin); cascades teams,
  // registrations, games, store items, groups membership, etc.
  const admin = createServiceRoleClient();
  const { error } = await admin.from("leagues").delete().eq("id", leagueId);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/league");
  return { ok: true as const };
}
