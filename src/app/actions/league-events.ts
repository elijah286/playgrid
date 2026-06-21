"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { isLeagueAdmin } from "@/lib/league/access";
import { EVENT_KINDS, type EventKind, type LeagueEventInput, type LeagueEventRow } from "@/lib/league/events";

async function gateAdmin(leagueId: string) {
  if (!hasSupabaseEnv()) return { ok: false as const, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };
  if (!(await isLeagueAdmin(leagueId))) {
    return { ok: false as const, error: "You don't administer this league." };
  }
  return { ok: true as const, supabase };
}

function clean(input: LeagueEventInput) {
  const kind: EventKind = EVENT_KINDS.includes(input.kind) ? input.kind : "event";
  return {
    title: input.title.trim(),
    kind,
    starts_at: input.startsAt,
    location: input.location?.trim() || null,
    notes: input.notes?.trim() || null,
  };
}

export async function listLeagueEventsAction(leagueId: string) {
  if (!hasSupabaseEnv()) return { ok: false as const, error: "Supabase is not configured.", items: [] as LeagueEventRow[] };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("league_events")
    .select("id, kind, title, starts_at, location, notes")
    .eq("league_id", leagueId)
    .order("starts_at", { ascending: true });
  if (error) return { ok: false as const, error: error.message, items: [] as LeagueEventRow[] };
  const items: LeagueEventRow[] = (data ?? []).map((r) => ({
    id: r.id as string,
    kind: r.kind as EventKind,
    title: r.title as string,
    startsAt: r.starts_at as string,
    location: (r.location as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
  }));
  return { ok: true as const, items };
}

export async function createLeagueEventAction(leagueId: string, input: LeagueEventInput) {
  const gate = await gateAdmin(leagueId);
  if (!gate.ok) return gate;
  const fields = clean(input);
  if (!fields.title) return { ok: false as const, error: "Event title is required." };
  if (!fields.starts_at) return { ok: false as const, error: "Pick a date and time." };

  const { error } = await gate.supabase.from("league_events").insert({ league_id: leagueId, ...fields });
  if (error) return { ok: false as const, error: error.message };
  revalidatePath(`/league/${leagueId}/schedule`);
  return { ok: true as const };
}

export async function updateLeagueEventAction(leagueId: string, id: string, input: LeagueEventInput) {
  const gate = await gateAdmin(leagueId);
  if (!gate.ok) return gate;
  const fields = clean(input);
  if (!fields.title) return { ok: false as const, error: "Event title is required." };
  if (!fields.starts_at) return { ok: false as const, error: "Pick a date and time." };

  const { error } = await gate.supabase
    .from("league_events")
    .update(fields)
    .eq("id", id)
    .eq("league_id", leagueId);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath(`/league/${leagueId}/schedule`);
  return { ok: true as const };
}

export async function deleteLeagueEventAction(leagueId: string, id: string) {
  const gate = await gateAdmin(leagueId);
  if (!gate.ok) return gate;
  const { error } = await gate.supabase
    .from("league_events")
    .delete()
    .eq("id", id)
    .eq("league_id", leagueId);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath(`/league/${leagueId}/schedule`);
  return { ok: true as const };
}
