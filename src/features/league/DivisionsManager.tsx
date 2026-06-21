"use client";

import { useState, useTransition } from "react";

import {
  archiveDivisionAction,
  createDivisionAction,
  listDivisionsAction,
  updateDivisionAction,
  type DivisionRow,
} from "@/app/actions/league-divisions";

type Msg = { kind: "error" | "success"; text: string } | null;

const EMPTY = { name: "", min: "", max: "", roster: "" };

export function DivisionsManager({
  leagueId,
  initialItems,
}: {
  leagueId: string;
  initialItems: DivisionRow[];
}) {
  const [items, setItems] = useState(initialItems);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setForm(EMPTY);
    setEditingId(null);
  }

  function startEdit(d: DivisionRow) {
    setEditingId(d.id);
    setForm({
      name: d.name,
      min: d.minBirthdate ?? "",
      max: d.maxBirthdate ?? "",
      roster: d.maxRosterSize != null ? String(d.maxRosterSize) : "",
    });
    setMsg(null);
  }

  function submit() {
    if (!form.name.trim()) return;
    setMsg(null);
    const input = {
      name: form.name,
      minBirthdate: form.min || null,
      maxBirthdate: form.max || null,
      maxRosterSize: form.roster ? Number(form.roster) : null,
    };
    startTransition(async () => {
      const res = editingId
        ? await updateDivisionAction(leagueId, editingId, input)
        : await createDivisionAction(leagueId, input);
      if (!res.ok) {
        setMsg({ kind: "error", text: res.error });
        return;
      }
      reset();
      setMsg({ kind: "success", text: "Saved." });
      // Re-pull the list to reflect the change.
      const list = await listDivisionsAction(leagueId);
      if (list.ok) setItems(list.items);
    });
  }

  function archive(d: DivisionRow) {
    if (!globalThis.confirm(`Archive the ${d.name} division?`)) return;
    setMsg(null);
    startTransition(async () => {
      const res = await archiveDivisionAction(leagueId, d.id);
      if (!res.ok) setMsg({ kind: "error", text: res.error });
      else {
        setItems((prev) => prev.filter((x) => x.id !== d.id));
        if (editingId === d.id) reset();
        setMsg({ kind: "success", text: "Division archived." });
      }
    });
  }

  return (
    <div className="space-y-5">
      {/* Create / edit form */}
      <div className="rounded-2xl border p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <label className="block text-sm sm:col-span-1">
            <span className="font-medium text-foreground">Name</span>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="10U"
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-foreground">Earliest birthdate</span>
            <input
              type="date"
              value={form.min}
              onChange={(e) => setForm({ ...form, min: e.target.value })}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-foreground">Latest birthdate</span>
            <input
              type="date"
              value={form.max}
              onChange={(e) => setForm({ ...form, max: e.target.value })}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-foreground">Max roster</span>
            <input
              type="number"
              min={0}
              value={form.roster}
              onChange={(e) => setForm({ ...form, roster: e.target.value })}
              placeholder="—"
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
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
            {pending ? "Saving…" : editingId ? "Save changes" : "Add division"}
          </button>
          {editingId ? (
            <button
              type="button"
              onClick={reset}
              className="rounded-lg border px-3 py-2 text-sm font-medium text-foreground hover:bg-foreground/5"
            >
              Cancel
            </button>
          ) : null}
          <span className="text-xs text-muted">
            Birthdate window is optional and used to flag eligibility — it never hard-blocks.
          </span>
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

      {/* List */}
      <div className="overflow-hidden rounded-2xl border">
        <table className="w-full text-left text-sm">
          <thead className="bg-foreground/5 text-xs font-semibold uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Division</th>
              <th className="px-4 py-3">Birthdate window</th>
              <th className="px-4 py-3">Max roster</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-sm text-muted">
                  No divisions yet. Add your age groups above.
                </td>
              </tr>
            ) : (
              items.map((d) => (
                <tr key={d.id} className="align-top">
                  <td className="px-4 py-3 font-medium text-foreground">{d.name}</td>
                  <td className="px-4 py-3 text-muted">
                    {d.minBirthdate || d.maxBirthdate
                      ? `${d.minBirthdate ?? "…"} → ${d.maxBirthdate ?? "…"}`
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-muted">{d.maxRosterSize ?? "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1.5">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => startEdit(d)}
                        className="rounded-lg border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-foreground/5 disabled:opacity-40"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => archive(d)}
                        className="rounded-lg border border-amber-300 px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-50 disabled:opacity-40 dark:border-amber-800 dark:text-amber-200 dark:hover:bg-amber-950/40"
                      >
                        Archive
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
