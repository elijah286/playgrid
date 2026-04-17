"use server";

import { createClient } from "@/lib/supabase/server";
import { ensureDefaultWorkspace, profileDisplayNameFromUser } from "@/lib/data/workspace";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import type { TeamTheme } from "@/domain/team/theme";
import { parseTeamTheme, teamThemeSchema } from "@/domain/team/theme";
import type { PlaybookRoster } from "@/domain/team/roster";
import { playbookRosterSchema } from "@/domain/team/roster";
import { createTeamAction, type TeamRow } from "@/app/actions/teams";

export type PlaybookListRow = {
  id: string;
  name: string;
  created_at: string | null;
  team_id: string;
  roster: PlaybookRoster;
  team: { id: string; name: string; theme: TeamTheme } | null;
};

export async function listPlaybooksAction() {
  if (!hasSupabaseEnv()) {
    return { ok: false as const, error: "Supabase is not configured.", playbooks: [] as PlaybookListRow[] };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in.", playbooks: [] };

  await ensureDefaultWorkspace(supabase, user.id, profileDisplayNameFromUser(user));

  const { data, error } = await supabase
    .from("playbooks")
    .select(
      `
      id,
      name,
      created_at,
      team_id,
      roster,
      teams ( id, name, theme )
    `,
    )
    .order("updated_at", { ascending: false });

  if (error) return { ok: false as const, error: error.message, playbooks: [] };

  const playbooks: PlaybookListRow[] = (data ?? []).map((row: Record<string, unknown>) => {
    const teamsRaw = row.teams as { id: string; name: string; theme: unknown } | null | undefined;
    const rosterResult = playbookRosterSchema.safeParse(row.roster);
    const roster = rosterResult.success ? rosterResult.data : { staff: [], players: [] };
    return {
      id: row.id as string,
      name: row.name as string,
      created_at: row.created_at as string | null,
      team_id: row.team_id as string,
      roster,
      team: teamsRaw
        ? {
            id: teamsRaw.id,
            name: teamsRaw.name,
            theme: parseTeamTheme(teamsRaw.theme),
          }
        : null,
    };
  });

  return { ok: true as const, playbooks };
}

/** One auth + workspace bootstrap, then lists playbooks and teams (for `/playbooks` index). */
export async function loadPlaybooksDashboardAction() {
  if (!hasSupabaseEnv()) {
    return {
      ok: false as const,
      error: "Supabase is not configured.",
      playbooks: [] as PlaybookListRow[],
      teams: [] as TeamRow[],
    };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false as const,
      error: "Not signed in.",
      playbooks: [] as PlaybookListRow[],
      teams: [] as TeamRow[],
    };
  }

  const { orgId } = await ensureDefaultWorkspace(
    supabase,
    user.id,
    profileDisplayNameFromUser(user),
  );

  const [booksResult, teamsResult] = await Promise.all([
    supabase
      .from("playbooks")
      .select(
        `
      id,
      name,
      created_at,
      team_id,
      roster,
      teams ( id, name, theme )
    `,
      )
      .order("updated_at", { ascending: false }),
    supabase
      .from("teams")
      .select("id, name, theme, created_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: true }),
  ]);

  if (booksResult.error) {
    return {
      ok: false as const,
      error: booksResult.error.message,
      playbooks: [] as PlaybookListRow[],
      teams: [] as TeamRow[],
    };
  }
  if (teamsResult.error) {
    return {
      ok: false as const,
      error: teamsResult.error.message,
      playbooks: [] as PlaybookListRow[],
      teams: [] as TeamRow[],
    };
  }

  const playbooks: PlaybookListRow[] = (booksResult.data ?? []).map((row: Record<string, unknown>) => {
    const teamsRaw = row.teams as { id: string; name: string; theme: unknown } | null | undefined;
    const rosterResult = playbookRosterSchema.safeParse(row.roster);
    const roster = rosterResult.success ? rosterResult.data : { staff: [], players: [] };
    return {
      id: row.id as string,
      name: row.name as string,
      created_at: row.created_at as string | null,
      team_id: row.team_id as string,
      roster,
      team: teamsRaw
        ? {
            id: teamsRaw.id,
            name: teamsRaw.name,
            theme: parseTeamTheme(teamsRaw.theme),
          }
        : null,
    };
  });

  const teams: TeamRow[] = (teamsResult.data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    created_at: row.created_at,
    theme: parseTeamTheme(row.theme),
  }));

  return { ok: true as const, playbooks, teams };
}

export async function createPlaybookAction(name: string) {
  if (!hasSupabaseEnv()) {
    return { ok: false as const, error: "Supabase is not configured." };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const { teamId } = await ensureDefaultWorkspace(
    supabase,
    user.id,
    profileDisplayNameFromUser(user),
  );
  const { data, error } = await supabase
    .from("playbooks")
    .insert({
      team_id: teamId,
      name: name || "New playbook",
      roster: { staff: [], players: [] },
    })
    .select("id")
    .single();

  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const, id: data.id };
}

export type CreatePlaybookWithTeamInput =
  | {
      playbookName: string;
      roster: PlaybookRoster;
      teamChoice: { mode: "existing"; teamId: string };
    }
  | {
      playbookName: string;
      roster: PlaybookRoster;
      teamChoice: { mode: "new"; teamName: string; theme: TeamTheme };
    };

export async function createPlaybookWithTeamAction(input: CreatePlaybookWithTeamInput) {
  if (!hasSupabaseEnv()) {
    return { ok: false as const, error: "Supabase is not configured." };
  }
  const rosterParsed = playbookRosterSchema.safeParse(input.roster);
  if (!rosterParsed.success) {
    return { ok: false as const, error: "Invalid roster." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  await ensureDefaultWorkspace(supabase, user.id, profileDisplayNameFromUser(user));

  let teamId: string;

  if (input.teamChoice.mode === "new") {
    const themeOk = teamThemeSchema.safeParse(input.teamChoice.theme);
    if (!themeOk.success) return { ok: false as const, error: "Invalid team colors." };
    const created = await createTeamAction(input.teamChoice.teamName, themeOk.data);
    if (!created.ok) return { ok: false as const, error: created.error };
    teamId = created.teamId;
  } else {
    teamId = input.teamChoice.teamId;
  }

  const { data, error } = await supabase
    .from("playbooks")
    .insert({
      team_id: teamId,
      name: input.playbookName.trim() || "New playbook",
      roster: rosterParsed.data as unknown as Record<string, unknown>,
    })
    .select("id")
    .single();

  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const, id: data.id };
}
