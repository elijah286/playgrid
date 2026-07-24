import { getSelectedTeamMeta } from "@/features/preview-shell/team-context";
import { listPlaysAction } from "@/app/actions/plays";
import { LoadError } from "@/features/preview-shell/LoadError";
import { NewPlayButton } from "./NewPlayButton";
import { TeamPlaysClient } from "./TeamPlaysClient";

/** Team → Plays (default). The team's play library over real data — search +
 *  offense-first grouping + filter live in TeamPlaysClient; each card opens the
 *  existing full-screen editor (coach) or the read-only viewer (viewer). */
export default async function TeamPlaysPage() {
  const team = await getSelectedTeamMeta();
  if (!team) return null;

  const res = await listPlaysAction(team.id);
  if (!res.ok) return <LoadError message={res.error} />;
  const plays = res.plays.filter((p) => !p.is_archived);
  const canEdit = team.role === "owner" || team.role === "editor";

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wide text-muted">
          {plays.length} {plays.length === 1 ? "play" : "plays"}
        </span>
        {canEdit && (
          <NewPlayButton playbookId={team.id} variant={team.sportVariant} />
        )}
      </div>

      <TeamPlaysClient plays={plays} canEdit={canEdit} />
    </section>
  );
}
