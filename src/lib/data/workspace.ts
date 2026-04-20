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
      .insert({ team_id: teamId, name: "Inbox", is_default: true })
      .select("id")
      .single();
    if (error) throw error;
    playbookId = book.id;
    await supabase
      .from("playbook_members")
      .insert({ playbook_id: playbookId, user_id: userId, role: "owner" });
  }

  if (!orgId || !teamId || !playbookId) {
    throw new Error("Failed to bootstrap workspace.");
  }
  return { orgId, teamId, playbookId };
}

/**
 * Returns the team's default ("Inbox") playbook id, creating one if the team
 * somehow has no default yet. Used for quick-create flows where the user
 * hasn't chosen a playbook.
 */
export async function getOrCreateInboxPlaybook(
  supabase: SupabaseClient,
  teamId: string,
): Promise<string> {
  const { data: existing, error: selErr } = await supabase
    .from("playbooks")
    .select("id")
    .eq("team_id", teamId)
    .eq("is_default", true)
    .limit(1);
  if (selErr) throw selErr;
  if (existing?.[0]?.id) return existing[0].id as string;

  const { data: created, error: insErr } = await supabase
    .from("playbooks")
    .insert({ team_id: teamId, name: "Inbox", is_default: true })
    .select("id")
    .single();
  if (insErr) throw insErr;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    await supabase
      .from("playbook_members")
      .insert({ playbook_id: created.id, user_id: user.id, role: "owner" });
  }
  return created.id as string;
}
