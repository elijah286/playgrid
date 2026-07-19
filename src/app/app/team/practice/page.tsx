import { getSelectedTeamMeta } from "@/features/preview-shell/team-context";
import { PlaybookPracticePlansTab } from "@/features/practice-plans/PlaybookPracticePlansTab";
import { getCurrentEntitlement } from "@/lib/billing/entitlement";
import { tierAtLeast } from "@/lib/billing/features";

/** Team → Practice Plans. Reuses the production practice-plans surface, gated
 *  on the same entitlement production uses. PlaybookPracticePlansTab defaults
 *  the gate OPEN, so the shell must pass it explicitly to avoid a tier bypass
 *  when the shell later opens beyond admins. */
export default async function TeamPracticePage() {
  const team = await getSelectedTeamMeta();
  if (!team) return null;
  const entitlement = await getCurrentEntitlement();
  return (
    <PlaybookPracticePlansTab
      playbookId={team.id}
      canUseTeamFeatures={tierAtLeast(entitlement, "coach")}
    />
  );
}
