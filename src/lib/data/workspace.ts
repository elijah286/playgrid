import type { SupabaseClient } from "@supabase/supabase-js";

export async function ensureDefaultWorkspace(supabase: SupabaseClient, userId: string) {
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
      .insert({ team_id: teamId, name: "Main playbook" })
      .select("id")
      .single();
    if (error) throw error;
    playbookId = book.id;
  }

  return { orgId, teamId, playbookId };
}
