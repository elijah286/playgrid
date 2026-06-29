"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  deleteLeagueAction,
  renameLeagueAction,
  setLeagueSlugAction,
  type LeagueSettings,
} from "@/app/actions/league-settings";

type Msg = { kind: "error" | "success"; text: string } | null;

export function LeagueSettingsManager({
  leagueId,
  initial,
  registerBase,
}: {
  leagueId: string;
  initial: LeagueSettings;
  registerBase: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [slug, setSlug] = useState(initial.slug ?? "");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, startTransition] = useTransition();

  function rename() {
    if (!name.trim()) return;
    setMsg(null);
    startTransition(async () => {
      const r = await renameLeagueAction(leagueId, name);
      setMsg(r.ok ? { kind: "success", text: "League renamed." } : { kind: "error", text: r.error });
    });
  }

  function saveSlug() {
    setMsg(null);
    startTransition(async () => {
      const r = await setLeagueSlugAction(leagueId, slug);
      if (!r.ok) {
        setMsg({ kind: "error", text: r.error });
        return;
      }
      setSlug(r.slug ?? "");
      setMsg({ kind: "success", text: "Registration link updated." });
    });
  }

  function destroy() {
    setMsg(null);
    startTransition(async () => {
      const r = await deleteLeagueAction(leagueId, confirm);
      if (!r.ok) {
        setMsg({ kind: "error", text: r.error });
        return;
      }
      router.push("/league");
    });
  }

  const previewSlug = slug.trim() || leagueId;

  return (
    <div className="space-y-6">
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

      <section className="rounded-2xl border border-border p-4">
        <label className="block text-sm">
          <span className="font-medium text-foreground">League name</span>
          <div className="mt-1 flex items-center gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <button
              type="button"
              disabled={pending || !name.trim() || name.trim() === initial.name}
              onClick={rename}
              className="shrink-0 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </label>
      </section>

      <section className="rounded-2xl border border-border p-4">
        <label className="block text-sm">
          <span className="font-medium text-foreground">Registration link</span>
          <p className="mt-0.5 text-xs text-muted">A short, shareable URL for your parent registration page.</p>
          <div className="mt-2 flex items-center gap-2">
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="waco-spring-2027"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <button
              type="button"
              disabled={pending}
              onClick={saveSlug}
              className="shrink-0 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50"
            >
              Save
            </button>
          </div>
          <p className="mt-2 break-all text-xs text-muted">
            {registerBase}
            <span className="text-foreground">{previewSlug}</span>
          </p>
        </label>
      </section>

      <section className="rounded-2xl border border-amber-300 p-4 dark:border-amber-800">
        <div className="text-sm font-semibold text-amber-800 dark:text-amber-300">Delete league</div>
        <p className="mt-1 text-xs text-muted">
          Permanently deletes this league and everything in it — teams, registrations, schedule,
          and standings. This can&apos;t be undone. Type <strong>{initial.name}</strong> to confirm.
        </p>
        <div className="mt-2 flex items-center gap-2">
          <input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={initial.name}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <button
            type="button"
            disabled={pending || confirm.trim() !== initial.name.trim()}
            onClick={destroy}
            className="shrink-0 rounded-lg border border-amber-400 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100"
          >
            Delete
          </button>
        </div>
      </section>
    </div>
  );
}
