import { Shield, Users } from "lucide-react";
import Link from "next/link";
import { getSelectedTeamMeta } from "@/features/preview-shell/team-context";
import { listPlaybookRosterAction } from "@/app/actions/playbook-roster";

type Member = {
  id: string;
  name: string | null;
  role: "owner" | "editor" | "viewer";
  jersey: string | null;
  position: string | null;
  isHeadCoach: boolean;
  coachTitle: string | null;
  unclaimed: boolean;
};

export default async function TeamRosterPage() {
  const team = await getSelectedTeamMeta();
  if (!team) return null;

  const res = await listPlaybookRosterAction(team.id);
  const members: Member[] = res.ok
    ? res.members
        .filter((m) => m.status === "active")
        .map((m) => ({
          id: m.id,
          name: m.display_name || m.label,
          role: m.role,
          jersey: m.jersey_number,
          position: m.position,
          isHeadCoach: m.is_head_coach,
          coachTitle: m.coach_title,
          unclaimed: !m.user_id && !m.display_name,
        }))
    : [];
  const coaches = members.filter((m) => m.role === "owner" || m.role === "editor");
  const players = members.filter((m) => m.role === "viewer");
  const canManage = team.role === "owner" || team.role === "editor";

  return (
    <div className="space-y-5">
      {canManage && (
        <div className="flex justify-end">
          <Link
            href={`/playbooks/${team.id}?tab=roster`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-sm font-bold text-foreground transition-colors hover:bg-surface-inset"
          >
            Manage &amp; invite
          </Link>
        </div>
      )}
      <RosterGroup title="Coaches" Icon={Shield} members={coaches} kind="coach" />
      <RosterGroup title="Players" Icon={Users} members={players} kind="player" />
    </div>
  );
}

function RosterGroup({
  title,
  Icon,
  members,
  kind,
}: {
  title: string;
  Icon: React.ElementType;
  members: Member[];
  kind: "coach" | "player";
}) {
  return (
    <section>
      <h2 className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted">
        <Icon className="size-3.5" aria-hidden />
        {title} · {members.length}
      </h2>
      {members.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-4 text-center text-xs text-muted">
          No {kind === "coach" ? "coaches" : "players"} yet.
        </p>
      ) : (
        <ul className="overflow-hidden rounded-xl border border-border bg-surface-raised">
          {members.map((m) => (
            <li key={m.id} className="flex items-center gap-3 border-b border-border px-3 py-2.5 last:border-b-0">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-inset text-xs font-bold text-muted">
                {kind === "player" && m.jersey ? m.jersey : (m.name?.trim().charAt(0).toUpperCase() ?? "?")}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-foreground">
                  {m.name || (m.unclaimed ? "Unclaimed spot" : "Member")}
                </span>
                <span className="block truncate text-xs text-muted">
                  {kind === "coach"
                    ? [m.isHeadCoach ? "Head coach" : null, m.coachTitle].filter(Boolean).join(" · ") || "Coach"
                    : [m.position, m.jersey ? `#${m.jersey}` : null].filter(Boolean).join(" · ") || "Player"}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
