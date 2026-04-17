"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { PlayDocument } from "@/domain/play/types";
import { pathGeometryToSvgD } from "@/domain/play/geometry";

type PlayRow = {
  id: string;
  name: string;
  wristband_code: string | null;
  shorthand: string | null;
};

type Props = {
  plays: PlayRow[];
  currentId: string;
  document: PlayDocument;
  playbookId: string;
};

export function PlayCarousel({ plays, currentId, document, playbookId }: Props) {
  const router = useRouter();
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return plays;
    return plays.filter(
      (p) =>
        p.name.toLowerCase().includes(s) ||
        (p.wristband_code && p.wristband_code.toLowerCase().includes(s)) ||
        (p.shorthand && p.shorthand.toLowerCase().includes(s)),
    );
  }, [plays, q]);

  const idx = plays.findIndex((p) => p.id === currentId);
  const prev = idx > 0 ? plays[idx - 1] : null;
  const next = idx >= 0 && idx < plays.length - 1 ? plays[idx + 1] : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search code or name"
          className="flex-1 rounded-xl border border-pg-line bg-white px-3 py-2 text-base shadow-sm"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto rounded-2xl bg-white p-3 ring-1 ring-pg-line/80">
        <ul className="space-y-1">
          {filtered.map((p) => (
            <li key={p.id}>
              <Link
                href={`/m/play/${p.id}?playbookId=${playbookId}`}
                className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm ${
                  p.id === currentId ? "bg-pg-turf text-white" : "hover:bg-pg-mist"
                }`}
              >
                <span className="font-medium">{p.name}</span>
                <span className="opacity-80">{p.wristband_code}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <button
          type="button"
          disabled={!prev}
          onClick={() => prev && router.push(`/m/play/${prev.id}?playbookId=${playbookId}`)}
          className="rounded-xl bg-pg-surface px-4 py-3 text-sm font-medium text-pg-ink ring-1 ring-pg-line disabled:opacity-40"
        >
          Previous
        </button>
        <div className="aspect-[4/3] w-full max-w-[280px] justify-self-center rounded-2xl bg-pg-field ring-1 ring-pg-line/80">
          <svg viewBox="0 0 1 1" className="h-full w-full">
            <rect width={1} height={1} fill="#ecfdf5" />
            {document.layers.routes.map((r) => (
              <path
                key={r.id}
                d={pathGeometryToSvgD(r.geometry)}
                fill="none"
                stroke={r.style.stroke}
                strokeWidth={0.004}
              />
            ))}
            {document.layers.players.map((pl) => (
              <circle
                key={pl.id}
                cx={pl.position.x}
                cy={1 - pl.position.y}
                r={0.03}
                fill={pl.style.fill}
                stroke={pl.style.stroke}
                strokeWidth={0.003}
              />
            ))}
          </svg>
        </div>
        <button
          type="button"
          disabled={!next}
          onClick={() => next && router.push(`/m/play/${next.id}?playbookId=${playbookId}`)}
          className="rounded-xl bg-pg-surface px-4 py-3 text-sm font-medium text-pg-ink ring-1 ring-pg-line disabled:opacity-40"
        >
          Next
        </button>
      </div>

      <Link
        href={`/plays/${currentId}/edit`}
        className="block rounded-xl bg-pg-turf py-3 text-center text-sm font-medium text-white"
      >
        Edit on desktop
      </Link>
    </div>
  );
}
