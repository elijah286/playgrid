import { createClient } from "@/lib/supabase/server";
import { getSelectedTeamMeta } from "@/features/preview-shell/team-context";
import { SettingsClient } from "./SettingsClient";

/** Team → Settings. The "Customize" consolidation — name, season, color, and
 *  roster approval over the real update actions. Deeper bits (logo upload, game
 *  rules, danger zone) link to the full playbook for now. */
export default async function TeamSettingsPage() {
  const team = await getSelectedTeamMeta();
  if (!team) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("playbooks")
    .select("roster_approval_required")
    .eq("id", team.id)
    .maybeSingle();

  return (
    <SettingsClient
      team={{
        id: team.id,
        name: team.name,
        season: team.season,
        color: team.color,
        logoUrl: team.logoUrl,
      }}
      approvalRequired={!!(data as { roster_approval_required?: boolean } | null)?.roster_approval_required}
      canManage={team.role === "owner"}
    />
  );
}
