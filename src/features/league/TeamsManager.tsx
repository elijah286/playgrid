"use client";

import { useState, useTransition } from "react";

import {
  createLeagueTeamAction,
  deleteLeagueTeamAction,
  listLeagueTeamsAction,
  updateLeagueTeamAction,
  type LeagueTeamRow,
} from "@/app/actions/league-teams";

type Division = { id: string; name: string };
type Msg = { kind: "error" | "success"; text: string } | null;

export function TeamsManager({
  leagueId,
  initialTeams,
  divisions,
}: {
  leagueId: string;
  initialTeams: LeagueTeamRow[];
  divisions: Division[];
}) {
  const [teams, setTeams] = useState(initialTeams);
  const [name, setName] = useState("");
  const [divisionId, setDivisionId] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, startTransition] = useTransition();

  const divisionName = (id: string | null) =>
    id ? divisions.find((d) => d.id === id)?.name ?? "—" : "—";

  function reset() {
    setName("");
    setDivisionId("");
    setEditingId(null);
  }

  function startEdit(t: LeagueTeamRow) {
    setEditingId(t.id);
    setName(t.name);
    setDivisionId(t.divisionId ?? "");
    setMsg(null);
  }

  function refresh() {
    startTransition(async () => {
      const r = await listLeagueTeamsAction(leagueId);
      if (r.ok) setTeams(r.items);
    });
  }

  function submit() {
    if (!name.trim()) return;
    setMsg(null);
    startTransition(async () => {
      const r = editingId
        ? await updateLeagueTeamAction(leagueId, editingId, name, divisionId || null)
        : await createLeagueTeamAction(leagueId, name, divisionId || null);
      if (!r.ok) {
        setMsg({ kind: "error", text: r.error });
        return;
      }
      reset();
      setMsg({ kind: "success", text: "Saved." });
      refresh();
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

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium text-foreground">Team name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Cowboys"
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-foreground">Division</span>
            <select
              value={divisionId}
              onChange={(e) => setDivisionId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">Unassigned</option>
              {divisions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            disabled={pending || !name.trim()}
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
          {divisions.length === 0 ? (
            <span className="text-xs text-muted">Tip: add divisions first to group teams by age.</span>
          ) : null}
        </div>
        {msg ? (
          <p
            className={`mt-3 rounded-lg px-3 py-2 text-sm ring-1 ${
              msg.kind === "error"
                ? "bg-amber-50 text-amber-950 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-50 dark:ring-amber-800"
                : "bg-emerald-50 text-emerald-950 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-50 dark:ring-emerald-800"
            }`}
          >
            {msg.text}
          </p>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-2xl border border-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-foreground/5 text-xs font-semibold uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Team</th>
              <th className="px-4 py-3">Division</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {teams.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-sm text-muted">
                  No teams yet. Add your first team above.
                </td>
              </tr>
            ) : (
              teams.map((t) => (
                <tr key={t.id}>
                  <td className="px-4 py-3 font-medium text-foreground">{t.name}</td>
                  <td className="px-4 py-3 text-muted">{divisionName(t.divisionId)}</td>
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
