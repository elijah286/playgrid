"use client";

import { useState, useTransition } from "react";
import Link from "next/link";

import {
  distributePracticePlanToTeamsAction,
  type CurriculumOverview,
} from "@/app/actions/league-curriculum";

function fmtDuration(min: number): string {
  if (!min) return "—";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

type Msg = { kind: "error" | "success"; text: string } | null;

export function LeagueCurriculumManager({
  leagueId,
  initial,
}: {
  leagueId: string;
  initial: CurriculumOverview;
}) {
  const { plans, teamsTotal, teamsWithPlaybook } = initial;
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, startTransition] = useTransition();

  function distribute(planId: string) {
    setMsg(null);
    startTransition(async () => {
      const r = await distributePracticePlanToTeamsAction(leagueId, planId);
      setConfirmingId(null);
      if (!r.ok) {
        setMsg({ kind: "error", text: r.error });
        return;
      }
      const skipped =
        r.skippedNoPlaybook > 0
          ? ` (${r.skippedNoPlaybook} team${r.skippedNoPlaybook === 1 ? "" : "s"} skipped — no playbook yet)`
          : "";
      setMsg({
        kind: "success",
        text: `Shared "${r.title}" with ${r.distributed} of ${r.teamsTotal} team${
          r.teamsTotal === 1 ? "" : "s"
        }${skipped}.`,
      });
    });
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-surface-raised px-4 py-3 text-sm text-muted">
        {teamsTotal === 0 ? (
          <>No teams yet — create teams first, then share practice plans with their coaches.</>
        ) : (
          <>
            <span className="font-medium text-foreground">{teamsWithPlaybook}</span> of{" "}
            <span className="font-medium text-foreground">{teamsTotal}</span> teams have a playbook
            ready to receive shared plans.
            {teamsWithPlaybook < teamsTotal ? (
              <>
                {" "}
                <Link href={`/league/${leagueId}/playbooks`} className="text-primary hover:underline">
                  Seed the rest
                </Link>
                .
              </>
            ) : null}
          </>
        )}
      </div>

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

      {plans.length === 0 ? (
        <div className="rounded-2xl border border-border px-4 py-8 text-center">
          <p className="text-sm text-foreground">You haven&apos;t built any practice plans yet.</p>
          <p className="mt-1 text-xs text-muted">
            Create one in your playbook — then share it here with every team&apos;s coach in one click.
          </p>
          <Link
            href="/playbooks"
            className="mt-4 inline-block rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-hover"
          >
            Go to my playbooks
          </Link>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {plans.map((p) => (
            <li key={p.id} className="rounded-2xl border border-border bg-surface-raised p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold text-foreground">{p.title}</div>
                  <div className="mt-0.5 text-xs text-muted">
                    {p.playbookName} · {fmtDuration(p.totalDurationMinutes)} ·{" "}
                    {p.blockCount} block{p.blockCount === 1 ? "" : "s"}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {confirmingId === p.id ? (
                    <>
                      <span className="text-xs text-muted">Share with all coaches?</span>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => distribute(p.id)}
                        className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-hover disabled:opacity-50"
                      >
                        {pending ? "Sharing…" : "Confirm"}
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => setConfirmingId(null)}
                        className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-foreground/5 disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled={pending || teamsWithPlaybook === 0}
                      onClick={() => {
                        setMsg(null);
                        setConfirmingId(p.id);
                      }}
                      className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-foreground/5 disabled:opacity-50"
                    >
                      Share with coaches
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
