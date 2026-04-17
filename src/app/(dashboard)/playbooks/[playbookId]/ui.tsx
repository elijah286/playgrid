"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
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
  const [creating, setCreating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
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

  async function addPlay() {
    setActionError(null);
    setCreating(true);
    try {
      const res = await createPlayAction(playbookId);
      if (res.ok) {
        router.push(`/plays/${res.playId}/edit`);
        return;
      }
      setActionError(res.error);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Could not create play.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[200px] flex-1">
          <label className="text-xs font-medium uppercase tracking-wide text-pg-subtle">
            Search plays
          </label>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Code, name, concept"
            className="mt-1 w-full rounded-xl border border-pg-line bg-pg-chalk px-3 py-2 text-sm shadow-sm dark:bg-pg-chalk/10"
          />
        </div>
        <button
          type="button"
          disabled={creating}
          onClick={() => void addPlay()}
          className="rounded-xl bg-pg-turf px-4 py-2 text-sm font-medium text-white hover:bg-pg-turf-deep disabled:opacity-60"
        >
          {creating ? "Creating…" : "New play"}
        </button>
      </div>
      {actionError ? (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {actionError}
        </p>
      ) : null}

      <ul className="divide-y divide-pg-line/80 rounded-2xl bg-pg-chalk/95 ring-1 ring-pg-line/80 dark:bg-pg-turf-deep/25">
        {filtered.length === 0 && (
          <li className="px-4 py-6 text-sm text-pg-subtle">No plays match.</li>
        )}
        {filtered.map((p) => (
          <li key={p.id}>
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 hover:bg-pg-mist/60 dark:hover:bg-pg-surface/40">
              <div>
                <p className="font-medium text-pg-ink">{p.name}</p>
                <p className="text-xs text-pg-subtle">
                  {p.wristband_code} · {p.concept || "—"}
                </p>
              </div>
              <div className="flex gap-2">
                <Link
                  href={`/plays/${p.id}/edit`}
                  className="rounded-lg bg-pg-turf px-3 py-1.5 text-xs font-medium text-white"
                >
                  Edit
                </Link>
                <Link
                  href={`/m/play/${p.id}?playbookId=${playbookId}`}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-pg-signal ring-1 ring-pg-signal-ring hover:bg-pg-signal-soft"
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
