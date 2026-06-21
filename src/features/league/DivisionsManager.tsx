"use client";

import { useState, useTransition } from "react";
import { Check, Plus } from "lucide-react";

import {
  archiveDivisionAction,
  createDivisionAction,
  listDivisionsAction,
  seedStandardDivisionsAction,
  setDivisionActiveAction,
  setStandardDivisionAction,
  updateDivisionAction,
  type DivisionRow,
} from "@/app/actions/league-divisions";
import {
  AGE_GROUP_LABEL,
  DIVISION_AGE_GROUPS,
  DIVISION_GENDERS,
  GENDER_LABEL,
  type DivisionAgeGroup,
  type DivisionGender,
} from "@/lib/league/divisionCatalog";

type Msg = { kind: "error" | "success"; text: string } | null;

const EMPTY = {
  name: "",
  gender: "coed" as DivisionGender,
  ageGroup: null as string | null,
  min: "",
  max: "",
  roster: "",
};

function windowLabel(d: DivisionRow): string {
  if (!d.minBirthdate && !d.maxBirthdate) return "—";
  return `${d.minBirthdate ?? "…"} → ${d.maxBirthdate ?? "…"}`;
}

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

  async function refresh() {
    const list = await listDivisionsAction(leagueId);
    if (list.ok) setItems(list.items);
  }

  function reset() {
    setForm(EMPTY);
    setEditingId(null);
  }

  function startEdit(d: DivisionRow) {
    setEditingId(d.id);
    setForm({
      name: d.name,
      gender: d.gender,
      ageGroup: d.ageGroup,
      min: d.minBirthdate ?? "",
      max: d.maxBirthdate ?? "",
      roster: d.maxRosterSize != null ? String(d.maxRosterSize) : "",
    });
    setMsg(null);
  }

  function submit() {
    if (!form.name.trim()) return;
    setMsg(null);
    const base = editingId ? items.find((x) => x.id === editingId) ?? null : null;
    const input = {
      name: form.name,
      gender: form.gender,
      // Preserve the standard segment + active state across an edit; those are
      // managed by the grid and the Active toggle, not by this form.
      ageGroup: base ? base.ageGroup : null,
      active: base ? base.active : true,
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
      await refresh();
    });
  }

  function archive(d: DivisionRow) {
    if (!globalThis.confirm(`Archive the ${d.name} division? This removes it from the catalog.`)) return;
    setMsg(null);
    startTransition(async () => {
      const res = await archiveDivisionAction(leagueId, d.id);
      if (!res.ok) setMsg({ kind: "error", text: res.error });
      else {
        if (editingId === d.id) reset();
        setMsg({ kind: "success", text: "Division archived." });
        await refresh();
      }
    });
  }

  function toggleActive(d: DivisionRow) {
    setMsg(null);
    startTransition(async () => {
      const res = await setDivisionActiveAction(leagueId, d.id, !d.active);
      if (!res.ok) setMsg({ kind: "error", text: res.error });
      else await refresh();
    });
  }

  function toggleSegment(age: DivisionAgeGroup, gender: DivisionGender, on: boolean) {
    setMsg(null);
    startTransition(async () => {
      const res = await setStandardDivisionAction(leagueId, age, gender, on);
      if (!res.ok) setMsg({ kind: "error", text: res.error });
      else await refresh();
    });
  }

  function seed() {
    setMsg(null);
    startTransition(async () => {
      const res = await seedStandardDivisionsAction(leagueId);
      if (!res.ok) {
        setMsg({ kind: "error", text: res.error });
        return;
      }
      await refresh();
      setMsg({
        kind: "success",
        text: `Added ${res.inserted} standard division${res.inserted === 1 ? "" : "s"}.`,
      });
    });
  }

  function segmentFor(age: string, gender: DivisionGender): DivisionRow | null {
    return items.find((d) => d.ageGroup === age && d.gender === gender) ?? null;
  }

  return (
    <div className="space-y-6">
      {/* Empty-state recovery: seed the standard set in one click. */}
      {items.length === 0 ? (
        <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
          <div className="text-sm font-semibold text-foreground">Start with the standard divisions</div>
          <p className="mt-1 text-sm text-muted">
            Most leagues run age groups from 6U to Adult. We&apos;ll add the Co-ed set — you can turn
            on Boys/Girls per age and adjust anything below.
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={seed}
            className="mt-3 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50"
          >
            {pending ? "Adding…" : "Add standard divisions"}
          </button>
        </div>
      ) : null}

      {/* Standard divisions grid: Co-ed seeded, Boys/Girls on demand, per-cell active toggle. */}
      <div className="rounded-2xl border p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="text-sm font-semibold text-foreground">Standard divisions</div>
          <div className="text-xs text-muted">Tap a cell to turn a division on or off for this season.</div>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[24rem] text-sm">
            <thead className="text-xs font-semibold uppercase tracking-wide text-muted">
              <tr>
                <th className="px-2 py-2 text-left font-semibold">Age</th>
                {DIVISION_GENDERS.map((g) => (
                  <th key={g} className="px-2 py-2 text-center font-semibold">
                    {GENDER_LABEL[g]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DIVISION_AGE_GROUPS.map((age) => (
                <tr key={age} className="border-t">
                  <td className="px-2 py-2 font-medium text-foreground">{AGE_GROUP_LABEL[age]}</td>
                  {DIVISION_GENDERS.map((gender) => {
                    const cell = segmentFor(age, gender);
                    const on = !!cell && cell.active;
                    return (
                      <td key={gender} className="px-2 py-1.5 text-center">
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => toggleSegment(age, gender, !on)}
                          title={
                            on
                              ? "Active — tap to turn off"
                              : cell
                                ? "Inactive — tap to turn on"
                                : "Tap to add"
                          }
                          aria-pressed={on}
                          className={`inline-flex min-w-[3.25rem] items-center justify-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition disabled:opacity-50 ${
                            on
                              ? "bg-primary text-white hover:bg-primary-hover"
                              : "border border-dashed border-border text-muted hover:bg-foreground/5"
                          }`}
                        >
                          {on ? (
                            <>
                              <Check className="size-3" /> On
                            </>
                          ) : cell ? (
                            "Off"
                          ) : (
                            <>
                              <Plus className="size-3" /> Add
                            </>
                          )}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / edit form (custom divisions + per-division detail). */}
      <div className="rounded-2xl border p-4">
        <div className="text-sm font-semibold text-foreground">
          {editingId ? "Edit division" : "Add a custom division"}
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-5">
          <label className="block text-sm">
            <span className="font-medium text-foreground">Name</span>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. JV, Rec, 10U"
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-foreground">Gender</span>
            <select
              value={form.gender}
              onChange={(e) => setForm({ ...form, gender: e.target.value as DivisionGender })}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {DIVISION_GENDERS.map((g) => (
                <option key={g} value={g}>
                  {GENDER_LABEL[g]}
                </option>
              ))}
            </select>
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
        <div className="mt-3 flex flex-wrap items-center gap-2">
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

      {/* Full catalog: every division (standard + custom), with details. */}
      <div className="overflow-hidden rounded-2xl border">
        <table className="w-full text-left text-sm">
          <thead className="bg-foreground/5 text-xs font-semibold uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Division</th>
              <th className="px-4 py-3">Gender</th>
              <th className="px-4 py-3">Birthdate window</th>
              <th className="px-4 py-3">Max roster</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted">
                  No divisions yet. Add the standard set above or create a custom one.
                </td>
              </tr>
            ) : (
              items.map((d) => (
                <tr key={d.id} className={`align-top ${d.active ? "" : "opacity-60"}`}>
                  <td className="px-4 py-3 font-medium text-foreground">{d.name}</td>
                  <td className="px-4 py-3 text-muted">{GENDER_LABEL[d.gender]}</td>
                  <td className="px-4 py-3 text-muted">{windowLabel(d)}</td>
                  <td className="px-4 py-3 text-muted">{d.maxRosterSize ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        d.active
                          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                          : "bg-foreground/10 text-muted"
                      }`}
                    >
                      {d.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1.5">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => toggleActive(d)}
                        className="rounded-lg border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-foreground/5 disabled:opacity-40"
                      >
                        {d.active ? "Deactivate" : "Activate"}
                      </button>
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
