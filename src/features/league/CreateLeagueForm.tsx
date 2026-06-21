"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { createLeagueAction } from "@/app/actions/league";

export function CreateLeagueForm({
  autoFocus,
  cta = "Create league",
}: {
  autoFocus?: boolean;
  cta?: string;
}) {
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function submit() {
    if (!name.trim()) return;
    setErr(null);
    startTransition(async () => {
      const res = await createLeagueAction(name);
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      router.push(`/league/${res.leagueId}`);
    });
  }

  return (
    <div>
      <label htmlFor="league-name" className="block text-sm font-medium text-foreground">
        League name
      </label>
      <input
        id="league-name"
        type="text"
        autoFocus={autoFocus}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
        placeholder="e.g. Waco Youth Football"
        className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
      />
      <button
        type="button"
        disabled={pending || !name.trim()}
        onClick={submit}
        className="mt-3 w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-hover disabled:opacity-50"
      >
        {pending ? "Creating…" : cta}
      </button>
      {err ? (
        <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">{err}</p>
      ) : null}
    </div>
  );
}
