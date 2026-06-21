"use client";

import { useState, useTransition } from "react";

import {
  updateRegistrationStatusAction,
  type RegistrationListItem,
  type RegistrationStatus,
} from "@/app/actions/league-registrations";

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const STATUS_STYLES: Record<string, string> = {
  submitted: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  approved: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  rostered: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  waitlisted: "bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300",
  rejected: "bg-surface-inset text-muted",
  withdrawn: "bg-surface-inset text-muted",
};

const STATUS_OPTIONS: RegistrationStatus[] = [
  "submitted",
  "approved",
  "waitlisted",
  "rejected",
  "withdrawn",
];

export function RegistrationsReview({
  leagueId,
  initialItems,
}: {
  leagueId: string;
  initialItems: RegistrationListItem[];
}) {
  const [items, setItems] = useState(initialItems);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function setStatus(id: string, status: RegistrationStatus) {
    setError(null);
    setBusyId(id);
    startTransition(async () => {
      const r = await updateRegistrationStatusAction(leagueId, id, status);
      setBusyId(null);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setItems((prev) => prev.map((it) => (it.id === id ? { ...it, status } : it)));
    });
  }

  if (items.length === 0) {
    return (
      <p className="rounded-2xl border border-border px-4 py-8 text-center text-sm text-muted">
        No registrations yet. Share your link above and they&apos;ll show up here.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {error ? (
        <p className="text-sm text-amber-700 dark:text-amber-300">{error}</p>
      ) : null}
      {items.map((it) => {
        const addOns = it.purchases.reduce((s, p) => s + p.priceCents, 0);
        return (
          <div key={it.id} className="rounded-2xl border border-border bg-surface-raised p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground">
                    {it.player.firstName} {it.player.lastName}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${
                      STATUS_STYLES[it.status] ?? "bg-surface-inset text-muted"
                    }`}
                  >
                    {it.status}
                  </span>
                </div>
                <div className="mt-0.5 text-xs text-muted">
                  {it.guardian.name}
                  {it.guardian.email ? ` · ${it.guardian.email}` : ""}
                  {it.guardian.phone ? ` · ${it.guardian.phone}` : ""}
                </div>
                <div className="mt-0.5 text-xs text-muted">
                  Submitted {fmtDate(it.submittedAt)}
                  {it.divisionPreference ? ` · prefers ${it.divisionPreference}` : ""}
                  {it.player.dob ? ` · DOB ${it.player.dob}` : ""}
                </div>
                {it.purchases.length > 0 ? (
                  <div className="mt-1 text-xs text-muted">
                    Add-ons: {it.purchases.map((p) => p.name).join(", ")} ({money(addOns)})
                  </div>
                ) : null}
                {it.notes ? (
                  <div className="mt-1 text-xs italic text-muted">“{it.notes}”</div>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <select
                  value={it.status}
                  disabled={busyId === it.id}
                  onChange={(e) => setStatus(it.id, e.target.value as RegistrationStatus)}
                  className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s} className="capitalize">
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
