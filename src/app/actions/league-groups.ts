"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { getRequestUser } from "@/lib/supabase/request-user";
import { isLeagueOrganizer } from "@/lib/league/access";
import { sendGroupBroadcast } from "@/lib/league/group-broadcast";

export type GroupLeague = { id: string; name: string; sport: string };
export type LeagueGroup = { id: string; name: string; leagues: GroupLeague[] };

// Cross-league audiences (no "team" — that's league-scoped).
export type GroupAudienceKind = "everyone" | "families" | "coaches";

async function gateOperator() {
  if (!hasSupabaseEnv()) return { ok: false as const, error: "Supabase is not configured." };
  const auth = await getRequestUser();
  if (auth.kind !== "ok" || !auth.user) return { ok: false as const, error: "Not signed in." };
  if (!(await isLeagueOrganizer())) {
    return { ok: false as const, error: "You're not a league organizer." };
  }
  const supabase = await createClient();
  return { ok: true as const, supabase, userId: auth.user.id };
}

export async function listLeagueGroupsAction(): Promise<LeagueGroup[]> {
  const gate = await gateOperator();
  if (!gate.ok) return [];

  const { data: groups } = await gate.supabase
    .from("league_groups")
    .select("id, name")
    .order("created_at", { ascending: true });
  const groupRows = groups ?? [];
  if (groupRows.length === 0) return [];

  const { data: members } = await gate.supabase
    .from("league_group_members")
    .select("group_id, league_id, leagues(name, sport)")
    .in(
      "group_id",
      groupRows.map((g) => g.id as string),
    );

  const byGroup = new Map<string, GroupLeague[]>();
  for (const m of members ?? []) {
    const league = (m.leagues ?? null) as { name?: string; sport?: string } | null;
    const list = byGroup.get(m.group_id as string) ?? [];
    list.push({
      id: m.league_id as string,
      name: league?.name ?? "League",
      sport: league?.sport ?? "other",
    });
    byGroup.set(m.group_id as string, list);
  }

  return groupRows.map((g) => ({
    id: g.id as string,
    name: g.name as string,
    leagues: byGroup.get(g.id as string) ?? [],
  }));
}

export async function createLeagueGroupAction(name: string) {
  const gate = await gateOperator();
  if (!gate.ok) return gate;
  const n = name.trim();
  if (!n) return { ok: false as const, error: "Name the group." };
  const { error } = await gate.supabase
    .from("league_groups")
    .insert({ owner_id: gate.userId, name: n });
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/league");
  return { ok: true as const };
}

export async function deleteLeagueGroupAction(groupId: string) {
  const gate = await gateOperator();
  if (!gate.ok) return gate;
  const { error } = await gate.supabase.from("league_groups").delete().eq("id", groupId);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/league");
  return { ok: true as const };
}

export async function addLeagueToGroupAction(groupId: string, leagueId: string) {
  const gate = await gateOperator();
  if (!gate.ok) return gate;
  // RLS enforces: caller owns the group AND administers the league.
  const { error } = await gate.supabase
    .from("league_group_members")
    .insert({ group_id: groupId, league_id: leagueId });
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/league");
  return { ok: true as const };
}

export async function removeLeagueFromGroupAction(groupId: string, leagueId: string) {
  const gate = await gateOperator();
  if (!gate.ok) return gate;
  const { error } = await gate.supabase
    .from("league_group_members")
    .delete()
    .eq("group_id", groupId)
    .eq("league_id", leagueId);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/league");
  return { ok: true as const };
}

/** Send one announcement to EVERY league in a group (deduped union of
 *  recipients), recording it in each league's history. */
export async function sendGroupBroadcastAction(
  groupId: string,
  input: { title: string; body: string; audience: GroupAudienceKind },
) {
  const gate = await gateOperator();
  if (!gate.ok) return gate;
  const t = input.title.trim();
  const b = input.body.trim();
  if (!t) return { ok: false as const, error: "Add a subject." };
  if (!b) return { ok: false as const, error: "Write a message." };

  const { data: group } = await gate.supabase
    .from("league_groups")
    .select("id, name")
    .eq("id", groupId)
    .maybeSingle();
  if (!group) return { ok: false as const, error: "Group not found." };

  const { data: members } = await gate.supabase
    .from("league_group_members")
    .select("league_id")
    .eq("group_id", groupId);
  const leagueIds = (members ?? []).map((m) => m.league_id as string);
  if (leagueIds.length === 0) {
    return { ok: false as const, error: "Add leagues to this group first." };
  }

  const result = await sendGroupBroadcast(gate.supabase, {
    groupName: group.name as string,
    leagueIds,
    audience: { kind: input.audience },
    title: t,
    body: b,
    userId: gate.userId,
  });
  if (!result.ok) return { ok: false as const, error: result.error };

  revalidatePath("/league");
  return { ok: true as const, sent: result.sent, leagues: result.leagues };
}
