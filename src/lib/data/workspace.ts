import type { SupabaseClient, User } from "@supabase/supabase-js";

export function profileDisplayNameFromUser(user: User): string {
  const meta = user.user_metadata?.full_name;
  if (typeof meta === "string" && meta.trim()) return meta.trim();
  const part = user.email?.split("@")[0];
  if (part) return part;
  return "Coach";
}

/** Ensures public.profiles has a row for this user (FK target for organizations.owner_id). */
async function ensureProfileRow(
  supabase: SupabaseClient,
  userId: string,
  displayName: string,
) {
  const { error } = await supabase.from("profiles").upsert(
    { id: userId, display_name: displayName },
    { onConflict: "id" },
  );
  if (error) throw error;
}

type WorkspaceIds = { orgId: string; teamId: string; playbookId: string };

const workspaceInflight = new Map<string, Promise<WorkspaceIds>>();

async function ensureDefaultWorkspaceOnce(
  supabase: SupabaseClient,
  userId: string,
  displayName: string,
): Promise<WorkspaceIds> {
  await ensureProfileRow(supabase, userId, displayName);

  const { data: orgs, error: orgErr } = await supabase
    .from("organizations")
    .select("id")
    .eq("owner_id", userId)
    .limit(1);

  if (orgErr) throw orgErr;

  let orgId = orgs?.[0]?.id as string | undefined;

  if (!orgId) {
    const { data: org, error } = await supabase
      .from("organizations")
      .insert({ owner_id: userId, name: "My organization" })
      .select("id")
      .single();
    if (error) throw error;
    orgId = org.id;
  }

  const { data: teams, error: teamErr } = await supabase
    .from("teams")
    .select("id")
    .eq("org_id", orgId)
    .limit(1);
  if (teamErr) throw teamErr;

  let teamId = teams?.[0]?.id as string | undefined;
  if (!teamId) {
    const { data: team, error } = await supabase
      .from("teams")
      .insert({ org_id: orgId, name: "Varsity", sport_variant: "flag_7v7" })
      .select("id")
      .single();
    if (error) throw error;
    teamId = team.id;
  }

  const { data: books, error: pbErr } = await supabase
    .from("playbooks")
    .select("id")
    .eq("team_id", teamId)
    .limit(1);
  if (pbErr) throw pbErr;

  let playbookId = books?.[0]?.id as string | undefined;
  if (!playbookId) {
    const { data: book, error } = await supabase
      .from("playbooks")
      .insert({
        team_id: teamId,
        name: "Main playbook",
        roster: { staff: [], players: [] },
      })
      .select("id")
      .single();
    if (error) throw error;
    playbookId = book.id;
  }

  if (!orgId || !teamId || !playbookId) {
    throw new Error("ensureDefaultWorkspace: incomplete workspace");
  }
  return { orgId, teamId, playbookId };
}

/** Serializes concurrent bootstraps for the same user (e.g. parallel server actions on /playbooks). */
export async function ensureDefaultWorkspace(
  supabase: SupabaseClient,
  userId: string,
  displayName = "Coach",
): Promise<WorkspaceIds> {
  let p = workspaceInflight.get(userId);
  if (!p) {
    p = ensureDefaultWorkspaceOnce(supabase, userId, displayName).finally(() => {
      workspaceInflight.delete(userId);
    });
    workspaceInflight.set(userId, p);
  }
  return p;
}
