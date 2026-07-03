"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";

import {
  distributePlaybooksToTeamsAction,
  listPlaybookDistributionAction,
  sendCoachPlaybookCopyAction,
} from "@/app/actions/league-playbooks";
import { SEEDABLE_VARIANTS, type PlaybookDistributionRow } from "@/lib/league/playbooks";
import type { SportVariant } from "@/domain/play/types";

type Msg = { kind: "error" | "success"; text: string } | null;

function shortDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function StatusBadge({ row }: { row: PlaybookDistributionRow }) {
  const cls = "rounded-full px-2 py-0.5 text-[11px] font-medium";
  if (row.sendStatus === "no_playbook") {
    return <span className={`${cls} bg-surface-inset text-muted`}>No playbook yet</span>;
  }
  if (row.sendStatus === "claimed") {
    return (
      <span className={`${cls} bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300`}>
        Claimed
      </span>
    );
  }
  if (row.sendStatus === "sent") {
    return (
      <span className={`${cls} bg-surface-inset text-muted`}>
        Sent{row.lastSentAt ? ` ${shortDate(row.lastSentAt)}` : ""} — not claimed
      </span>
    );
  }
  return <span className={`${cls} bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300`}>Not sent</span>;
}

export function LeaguePlaybooksManager({
  leagueId,
  initialRows,
}: {
  leagueId: string;
  initialRows: PlaybookDistributionRow[];
}) {
  const [rows, setRows] = useState(initialRows);
  const unseededCount = useMemo(() => rows.filter((r) => !r.playbook).length, [rows]);
  const claimedCount = useMemo(() => rows.filter((r) => r.sendStatus === "claimed").length, [rows]);
  const seededCount = rows.length - unseededCount;

  const [variant, setVariant] = useState<SportVariant>("flag_7v7");
  const [scope, setScope] = useState<"unseeded" | "all">(unseededCount > 0 ? "unseeded" : "all");
  const [emailCoaches, setEmailCoaches] = useState(true);
  const [msg, setMsg] = useState<Msg>(null);
  const [batchBusy, setBatchBusy] = useState(false);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function refresh() {
    startTransition(async () => {
      const r = await listPlaybookDistributionAction(leagueId);
      if (r.ok) setRows(r.rows);
    });
  }

  function runBatch() {
    setMsg(null);
    setBatchBusy(true);
    startTransition(async () => {
      const r = await distributePlaybooksToTeamsAction(leagueId, scope, variant, emailCoaches);
      setBatchBusy(false);
      if (!r.ok) {
        setMsg({ kind: "error", text: r.error });
        return;
      }
      const parts = [`Seeded ${r.seeded} of ${r.total} team${r.total === 1 ? "" : "s"}`];
      if (emailCoaches) parts.push(`emailed ${r.emailed}`);
      if (r.skippedNoEmail > 0) {
        parts.push(`${r.skippedNoEmail} skipped (no coach email)`);
      }
      setMsg({
        kind: r.errors.length > 0 ? "error" : "success",
        text: parts.join(", ") + (r.errors.length > 0 ? `. Issues: ${r.errors.join("; ")}` : "."),
      });
      refresh();
    });
  }

  function resend(playbookId: string) {
    setMsg(null);
    setRowBusy(playbookId);
    startTransition(async () => {
      const r = await sendCoachPlaybookCopyAction(leagueId, playbookId);
      setRowBusy(null);
      if (!r.ok) {
        setMsg({ kind: "error", text: r.error });
        return;
      }
      setMsg({ kind: "success", text: `Sent a copy link to ${r.email}.` });
      refresh();
    });
  }

  if (rows.length === 0) {
    return (
      <p className="rounded-2xl border border-border px-4 py-8 text-center text-sm text-muted">
        No teams yet. Create teams on the{" "}
        <Link href={`/league/${leagueId}/teams`} className="text-primary hover:underline">
          Teams
        </Link>{" "}
        page, then distribute a playbook to them here.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5 text-xs">
        <span className="rounded-full border border-border px-2.5 py-1 text-muted">
          {rows.length} team{rows.length === 1 ? "" : "s"}
        </span>
        <span className="rounded-full border border-border px-2.5 py-1 text-muted">
          {seededCount} seeded
        </span>
        <span
          className={`rounded-full px-2.5 py-1 ${claimedCount > 0 ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300" : "border border-border text-muted"}`}
        >
          {claimedCount} claimed
        </span>
      </div>

      <div className="rounded-2xl border border-border bg-surface-raised p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="text-xs font-medium text-muted">Format</span>
            <select
              value={variant}
              onChange={(e) => setVariant(e.target.value as SportVariant)}
              className="mt-1 w-full rounded-lg border border-border bg-surface px-2.5 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {SEEDABLE_VARIANTS.map((v) => (
                <option key={v.value} value={v.value}>
                  {v.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-xs font-medium text-muted">Teams</span>
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value as "unseeded" | "all")}
              className="mt-1 w-full rounded-lg border border-border bg-surface px-2.5 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="unseeded">Without a playbook ({unseededCount})</option>
              <option value="all">All teams ({rows.length})</option>
            </select>
          </label>
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={emailCoaches}
            onChange={(e) => setEmailCoaches(e.target.checked)}
            className="size-4"
          />
          Email each head coach their copy link
        </label>
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            disabled={batchBusy || (scope === "unseeded" && unseededCount === 0)}
            onClick={runBatch}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50"
          >
            {batchBusy
              ? "Working…"
              : scope === "unseeded" && unseededCount === 0
                ? "All teams already have a playbook"
                : `Seed${emailCoaches ? " and email" : ""} ${scope === "all" ? rows.length : unseededCount} team${(scope === "all" ? rows.length : unseededCount) === 1 ? "" : "s"}`}
          </button>
        </div>
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

      <div className="space-y-2">
        {rows.map((row) => (
          <div
            key={row.teamId}
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface-raised p-4"
          >
            <div className="min-w-0">
              <div className="font-semibold text-foreground">{row.teamName}</div>
              <div className="text-xs text-muted">
                {row.headCoachEmail ? row.headCoachEmail : "No head-coach email yet"}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge row={row} />
              {row.playbook ? (
                <>
                  <Link
                    href={`/playbooks/${row.playbook.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-foreground/5"
                  >
                    Open ↗
                  </Link>
                  <button
                    type="button"
                    disabled={rowBusy === row.playbook.id || !row.headCoachEmail}
                    onClick={() => resend(row.playbook!.id)}
                    title={row.headCoachEmail ? "" : "Add a head-coach email on the Teams page"}
                    className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-foreground/5 disabled:opacity-50"
                  >
                    {rowBusy === row.playbook.id
                      ? "Sending…"
                      : row.sendStatus === "not_sent"
                        ? "Send"
                        : "Resend"}
                  </button>
                </>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
