import { getRequestUser } from "@/lib/supabase/request-user";
import { createClient } from "@/lib/supabase/server";
import { getSelectedTeamMeta } from "@/features/preview-shell/team-context";
import { listPlaybookRosterAction } from "@/app/actions/playbook-roster";
import { LoadError } from "@/features/preview-shell/LoadError";
import { RosterClient } from "./RosterClient";

/**
 * Team → Roster. Full in-shell roster management (invite, add/bulk-add, edit,
 * roles, head coach, coach title, remove/ban, approve/deny) — a lens over the
 * same production actions the /playbooks roster tab uses. No new writes.
 */
export default async function TeamRosterPage() {
  const team = await getSelectedTeamMeta();
  if (!team) return null;

  const auth = await getRequestUser();
  const user = auth.kind === "ok" ? auth.user : null;
  if (!user) return null;

  const supabase = await createClient();
  const [rosterRes, profileRes] = await Promise.all([
    listPlaybookRosterAction(team.id),
    supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
  ]);

  if (!rosterRes.ok) return <LoadError message={rosterRes.error} />;
  const members = rosterRes.members;
  const senderName =
    (profileRes.data as { display_name: string | null } | null)?.display_name ??
    user.email ??
    null;
  const canManage = team.role === "owner" || team.role === "editor";

  return (
    <RosterClient
      playbookId={team.id}
      teamName={team.name}
      senderName={senderName}
      canManage={canManage}
      isOwner={team.role === "owner"}
      viewerUserId={user.id}
      members={members}
    />
  );
}
