"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Search, WifiOff } from "lucide-react";
import type { PlayDocument } from "@/domain/play/types";
import { Input } from "@/components/ui";
import {
  getCachedPlaybookMeta,
  getCachedPlays,
  getCachedPlayDocument,
  type CachedPlaybookMeta,
  type CachedPlayRow,
} from "@/lib/offline/db";
import { OfflinePlayView } from "./OfflinePlayView";

type Props = { playbookId: string };

export function OfflinePlaybookClient({ playbookId }: Props) {
  const [meta, setMeta] = useState<CachedPlaybookMeta | null>(null);
  const [plays, setPlays] = useState<CachedPlayRow[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeDoc, setActiveDoc] = useState<PlayDocument | null>(null);
  const [q, setQ] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void Promise.all([
      getCachedPlaybookMeta(playbookId),
      getCachedPlays(playbookId),
    ])
      .then(([m, ps]) => {
        if (!alive) return;
        setMeta(m);
        const sorted = [...ps].sort((a, b) => a.name.localeCompare(b.name));
        setPlays(sorted);
        if (sorted.length > 0) setActiveId(sorted[0].id);
      })
      .catch((e) => {
        if (alive) setLoadError(e instanceof Error ? e.message : "Couldn't load.");
      });
    return () => {
      alive = false;
    };
  }, [playbookId]);

  useEffect(() => {
    if (!activeId) {
      setActiveDoc(null);
      return;
    }
    let alive = true;
    void getCachedPlayDocument(activeId).then((d) => {
      if (alive) setActiveDoc((d as PlayDocument | null) ?? null);
    });
    return () => {
      alive = false;
    };
  }, [activeId]);

  const filtered = useMemo(() => {
    if (!plays) return [];
    const s = q.trim().toLowerCase();
    if (!s) return plays;
    return plays.filter(
      (p) =>
        p.name.toLowerCase().includes(s) ||
        (p.wristbandCode && p.wristbandCode.toLowerCase().includes(s)) ||
        (p.shorthand && p.shorthand.toLowerCase().includes(s)),
    );
  }, [plays, q]);

  if (loadError) {
    return (
      <div className="mx-auto max-w-md px-4 py-10 text-center">
        <p className="text-sm text-danger">{loadError}</p>
      </div>
    );
  }

  if (plays === null) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6">
        <div className="h-10 w-1/3 animate-pulse rounded bg-surface-inset" />
        <div className="mt-4 h-64 animate-pulse rounded-xl bg-surface-inset" />
      </div>
    );
  }

  if (!meta) {
    return (
      <div className="mx-auto max-w-md px-4 py-10 text-center">
        <WifiOff className="mx-auto size-8 text-muted" />
        <p className="mt-2 text-sm font-medium text-foreground">
          This playbook isn&rsquo;t downloaded
        </p>
        <p className="mt-1 text-xs text-muted">
          Open it once with a connection and tap &ldquo;Download for offline&rdquo;
          to keep a copy on this device.
        </p>
        <Link
          href="/offline"
          className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
        >
          <ArrowLeft className="size-4" />
          Back to offline library
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/offline"
          className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          <span>Offline</span>
        </Link>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-inset px-2.5 py-1 text-[11px] font-medium text-muted">
          <WifiOff className="size-3" />
          Offline copy
        </span>
      </div>

      <div className="flex items-center gap-3">
        <div
          className="flex size-10 shrink-0 items-center justify-center rounded-lg text-white"
          style={{ backgroundColor: meta.color }}
        >
          <span className="text-sm font-bold">
            {(meta.name[0] ?? "?").toUpperCase()}
          </span>
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-bold text-foreground">{meta.name}</h1>
          <p className="text-xs text-muted">
            {meta.playCount} {meta.playCount === 1 ? "play" : "plays"}
            {meta.season ? ` · ${meta.season}` : ""}
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-[260px_1fr]">
        <div className="flex flex-col gap-2">
          <Input
            leftIcon={Search}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search plays"
          />
          <div className="max-h-[60vh] overflow-y-auto rounded-xl border border-border bg-surface-raised p-1.5">
            <ul className="space-y-0.5">
              {filtered.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => setActiveId(p.id)}
                    className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                      p.id === activeId
                        ? "bg-primary text-white font-medium"
                        : "text-foreground hover:bg-surface-inset"
                    }`}
                  >
                    <span className="truncate">{p.name}</span>
                    {p.wristbandCode && (
                      <span className="shrink-0 text-xs opacity-70">
                        {p.wristbandCode}
                      </span>
                    )}
                  </button>
                </li>
              ))}
              {filtered.length === 0 && (
                <li className="px-3 py-6 text-center text-xs text-muted">
                  No plays match.
                </li>
              )}
            </ul>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface-raised p-3">
          {activeDoc ? (
            <OfflinePlayView document={activeDoc} />
          ) : (
            <div className="flex h-64 items-center justify-center text-sm text-muted">
              Select a play to view it.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
