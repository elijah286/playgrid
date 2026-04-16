"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createPlayAction } from "@/app/actions/plays";

type PlayRow = {
  id: string;
  name: string;
  wristband_code: string | null;
  shorthand: string | null;
  concept: string | null;
  updated_at: string | null;
};

export function PlaybookDetailClient({
  playbookId,
  initialPlays,
}: {
  playbookId: string;
  initialPlays: PlayRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState("");

  const filtered = initialPlays.filter((p) => {
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return (
      p.name.toLowerCase().includes(s) ||
      (p.wristband_code && p.wristband_code.toLowerCase().includes(s)) ||
      (p.shorthand && p.shorthand.toLowerCase().includes(s)) ||
      (p.concept && p.concept.toLowerCase().includes(s))
    );
  });

  function addPlay() {
    startTransition(async () => {
      const res = await createPlayAction(playbookId);
      if (res.ok) {
        router.push(`/plays/${res.playId}/edit`);
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[200px] flex-1">
          <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Search plays
          </label>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Code, name, concept"
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm"
          />
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={addPlay}
          className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
        >
          New play
        </button>
      </div>

      <ul className="divide-y divide-slate-200/80 rounded-2xl bg-white ring-1 ring-slate-200/80">
        {filtered.length === 0 && (
          <li className="px-4 py-6 text-sm text-slate-500">No plays match.</li>
        )}
        {filtered.map((p) => (
          <li key={p.id}>
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4">
              <div>
                <p className="font-medium text-slate-900">{p.name}</p>
                <p className="text-xs text-slate-500">
                  {p.wristband_code} · {p.concept || "—"}
                </p>
              </div>
              <div className="flex gap-2">
                <Link
                  href={`/plays/${p.id}/edit`}
                  className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white"
                >
                  Edit
                </Link>
                <Link
                  href={`/m/play/${p.id}?playbookId=${playbookId}`}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-indigo-700 ring-1 ring-indigo-200 hover:bg-indigo-50"
                >
                  Mobile
                </Link>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
