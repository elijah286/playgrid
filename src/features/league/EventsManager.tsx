"use client";

import { useState, useTransition } from "react";

import {
  createLeagueEventAction,
  deleteLeagueEventAction,
  listLeagueEventsAction,
  updateLeagueEventAction,
} from "@/app/actions/league-events";
import { EVENT_KINDS, type EventKind, type LeagueEventRow } from "@/lib/league/events";

type Msg = { kind: "error" | "success"; text: string } | null;

const EMPTY = { title: "", kind: "game" as EventKind, startsAt: "", location: "", notes: "" };

const KIND_LABEL: Record<EventKind, string> = {
  practice: "Practice",
  game: "Game",
  event: "Event",
  other: "Other",
};

function formatWhen(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function EventsManager({
  leagueId,
  initialEvents,
}: {
  leagueId: string;
  initialEvents: LeagueEventRow[];
}) {
  const [events, setEvents] = useState(initialEvents);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setForm(EMPTY);
    setEditingId(null);
  }

  function startEdit(e: LeagueEventRow) {
    setEditingId(e.id);
    setForm({
      title: e.title,
      kind: e.kind,
      startsAt: e.startsAt.slice(0, 16),
      location: e.location ?? "",
      notes: e.notes ?? "",
    });
    setMsg(null);
  }

  function refresh() {
    startTransition(async () => {
      const r = await listLeagueEventsAction(leagueId);
      if (r.ok) setEvents(r.items);
    });
  }

  function submit() {
    if (!form.title.trim() || !form.startsAt) return;
    setMsg(null);
    const input = {
      title: form.title,
      kind: form.kind,
      startsAt: form.startsAt,
      location: form.location || null,
      notes: form.notes || null,
    };
    startTransition(async () => {
      const r = editingId
        ? await updateLeagueEventAction(leagueId, editingId, input)
        : await createLeagueEventAction(leagueId, input);
      if (!r.ok) {
        setMsg({ kind: "error", text: r.error });
        return;
      }
      reset();
      setMsg({ kind: "success", text: "Saved." });
      refresh();
    });
  }

  function remove(e: LeagueEventRow) {
    if (!globalThis.confirm(`Delete "${e.title}"?`)) return;
    setMsg(null);
    startTransition(async () => {
      const r = await deleteLeagueEventAction(leagueId, e.id);
      if (!r.ok) setMsg({ kind: "error", text: r.error });
      else {
        setEvents((prev) => prev.filter((x) => x.id !== e.id));
        if (editingId === e.id) reset();
        setMsg({ kind: "success", text: "Event deleted." });
      }
    });
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium text-foreground">Title</span>
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g. Opening day"
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-foreground">Type</span>
            <select
              value={form.kind}
              onChange={(e) => setForm({ ...form, kind: e.target.value as EventKind })}
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {EVENT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-foreground">When</span>
            <input
              type="datetime-local"
              value={form.startsAt}
              onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-foreground">Location</span>
            <input
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              placeholder="Field, address (optional)"
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </label>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            disabled={pending || !form.title.trim() || !form.startsAt}
            onClick={submit}
            className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50"
          >
            {pending ? "Saving…" : editingId ? "Save changes" : "Add to schedule"}
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

      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="w-full min-w-[36rem] text-left text-sm">
          <thead className="bg-foreground/5 text-xs font-semibold uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">When</th>
              <th className="px-4 py-3">Event</th>
              <th className="px-4 py-3">Location</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {events.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-sm text-muted">
                  Nothing scheduled yet. Add your first event above.
                </td>
              </tr>
            ) : (
              events.map((e) => (
                <tr key={e.id}>
                  <td className="px-4 py-3 text-muted">{formatWhen(e.startsAt)}</td>
                  <td className="px-4 py-3">
                    <span className="font-medium text-foreground">{e.title}</span>
                    <span className="ml-2 rounded-full bg-surface-inset px-2 py-0.5 text-[11px] text-muted">
                      {KIND_LABEL[e.kind]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted">{e.location ?? "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1.5">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => startEdit(e)}
                        className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-foreground/5 disabled:opacity-40"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => remove(e)}
                        className="rounded-lg border border-amber-300 px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-50 disabled:opacity-40 dark:border-amber-800 dark:text-amber-200 dark:hover:bg-amber-950/40"
                      >
                        Delete
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
