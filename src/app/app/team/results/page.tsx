import { getSelectedTeamMeta } from "@/features/preview-shell/team-context";
import { GameResultsPanel } from "@/features/game-results/GameResultsPanel";
import { getCurrentEntitlement } from "@/lib/billing/entitlement";
import { tierAtLeast } from "@/lib/billing/features";

/** Team → Results. Reuses the production game-results surface. */
export default async function TeamResultsPage() {
  const team = await getSelectedTeamMeta();
  if (!team) return null;
  const entitlement = await getCurrentEntitlement();
  return (
    <GameResultsPanel
      playbookId={team.id}
      canUseGameMode={tierAtLeast(entitlement, "coach")}
    />
  );
}
