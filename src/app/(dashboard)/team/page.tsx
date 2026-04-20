import { listTeamRostersAction } from "@/app/actions/team-roster";
import { DashboardTabs } from "@/components/layout/DashboardTabs";
import { Users } from "lucide-react";
import { Badge, Card, CardBody, CardHeader, EmptyState } from "@/components/ui";

export const metadata = { title: "Team — PlayGrid" };

const ROLE_TONE: Record<string, "primary" | "default" | "warning"> = {
  coach: "primary",
  owner: "primary",
  editor: "primary",
  player: "default",
  viewer: "default",
  guest: "warning",
};

export default async function TeamPage() {
  const result = await listTeamRostersAction();

  return (
    <div className="space-y-6">
      <DashboardTabs active="team" />
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Team</h1>
        <p className="mt-1 text-sm text-muted">
          Coaches, players, and guests with access to your playbooks. Invites and member
          management are coming soon — this is a read-only view of who currently has access.
        </p>
      </div>

      {!result.ok && (
        <p className="rounded-lg bg-danger-light px-3 py-2 text-sm text-danger">{result.error}</p>
      )}

      {result.ok && result.teams.length === 0 && (
        <EmptyState
          icon={Users}
          heading="No teams yet"
          description="Create a playbook to get started — your first team is set up automatically."
        />
      )}

      {result.ok &&
        result.teams.map((team) => (
          <Card key={team.teamId}>
            <CardHeader>
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-base font-semibold text-foreground">{team.teamName}</h2>
                <span className="text-xs text-muted">
                  {team.members.length} {team.members.length === 1 ? "member" : "members"}
                </span>
              </div>
            </CardHeader>
            <CardBody>
              {team.members.length === 0 ? (
                <p className="text-sm text-muted">
                  Nobody has access to any of this team&apos;s playbooks yet.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {team.members.map((m) => {
                    const name =
                      m.label ??
                      m.displayName ??
                      (m.userId ? `${m.userId.slice(0, 8)}…` : "Unnamed");
                    const meta: string[] = [];
                    if (m.jerseyNumber) meta.push(`#${m.jerseyNumber}`);
                    if (m.position) meta.push(m.position);
                    return (
                      <li key={m.key} className="flex items-center justify-between gap-3 py-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium text-foreground">
                              {name}
                            </span>
                            <Badge variant={ROLE_TONE[m.role] ?? "neutral"}>{m.role}</Badge>
                            {m.isMinor && <Badge variant="warning">minor</Badge>}
                            {m.source === "inferred_from_playbook" && (
                              <Badge variant="default">via playbook</Badge>
                            )}
                          </div>
                          {meta.length > 0 && (
                            <p className="mt-0.5 text-xs text-muted">{meta.join(" · ")}</p>
                          )}
                          {m.playbooks.length > 0 && (
                            <p className="mt-0.5 text-xs text-muted">
                              Access:{" "}
                              {m.playbooks
                                .map((p) => `${p.name} (${p.role})`)
                                .join(", ")}
                            </p>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardBody>
          </Card>
        ))}
    </div>
  );
}
