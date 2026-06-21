"use client";

import { useState, useTransition } from "react";

import {
  upsertRegistrationConfigAction,
  type RegistrationConfig,
} from "@/app/actions/league-registration-config";

type Msg = { kind: "error" | "success"; text: string } | null;

export function RegistrationSettings({
  leagueId,
  initial,
}: {
  leagueId: string;
  initial: RegistrationConfig;
}) {
  const [isOpen, setIsOpen] = useState(initial.isOpen);
  const [fee, setFee] = useState(initial.feeCents ? (initial.feeCents / 100).toFixed(2) : "");
  const [opensAt, setOpensAt] = useState(initial.opensAt ? initial.opensAt.slice(0, 10) : "");
  const [closesAt, setClosesAt] = useState(initial.closesAt ? initial.closesAt.slice(0, 10) : "");
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setMsg(null);
    startTransition(async () => {
      const feeCents = Math.round((Number.parseFloat(fee || "0") || 0) * 100);
      const r = await upsertRegistrationConfigAction(leagueId, {
        isOpen,
        opensAt: opensAt || null,
        closesAt: closesAt || null,
        feeCents,
      });
      if (!r.ok) setMsg({ kind: "error", text: r.error });
      else setMsg({ kind: "success", text: "Saved." });
    });
  }

  return (
    <div className="rounded-2xl border border-border p-4">
      <label className="flex items-center gap-2.5">
        <input
          type="checkbox"
          checked={isOpen}
          onChange={(e) => setIsOpen(e.target.checked)}
          className="size-4 accent-[color:var(--color-primary,#16a34a)]"
        />
        <span className="text-sm font-medium text-foreground">Registration is open</span>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
            isOpen
              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
              : "bg-surface-inset text-muted"
          }`}
        >
          {isOpen ? "Accepting registrations" : "Closed"}
        </span>
      </label>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="block text-sm">
          <span className="font-medium text-foreground">Registration fee</span>
          <div className="mt-1 flex items-center rounded-lg border border-border bg-surface px-3 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary">
            <span className="text-sm text-muted">$</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={fee}
              onChange={(e) => setFee(e.target.value)}
              placeholder="0.00"
              className="w-full bg-transparent py-2 pl-1 text-sm text-foreground focus:outline-none"
            />
          </div>
        </label>
        <label className="block text-sm">
          <span className="font-medium text-foreground">Opens</span>
          <input
            type="date"
            value={opensAt}
            onChange={(e) => setOpensAt(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-foreground">Closes</span>
          <input
            type="date"
            value={closesAt}
            onChange={(e) => setClosesAt(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </label>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={save}
          className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save settings"}
        </button>
        {msg ? (
          <span
            className={`text-sm ${
              msg.kind === "error" ? "text-amber-700 dark:text-amber-300" : "text-emerald-700 dark:text-emerald-300"
            }`}
          >
            {msg.text}
          </span>
        ) : null}
      </div>
    </div>
  );
}
