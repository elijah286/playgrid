import Link from "next/link";
import { ListChecks } from "lucide-react";
import { getSelectedTeamMeta } from "@/features/preview-shell/team-context";
import { listPlaysAction } from "@/app/actions/plays";
import { PlayThumbnail } from "@/features/editor/PlayThumbnail";
import { LoadError } from "@/features/preview-shell/LoadError";
import { NewPlayButton } from "./NewPlayButton";

/** Team → Plays (default). The team's play library over real data; each card
 *  opens the existing full-screen play editor. */
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

      {plays.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted">
          No plays yet.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {plays.map((p) => (
            <Link
              key={p.id}
              href={`/plays/${p.id}/edit`}
              className="group block rounded-xl p-1.5 transition-colors hover:bg-surface-inset"
            >
              {p.preview ? (
                // The real diagram — same canonical thumbnail the production
                // playbook grid renders (pure SVG, no extra query: the preview
                // ships with listPlaysAction). `thin` for the smaller card.
                <PlayThumbnail preview={p.preview} thin />
              ) : (
                <div className="grid aspect-[16/10] w-full place-items-center rounded-lg border border-border bg-field/90">
                  <ListChecks className="size-6 text-white/70" aria-hidden />
                </div>
              )}
              <div className="px-1 pt-1.5">
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
