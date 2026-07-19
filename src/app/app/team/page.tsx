import Link from "next/link";
import { ListChecks, Plus } from "lucide-react";
import { getSelectedTeamMeta } from "@/features/preview-shell/team-context";
import { listPlaysAction } from "@/app/actions/plays";

/** Team → Plays (default). The team's play library over real data; each card
 *  opens the existing full-screen play editor. */
export default async function TeamPlaysPage() {
  const team = await getSelectedTeamMeta();
  if (!team) return null;

  const res = await listPlaysAction(team.id);
  const plays = res.plays.filter((p) => !p.is_archived);
  const canEdit = team.role === "owner" || team.role === "editor";

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wide text-muted">
          {plays.length} {plays.length === 1 ? "play" : "plays"}
        </span>
        {canEdit && (
          <Link
            href={`/playbooks/${team.id}`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-bold text-white transition-colors hover:bg-primary-hover"
          >
            <Plus className="size-4" aria-hidden />
            New play
          </Link>
        )}
      </div>

      {plays.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted">
          No plays yet.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {plays.map((p) => (
            <Link
              key={p.id}
              href={`/plays/${p.id}/edit`}
              className="overflow-hidden rounded-xl border border-border bg-surface-raised transition-colors hover:bg-surface-inset"
            >
              <div className="grid h-20 place-items-center bg-field/90">
                <ListChecks className="size-6 text-white/70" aria-hidden />
              </div>
              <div className="p-2.5">
                <div className="truncate text-xs font-bold text-foreground">{p.name}</div>
                {p.formation_name && (
                  <div className="truncate text-[11px] text-muted">{p.formation_name}</div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
