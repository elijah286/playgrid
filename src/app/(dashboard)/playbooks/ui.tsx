"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  createPlaybookWithTeamAction,
  type PlaybookListRow,
} from "@/app/actions/playbooks";
import type { TeamRow } from "@/app/actions/teams";
import { TEAM_THEME_PRESETS, type TeamTheme } from "@/domain/team/theme";
import { rosterFromLines } from "@/domain/team/roster";

type Props = {
  initial: PlaybookListRow[];
  teams: TeamRow[];
};

export function PlaybooksClient({ initial, teams }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [playbookName, setPlaybookName] = useState("");
  const [teamMode, setTeamMode] = useState<"existing" | "new">("existing");
  const [teamId, setTeamId] = useState(teams[0]?.id ?? "");
  const [newTeamName, setNewTeamName] = useState("");
  const [presetId, setPresetId] = useState(TEAM_THEME_PRESETS[0]!.id);
  const [staffText, setStaffText] = useState("");
  const [playersText, setPlayersText] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const selectedPreset = useMemo(
    () => TEAM_THEME_PRESETS.find((p) => p.id === presetId) ?? TEAM_THEME_PRESETS[0]!,
    [presetId],
  );

  const newTeamTheme: TeamTheme = selectedPreset.theme;

  function create() {
    setFormError(null);
    const name = playbookName.trim() || "New playbook";
    const roster = rosterFromLines(staffText, playersText);

    startTransition(async () => {
      const res =
        teamMode === "existing"
          ? await createPlaybookWithTeamAction({
              playbookName: name,
              roster,
              teamChoice: { mode: "existing", teamId },
            })
          : await createPlaybookWithTeamAction({
              playbookName: name,
              roster,
              teamChoice: {
                mode: "new",
                teamName: newTeamName.trim() || "New team",
                theme: newTeamTheme,
              },
            });

      if (!res.ok) {
        setFormError(res.error);
        return;
      }
      router.push(`/playbooks/${res.id}`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-8">
      <section className="rounded-2xl bg-pg-chalk/90 p-5 ring-1 ring-pg-line/80 dark:bg-pg-turf-deep/30">
        <h2 className="text-sm font-semibold text-pg-ink">Create playbook</h2>
        <p className="mt-1 text-xs text-pg-muted">
          Tie each playbook to a team palette and sideline roster. Switch teams when you coach
          multiple squads.
        </p>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="block text-sm">
            <span className="text-pg-muted">Playbook name</span>
            <input
              value={playbookName}
              onChange={(e) => setPlaybookName(e.target.value)}
              placeholder="e.g. Spring 7v7 — Red zone"
              className="mt-1 w-full rounded-xl border border-pg-line bg-pg-chalk px-3 py-2 text-sm shadow-sm dark:bg-pg-chalk/10"
            />
          </label>

          <div className="text-sm">
            <span className="text-pg-muted">Team</span>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setTeamMode("existing")}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                  teamMode === "existing"
                    ? "bg-pg-turf text-white"
                    : "ring-1 ring-pg-line hover:bg-pg-mist dark:hover:bg-pg-surface"
                }`}
              >
                Use existing team
              </button>
              <button
                type="button"
                onClick={() => setTeamMode("new")}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                  teamMode === "new"
                    ? "bg-pg-turf text-white"
                    : "ring-1 ring-pg-line hover:bg-pg-mist dark:hover:bg-pg-surface"
                }`}
              >
                Create new team
              </button>
            </div>
          </div>
        </div>

        {teamMode === "existing" ? (
          <label className="mt-4 block text-sm">
            <span className="text-pg-muted">Team</span>
            <select
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
              className="mt-1 w-full max-w-md rounded-xl border border-pg-line bg-pg-chalk px-3 py-2 text-sm dark:bg-pg-chalk/10"
            >
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <div className="mt-4 space-y-3">
            <label className="block text-sm">
              <span className="text-pg-muted">New team name</span>
              <input
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
                placeholder="e.g. JV Gold"
                className="mt-1 w-full max-w-md rounded-xl border border-pg-line bg-pg-chalk px-3 py-2 text-sm dark:bg-pg-chalk/10"
              />
            </label>
            <div>
              <p className="text-xs font-medium text-pg-subtle">Color palette</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {TEAM_THEME_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPresetId(p.id)}
                    className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium ring-1 ${
                      presetId === p.id
                        ? "ring-pg-turf ring-offset-2 ring-offset-pg-mist"
                        : "ring-pg-line hover:bg-pg-mist dark:hover:bg-pg-surface"
                    }`}
                  >
                    <span
                      className="h-6 w-6 rounded-md ring-1 ring-black/10"
                      style={{
                        background: `linear-gradient(135deg, ${p.theme.primary}, ${p.theme.accent})`,
                      }}
                      aria-hidden
                    />
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="block text-sm">
            <span className="text-pg-muted">Staff (one per line or comma-separated)</span>
            <textarea
              value={staffText}
              onChange={(e) => setStaffText(e.target.value)}
              rows={4}
              className="mt-1 w-full rounded-xl border border-pg-line bg-pg-chalk px-3 py-2 text-sm dark:bg-pg-chalk/10"
              placeholder={"Head coach\nOC\nTeam parent"}
            />
          </label>
          <label className="block text-sm">
            <span className="text-pg-muted">Players (one per line or comma-separated)</span>
            <textarea
              value={playersText}
              onChange={(e) => setPlayersText(e.target.value)}
              rows={4}
              className="mt-1 w-full rounded-xl border border-pg-line bg-pg-chalk px-3 py-2 text-sm dark:bg-pg-chalk/10"
              placeholder={"QB1\nSlot\nX receiver"}
            />
          </label>
        </div>

        {formError && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">
            {formError}
          </p>
        )}

        <button
          type="button"
          disabled={pending || (teamMode === "existing" && !teamId)}
          onClick={create}
          className="mt-4 rounded-xl bg-pg-turf px-4 py-2.5 text-sm font-medium text-white hover:bg-pg-turf-deep disabled:opacity-60"
        >
          {pending ? "Creating…" : "Create playbook"}
        </button>
      </section>

      <div>
        <h2 className="text-sm font-semibold text-pg-ink">Your playbooks</h2>
        <ul className="mt-3 divide-y divide-pg-line/80 rounded-2xl bg-pg-chalk/90 ring-1 ring-pg-line/80 dark:bg-pg-turf-deep/25">
          {initial.length === 0 && (
            <li className="px-4 py-6 text-sm text-pg-subtle">No playbooks yet.</li>
          )}
          {initial.map((p) => (
            <li key={p.id}>
              <Link
                href={`/playbooks/${p.id}`}
                className="flex items-center justify-between gap-3 px-4 py-4 hover:bg-pg-mist/80 dark:hover:bg-pg-surface/50"
              >
                <div className="flex min-w-0 items-center gap-3">
                  {p.team && (
                    <span
                      className="h-9 w-2 shrink-0 rounded-full ring-1 ring-black/10"
                      style={{
                        background: `linear-gradient(180deg, ${p.team.theme.primary}, ${p.team.theme.accent})`,
                      }}
                      title={p.team.name}
                      aria-hidden
                    />
                  )}
                  <div className="min-w-0">
                    <span className="block truncate font-medium text-pg-ink">{p.name}</span>
                    {p.team && (
                      <span className="text-xs text-pg-subtle">{p.team.name}</span>
                    )}
                  </div>
                </div>
                <span className="shrink-0 text-xs text-pg-faint">Open</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
