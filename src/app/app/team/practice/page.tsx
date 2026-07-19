import { getSelectedTeamMeta } from "@/features/preview-shell/team-context";
import { PlaybookPracticePlansTab } from "@/features/practice-plans/PlaybookPracticePlansTab";

/** Team → Practice Plans. Reuses the production practice-plans surface. */
export default async function TeamPracticePage() {
  const team = await getSelectedTeamMeta();
  if (!team) return null;
  return <PlaybookPracticePlansTab playbookId={team.id} />;
}
