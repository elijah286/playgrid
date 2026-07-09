"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";

import {
  distributeLibraryItemsAction,
  distributePlaybooksToTeamsAction,
  listPlaybookDistributionAction,
  sendCoachPlaybookCopyAction,
} from "@/app/actions/league-playbooks";
import { SEEDABLE_VARIANTS, type PlaybookDistributionRow } from "@/lib/league/playbooks";
import type { LibraryItem, LibraryItemPreview } from "@/lib/league/library";
import type { SportVariant } from "@/domain/play/types";
import { PlanTimeline, PlayThumbStrip } from "./LibraryPreview";

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
  libraryItems,
  libraryPreviews = [],
}: {
  leagueId: string;
  initialRows: PlaybookDistributionRow[];
  libraryItems: LibraryItem[];
  libraryPreviews?: LibraryItemPreview[];
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
  const [libItemId, setLibItemId] = useState("");
  const [libTeamId, setLibTeamId] = useState<string>("all");
  const [libBusy, setLibBusy] = useState(false);
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
      setMsg({ kind: "success", text: `Invited ${r.email} to the playbook.` });
      refresh();
    });
  }

  function runLibraryDistribute() {
    if (!libItemId) return;
    setMsg(null);
    setLibBusy(true);
    startTransition(async () => {
      const r = await distributeLibraryItemsAction(
        leagueId,
        [libItemId],
        libTeamId === "all" ? "all" : [libTeamId],
      );
      setLibBusy(false);
      if (!r.ok) {
        setMsg({ kind: "error", text: r.error });
        return;
      }
      setMsg({
        kind: r.errors.length > 0 ? "error" : "success",
        text:
          `Distributed to ${r.distributed} of ${r.teams} team${r.teams === 1 ? "" : "s"}.` +
          (r.errors.length > 0 ? ` Issues: ${r.errors.join("; ")}` : ""),
      });
      refresh();
    });
  }

  function redistributeStale(teamId: string, itemIds: string[]) {
    if (itemIds.length === 0) return;
    setMsg(null);
    setRowBusy(teamId);
    startTransition(async () => {
      const r = await distributeLibraryItemsAction(leagueId, itemIds, [teamId]);
      setRowBusy(null);
      if (!r.ok) {
        setMsg({ kind: "error", text: r.error });
        return;
      }
      setMsg({
        kind: r.errors.length > 0 ? "error" : "success",
        text:
          `Refreshed ${r.distributed} item${r.distributed === 1 ? "" : "s"}.` +
          (r.errors.length > 0 ? ` Issues: ${r.errors.join("; ")}` : ""),
      });
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
          Invite each head coach to their playbook by email
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

      {libraryItems.length > 0 ? (
        <div className="rounded-2xl border border-border bg-surface-raised p-4">
          <div className="text-sm font-semibold text-foreground">Distribute from your library</div>
          <p className="mt-0.5 text-xs text-muted">
            Adds a snapshot of the item to each team&apos;s playbook — a play group lands as a new
            section; re-sending later adds a versioned copy, never touching a coach&apos;s edits.
          </p>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {libraryItems.map((i) => {
              const preview = libraryPreviews.find((p) => p.itemId === i.id);
              const selected = libItemId === i.id;
              return (
                <button
                  key={i.id}
                  type="button"
                  onClick={() => setLibItemId(selected ? "" : i.id)}
                  className={`rounded-xl border p-3 text-left transition-colors ${
                    selected ? "border-primary ring-1 ring-primary" : "border-border hover:border-primary/40"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate font-medium text-foreground">{i.title}</span>
                    <span className="shrink-0 rounded-full bg-surface-inset px-2 py-0.5 text-[10px] text-muted">
                      {i.kind === "play_group" ? "Play group" : "Practice plan"}
                    </span>
                  </div>
                  {preview ? (
                    <div className="mt-2">
                      {preview.plan ? (
                        <PlanTimeline
                          blocks={preview.plan.blocks}
                          totalDurationMinutes={preview.plan.totalDurationMinutes}
                        />
                      ) : (
                        <PlayThumbStrip
                          plays={preview.plays}
                          totalPlays={preview.totalPlays}
                          max={4}
                          size="sm"
                        />
                      )}
                      <div className="mt-1.5 text-[11px] text-muted">
                        {preview.plan
                          ? `${preview.plan.totalDurationMinutes} min · ${preview.plan.blocks.length} blocks`
                          : `${preview.totalPlays} plays`}
                        {preview.teamsReached > 0
                          ? ` · sent to ${preview.teamsReached} team${preview.teamsReached === 1 ? "" : "s"} here`
                          : ""}
                      </div>
                    </div>
                  ) : null}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-end gap-3">
            <select
              value={libTeamId}
              onChange={(e) => setLibTeamId(e.target.value)}
              className="rounded-lg border border-border bg-surface px-2.5 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="all">All teams ({rows.length})</option>
              {rows.map((r) => (
                <option key={r.teamId} value={r.teamId}>
                  {r.teamName}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={libBusy || !libItemId}
              onClick={runLibraryDistribute}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50"
            >
              {libBusy ? "Distributing…" : "Distribute"}
            </button>
          </div>
        </div>
      ) : null}

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
              {row.distributions.length > 0 ? (
                <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px]">
                  <span className="text-muted">Library:</span>
                  {row.distributions.map((d) => (
                    <span
                      key={d.itemId ?? d.title}
                      className={
                        d.updateAvailable
                          ? "rounded-full bg-amber-100 px-2 py-0.5 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300"
                          : "text-muted"
                      }
                    >
                      {d.title}
                      {d.updateAvailable ? " · update" : ""}
                    </span>
                  ))}
                </div>
              ) : null}
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
                  {row.distributions.some((d) => d.updateAvailable) ? (
                    <button
                      type="button"
                      disabled={rowBusy === row.teamId}
                      onClick={() =>
                        redistributeStale(
                          row.teamId,
                          row.distributions
                            .filter((d) => d.updateAvailable && d.itemId)
                            .map((d) => d.itemId as string),
                        )
                      }
                      className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                    >
                      {rowBusy === row.teamId ? "Refreshing…" : "Refresh updates"}
                    </button>
                  ) : null}
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
