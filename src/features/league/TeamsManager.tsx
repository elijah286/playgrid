"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CalendarClock, CheckCircle2, Layers } from "lucide-react";

import {
  createLeagueTeamAction,
  deleteLeagueTeamAction,
  listLeagueTeamsAction,
  updateLeagueTeamAction,
  type LeagueTeamRow,
  type TeamSeedPreview,
} from "@/app/actions/league-teams";
import { sendCoachPlaybookCopyAction } from "@/app/actions/league-playbooks";
import { sportTerms } from "@/lib/league/sportConfig";
import { VARIANT_LABEL } from "@/lib/league/library";
import { PlanTimeline, PlayThumbStrip } from "./LibraryPreview";

type Division = { id: string; name: string };
type Msg = { kind: "error" | "success"; text: string } | null;

/** The post-create confirmation: what the team was actually seeded with. */
type CreatedSummary = {
  teamName: string;
  coachEmail: string | null;
  playbook: { id: string; name: string } | null;
  applied: { id: string; title: string; kind: string }[];
  warnings: string[];
};

const EMPTY = { name: "", divisionId: "", coachName: "", coachEmail: "" };

export function TeamsManager({
  leagueId,
  initialTeams,
  divisions,
  sport,
  seedPreview,
}: {
  leagueId: string;
  initialTeams: LeagueTeamRow[];
  divisions: Division[];
  sport?: string;
  seedPreview?: TeamSeedPreview | null;
}) {
  const terms = sportTerms(sport);
  const [teams, setTeams] = useState(initialTeams);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [created, setCreated] = useState<CreatedSummary | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [pending, startTransition] = useTransition();

  const divisionName = (id: string | null) =>
    id ? divisions.find((d) => d.id === id)?.name ?? "—" : "—";

  function reset() {
    setForm(EMPTY);
    setEditingId(null);
  }

  function startEdit(t: LeagueTeamRow) {
    setEditingId(t.id);
    setForm({
      name: t.name,
      divisionId: t.divisionId ?? "",
      coachName: t.headCoachName ?? "",
      coachEmail: t.headCoachEmail ?? "",
    });
    setMsg(null);
    setCreated(null);
  }

  function refresh() {
    startTransition(async () => {
      const r = await listLeagueTeamsAction(leagueId);
      if (r.ok) setTeams(r.items);
    });
  }

  function submit() {
    if (!form.name.trim()) return;
    setMsg(null);
    setCreated(null);
    const input = {
      name: form.name,
      divisionId: form.divisionId || null,
      headCoachName: form.coachName || null,
      headCoachEmail: form.coachEmail || null,
    };
    startTransition(async () => {
      if (editingId) {
        const r = await updateLeagueTeamAction(leagueId, editingId, input);
        if (!r.ok) {
          setMsg({ kind: "error", text: r.error });
          return;
        }
        reset();
        setMsg({ kind: "success", text: "Saved." });
        refresh();
        return;
      }
      const r = await createLeagueTeamAction(leagueId, input);
      if (!r.ok) {
        setMsg({ kind: "error", text: r.error });
        return;
      }
      const coachEmail = input.headCoachEmail?.trim() || null;
      reset();
      setCreated({
        teamName: r.teamName,
        coachEmail,
        playbook: r.seeded.playbook,
        applied: r.seeded.applied,
        warnings: r.warnings,
      });
      refresh();
    });
  }

  function inviteCoach(playbookId: string) {
    setInviteBusy(true);
    startTransition(async () => {
      const r = await sendCoachPlaybookCopyAction(leagueId, playbookId);
      setInviteBusy(false);
      if (!r.ok) {
        setMsg({ kind: "error", text: r.error });
        return;
      }
      setMsg({ kind: "success", text: `Invited ${r.email} to the team playbook.` });
      setCreated((c) => (c ? { ...c, coachEmail: null } : c));
    });
  }

  function remove(t: LeagueTeamRow) {
    if (!globalThis.confirm(`Remove the ${t.name} team?`)) return;
    setMsg(null);
    startTransition(async () => {
      const r = await deleteLeagueTeamAction(leagueId, t.id);
      if (!r.ok) setMsg({ kind: "error", text: r.error });
      else {
        setTeams((prev) => prev.filter((x) => x.id !== t.id));
        if (editingId === t.id) reset();
        setMsg({ kind: "success", text: "Team removed." });
      }
    });
  }

  const inputCls =
    "mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[24rem_minmax(0,1fr)] xl:items-start">
      {/* left column: create/edit + what a new team starts with */}
      <div className="space-y-4">
        <div className="rounded-2xl border border-border p-4">
          <div className="text-sm font-semibold text-foreground">
            {editingId ? "Edit team" : "Add a team"}
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3">
            <label className="block text-sm">
              <span className="font-medium text-foreground">Team name</span>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Cowboys"
                className={inputCls}
              />
            </label>
            <div className="text-sm">
              <label className="block">
                <span className="font-medium text-foreground">Division</span>
                <select
                  value={form.divisionId}
                  onChange={(e) => setForm({ ...form, divisionId: e.target.value })}
                  className={inputCls}
                >
                  <option value="">Unassigned</option>
                  {divisions.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>
              <Link
                href={`/league/${leagueId}/divisions`}
                className="mt-1.5 inline-block text-xs font-medium text-primary hover:underline"
              >
                Manage divisions →
              </Link>
            </div>
            <label className="block text-sm">
              <span className="font-medium text-foreground">{terms.Coach}</span>
              <input
                value={form.coachName}
                onChange={(e) => setForm({ ...form, coachName: e.target.value })}
                placeholder={`${terms.Coach} name (optional)`}
                className={inputCls}
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-foreground">{terms.Coach} email</span>
              <input
                type="email"
                value={form.coachEmail}
                onChange={(e) => setForm({ ...form, coachEmail: e.target.value })}
                placeholder={`${terms.coach}@example.com (optional)`}
                className={inputCls}
              />
            </label>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              disabled={pending || !form.name.trim()}
              onClick={submit}
              className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50"
            >
              {pending ? "Saving…" : editingId ? "Save changes" : "Add team"}
            </button>
            {editingId ? (
              <button
                type="button"
                onClick={reset}
                className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-foreground/5"
              >
                Cancel
              </button>
            ) : null}
          </div>
          {divisions.length === 0 ? (
            <p className="mt-2 text-xs text-muted">Tip: add divisions first to group teams by age.</p>
          ) : null}
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

        {created ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
            <div className="flex items-center gap-2 text-sm font-semibold text-emerald-900 dark:text-emerald-100">
              <CheckCircle2 className="size-4" />
              {created.teamName} created
            </div>
            {created.playbook ? (
              <div className="mt-2 text-xs text-emerald-950/90 dark:text-emerald-100/90">
                Seeded <span className="font-medium">{created.playbook.name}</span> with the
                starter plays
                {created.applied.length > 0 ? (
                  <>
                    {" "}
                    plus your library defaults:{" "}
                    {created.applied.map((a, i) => (
                      <span key={a.id} className="font-medium">
                        {i > 0 ? ", " : ""}
                        {a.title}
                      </span>
                    ))}
                  </>
                ) : null}
                .
              </div>
            ) : null}
            {created.warnings.length > 0 ? (
              <ul className="mt-2 list-inside list-disc text-xs text-amber-800 dark:text-amber-300">
                {created.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              {created.playbook && created.coachEmail ? (
                <button
                  type="button"
                  disabled={inviteBusy}
                  onClick={() => inviteCoach(created.playbook!.id)}
                  className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-hover disabled:opacity-50"
                >
                  {inviteBusy ? "Inviting…" : `Invite ${created.coachEmail} to the playbook`}
                </button>
              ) : null}
              <Link
                href={`/league/${leagueId}/roster`}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-foreground/5"
              >
                Assign players →
              </Link>
              {created.playbook ? (
                <Link
                  href={`/playbooks/${created.playbook.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-foreground/5"
                >
                  Open playbook ↗
                </Link>
              ) : null}
            </div>
          </div>
        ) : null}

        {seedPreview?.enabled && !editingId ? (
          <div className="rounded-2xl border border-border bg-surface-raised p-4">
            <div className="text-sm font-semibold text-foreground">Every new team starts with</div>
            <div className="mt-2 space-y-3">
              <div className="flex items-center gap-2 text-xs text-foreground">
                <Layers className="size-3.5 text-muted" />
                {seedPreview.starterAvailable ? (
                  <>
                    Starter playbook ·{" "}
                    {VARIANT_LABEL[seedPreview.variant] ?? seedPreview.variant}
                  </>
                ) : (
                  <span className="text-amber-700 dark:text-amber-300">
                    No starter template for{" "}
                    {VARIANT_LABEL[seedPreview.variant] ?? seedPreview.variant} yet
                  </span>
                )}
              </div>
              {seedPreview.defaults.map((d) => {
                const preview = seedPreview.previews.find((p) => p.itemId === d.id);
                return (
                  <div key={d.id} className="rounded-xl border border-border p-2.5">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                      {d.kind === "practice_plan" ? (
                        <CalendarClock className="size-3 text-muted" />
                      ) : (
                        <Layers className="size-3 text-muted" />
                      )}
                      {d.title}
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
                      </div>
                    ) : null}
                  </div>
                );
              })}
              <p className="text-[11px] text-muted">
                {seedPreview.defaults.length === 0
                  ? "Add defaults in your library to seed every new team with your own content."
                  : "Change what seeds new teams in your library."}{" "}
                <Link href="/league/library" className="font-medium text-primary hover:underline">
                  Open library →
                </Link>
              </p>
            </div>
          </div>
        ) : null}
      </div>

      {/* right column: the teams */}
      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="w-full min-w-[36rem] text-left text-sm">
          <thead className="bg-foreground/5 text-xs font-semibold uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Team</th>
              <th className="px-4 py-3">Division</th>
              <th className="px-4 py-3">{terms.Coach}</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {teams.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-sm text-muted">
                  No teams yet. Add your first team to seed its playbook automatically.
                </td>
              </tr>
            ) : (
              teams.map((t) => (
                <tr key={t.id}>
                  <td className="px-4 py-3 font-medium text-foreground">{t.name}</td>
                  <td className="px-4 py-3 text-muted">{divisionName(t.divisionId)}</td>
                  <td className="px-4 py-3">
                    {t.headCoachName ? (
                      <span className="text-foreground">{t.headCoachName}</span>
                    ) : (
                      <span className="text-amber-600 dark:text-amber-400">Needs a {terms.coach}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1.5">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => startEdit(t)}
                        className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-foreground/5 disabled:opacity-40"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => remove(t)}
                        className="rounded-lg border border-amber-300 px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-50 disabled:opacity-40 dark:border-amber-800 dark:text-amber-200 dark:hover:bg-amber-950/40"
                      >
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
