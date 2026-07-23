import { createClient } from "@/lib/supabase/server";
import { getSelectedTeamMeta } from "@/features/preview-shell/team-context";
import { getPlaybookSettingsAction } from "@/app/actions/playbooks";
import { SettingsClient } from "./SettingsClient";

/** Team → Settings. Name, season, color, roster approval, logo, and game rules
 *  over the real update actions. Only the danger zone (archive/delete/leave)
 *  still links to the full playbook. */
export default async function TeamSettingsPage() {
  const team = await getSelectedTeamMeta();
  if (!team) return null;

  const supabase = await createClient();
  const [approvalRes, settingsRes] = await Promise.all([
    supabase
      .from("playbooks")
      .select("roster_approval_required, plays_shared_with_players")
      .eq("id", team.id)
      .maybeSingle(),
    getPlaybookSettingsAction(team.id),
  ]);

  const bookRow = approvalRes.data as
    | { roster_approval_required?: boolean; plays_shared_with_players?: boolean }
    | null;

  return (
    <SettingsClient
      team={{
        id: team.id,
        name: team.name,
        season: team.season,
        color: team.color,
        logoUrl: team.logoUrl,
        sportVariant: team.sportVariant,
      }}
      approvalRequired={!!bookRow?.roster_approval_required}
      playsShared={bookRow?.plays_shared_with_players !== false}
      settings={settingsRes.ok ? settingsRes.settings : null}
      canManage={team.role === "owner"}
    />
  );
}
