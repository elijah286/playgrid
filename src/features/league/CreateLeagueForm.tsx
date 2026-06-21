"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { createLeagueAction } from "@/app/actions/league";

export function CreateLeagueForm() {
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
      <div className="flex flex-wrap items-end gap-2">
        <label className="block text-sm">
          <span className="font-medium text-foreground">Create a league</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
            placeholder="e.g. Waco Youth Football"
            className="mt-1 w-72 max-w-full rounded-lg border px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </label>
        <button
          type="button"
          disabled={pending || !name.trim()}
          onClick={submit}
          className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50"
        >
          {pending ? "Creating…" : "Create league"}
        </button>
      </div>
      {err ? (
        <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">{err}</p>
      ) : null}
    </div>
  );
}
