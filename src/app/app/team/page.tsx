import { getSelectedTeamMeta } from "@/features/preview-shell/team-context";
import { listPlaysAction } from "@/app/actions/plays";
import { LoadError } from "@/features/preview-shell/LoadError";
import { NewPlayButton } from "./NewPlayButton";
import { TeamPlaysClient } from "./TeamPlaysClient";

/** Team → Plays (default). The team's play library over real data — search,
 *  sort, group-by, type filter + archived toggle live in TeamPlaysClient; each
 *  card opens the full-screen editor (coach) or the read-only viewer (viewer).
 *  Archived plays are fetched so the client's "Show archived" can reveal them
 *  (RLS still hides archived from viewers). */
export default async function TeamPlaysPage() {
  const team = await getSelectedTeamMeta();
  if (!team) return null;

  const res = await listPlaysAction(team.id, { includeArchived: true });
  if (!res.ok) return <LoadError message={res.error} />;
  const activeCount = res.plays.filter((p) => !p.is_archived).length;
  const canEdit = team.role === "owner" || team.role === "editor";

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wide text-muted">
          {activeCount} {activeCount === 1 ? "play" : "plays"}
        </span>
        {canEdit && (
          <NewPlayButton playbookId={team.id} variant={team.sportVariant} />
        )}
      </div>

      <TeamPlaysClient plays={res.plays} groups={res.groups} canEdit={canEdit} />
    </section>
  );
}
