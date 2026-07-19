import { getSelectedTeamMeta } from "@/features/preview-shell/team-context";
import { listFormationsForPlaybookAction } from "@/app/actions/formations";
import { PlaybookFormationsTab } from "@/app/(dashboard)/playbooks/[playbookId]/PlaybookFormationsTab";

/** Team → Formations. Reuses the production formations surface. */
export default async function TeamFormationsPage() {
  const team = await getSelectedTeamMeta();
  if (!team) return null;
  const res = await listFormationsForPlaybookAction(team.id);
  const initial = res.ok ? res.formations : [];
  return (
    <PlaybookFormationsTab
      playbookId={team.id}
      playbookName={team.name}
      variant={team.sportVariant}
      initial={initial}
      isAdmin={false}
    />
  );
}
