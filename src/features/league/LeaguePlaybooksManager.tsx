"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import {
  listLeaguePlaybooksAction,
  seedTeamPlaybookAction,
  sendCoachPlaybookCopyAction,
} from "@/app/actions/league-playbooks";
import { SEEDABLE_VARIANTS, type LeaguePlaybookTeam } from "@/lib/league/playbooks";
import type { SportVariant } from "@/domain/play/types";

type Msg = { kind: "error" | "success"; text: string } | null;

export function LeaguePlaybooksManager({
  leagueId,
  initialTeams,
}: {
  leagueId: string;
  initialTeams: LeaguePlaybookTeam[];
}) {
  const [teams, setTeams] = useState(initialTeams);
  const [variants, setVariants] = useState<Record<string, SportVariant>>({});
  const [msg, setMsg] = useState<Msg>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function refresh() {
    startTransition(async () => {
      const r = await listLeaguePlaybooksAction(leagueId);
      if (r.ok) setTeams(r.teams);
    });
  }

  function seed(teamId: string) {
    const variant = variants[teamId] ?? "flag_7v7";
    setMsg(null);
    setBusyId(teamId);
    startTransition(async () => {
      const r = await seedTeamPlaybookAction(leagueId, teamId, variant);
      setBusyId(null);
      if (!r.ok) {
        setMsg({ kind: "error", text: r.error });
        return;
      }
      setMsg({ kind: "success", text: "Playbook seeded with starter plays." });
      refresh();
    });
  }

  function sendToCoach(playbookId: string) {
    setMsg(null);
    setBusyId(playbookId);
    startTransition(async () => {
      const r = await sendCoachPlaybookCopyAction(leagueId, playbookId);
      setBusyId(null);
      if (!r.ok) {
        setMsg({ kind: "error", text: r.error });
        return;
      }
      setMsg({ kind: "success", text: `Sent a copy link to ${r.email}.` });
    });
  }

  if (teams.length === 0) {
    return (
      <p className="rounded-2xl border border-border px-4 py-8 text-center text-sm text-muted">
        No teams yet. Create teams on the{" "}
        <Link href={`/league/${leagueId}/teams`} className="text-primary hover:underline">
          Teams
        </Link>{" "}
        page, then seed each one a playbook here.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {msg ? (
        <p
          className={`rounded-lg px-3 py-2 text-sm ring-1 ${
            msg.kind === "error"
              ? "bg-amber-50 text-amber-950 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-50 dark:ring-amber-800"
              : "bg-emerald-50 text-emerald-950 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-50 dark:ring-emerald-800"
          }`}
        >
          {msg.text}
        </p>
      ) : null}

      {teams.map((t) => (
        <div key={t.teamId} className="rounded-2xl border border-border bg-surface-raised p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="font-semibold text-foreground">{t.teamName}</div>
              <div className="text-xs text-muted">
                {t.headCoachEmail ? `Coach: ${t.headCoachEmail}` : "No head-coach email yet"}
              </div>
            </div>
            {t.playbooks.length === 0 ? (
              <div className="flex items-center gap-2">
                <select
                  value={variants[t.teamId] ?? "flag_7v7"}
                  onChange={(e) =>
                    setVariants((v) => ({ ...v, [t.teamId]: e.target.value as SportVariant }))
                  }
                  className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {SEEDABLE_VARIANTS.map((v) => (
                    <option key={v.value} value={v.value}>
                      {v.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={busyId === t.teamId}
                  onClick={() => seed(t.teamId)}
                  className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50"
                >
                  {busyId === t.teamId ? "Seeding…" : "Seed playbook"}
                </button>
              </div>
            ) : null}
          </div>

          {t.playbooks.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {t.playbooks.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface px-3 py-2"
                >
                  <span className="text-sm font-medium text-foreground">📘 {p.name}</span>
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/playbooks/${p.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-foreground/5"
                    >
                      Open ↗
                    </Link>
                    <button
                      type="button"
                      disabled={busyId === p.id || !t.headCoachEmail}
                      onClick={() => sendToCoach(p.id)}
                      title={t.headCoachEmail ? "" : "Add a head-coach email on the Teams page"}
                      className="rounded-lg bg-primary px-2.5 py-1 text-xs font-medium text-white hover:bg-primary-hover disabled:opacity-50"
                    >
                      {busyId === p.id ? "Sending…" : "Email coach a copy"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ))}
    </div>
  );
}
