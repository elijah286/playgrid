"use server";

import { createClient } from "@/lib/supabase/server";
import { ensureDefaultWorkspace, profileDisplayNameFromUser } from "@/lib/data/workspace";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import type { TeamTheme } from "@/domain/team/theme";
import { parseTeamTheme, teamThemeSchema } from "@/domain/team/theme";

export type TeamRow = {
  id: string;
  name: string;
  theme: TeamTheme;
  created_at: string | null;
};

export async function listTeamsAction() {
  if (!hasSupabaseEnv()) {
    return { ok: false as const, error: "Supabase is not configured.", teams: [] as TeamRow[] };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in.", teams: [] };

  await ensureDefaultWorkspace(supabase, user.id, profileDisplayNameFromUser(user));

  const { data: orgs, error: orgErr } = await supabase
    .from("organizations")
    .select("id")
    .eq("owner_id", user.id)
    .limit(1);
  if (orgErr || !orgs?.[0]) {
    return { ok: false as const, error: orgErr?.message ?? "No organization.", teams: [] };
  }

  const orgId = orgs[0].id as string;
  const { data, error } = await supabase
    .from("teams")
    .select("id, name, theme, created_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: true });

  if (error) return { ok: false as const, error: error.message, teams: [] };

  const teams: TeamRow[] = (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    created_at: row.created_at,
    theme: parseTeamTheme(row.theme),
  }));

  return { ok: true as const, teams };
}

export async function createTeamAction(name: string, theme: TeamTheme) {
  if (!hasSupabaseEnv()) {
    return { ok: false as const, error: "Supabase is not configured." };
  }
  const parsed = teamThemeSchema.safeParse(theme);
  if (!parsed.success) {
    return { ok: false as const, error: "Invalid theme." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  await ensureDefaultWorkspace(supabase, user.id, profileDisplayNameFromUser(user));

  const { data: orgs, error: orgErr } = await supabase
    .from("organizations")
    .select("id")
    .eq("owner_id", user.id)
    .limit(1);
  if (orgErr || !orgs?.[0]) {
    return { ok: false as const, error: orgErr?.message ?? "No organization." };
  }

  const { data: team, error } = await supabase
    .from("teams")
    .insert({
      org_id: orgs[0].id as string,
      name: name.trim() || "New team",
      sport_variant: "flag_7v7",
      theme: parsed.data as unknown as Record<string, unknown>,
    })
    .select("id")
    .single();

  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const, teamId: team.id };
}
