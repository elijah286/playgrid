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
    // Contained at the production playbook width — this reuses the production
    // Formations component, which is designed for that measure.
    <div className="mx-auto max-w-6xl">
      <PlaybookFormationsTab
        playbookId={team.id}
        playbookName={team.name}
        variant={team.sportVariant}
        initial={initial}
        isAdmin={false}
      />
    </div>
  );
}
