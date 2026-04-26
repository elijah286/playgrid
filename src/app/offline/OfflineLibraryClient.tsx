"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, BookOpen, Download } from "lucide-react";
import {
  listCachedPlaybooks,
  type CachedPlaybookMeta,
} from "@/lib/offline/db";

export function OfflineLibraryClient() {
  const [items, setItems] = useState<CachedPlaybookMeta[] | null>(null);

  useEffect(() => {
    let alive = true;
    void listCachedPlaybooks()
      .then((rows) => {
        if (alive) setItems(rows);
      })
      .catch(() => {
        if (alive) setItems([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <div className="mb-4 flex items-center gap-2">
        <Link
          href="/home"
          className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          <span>Home</span>
        </Link>
      </div>
      <h1 className="text-2xl font-bold text-foreground">Offline playbooks</h1>
      <p className="mt-1 text-sm text-muted">
        Playbooks you&rsquo;ve downloaded for sideline use without a signal.
      </p>

      {items === null ? (
        <div className="mt-6 h-32 animate-pulse rounded-xl border border-border bg-surface-inset" />
      ) : items.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-border bg-surface-raised p-6 text-center">
          <Download className="mx-auto size-6 text-muted" />
          <p className="mt-2 text-sm font-medium text-foreground">
            No downloaded playbooks yet
          </p>
          <p className="mt-1 text-xs text-muted">
            Open any playbook, tap the menu, and choose &ldquo;Download for
            offline&rdquo; to keep it on this device.
          </p>
        </div>
      ) : (
        <ul className="mt-6 space-y-2">
          {items.map((p) => (
            <li key={p.id}>
              <Link
                href={`/offline/${p.id}`}
                className="flex items-center gap-3 rounded-xl border border-border bg-surface-raised px-4 py-3 transition-colors hover:bg-surface-inset"
              >
                <div
                  className="flex size-10 shrink-0 items-center justify-center rounded-lg text-white"
                  style={{ backgroundColor: p.color }}
                >
                  <BookOpen className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {p.name}
                  </p>
                  <p className="text-xs text-muted">
                    {p.playCount} {p.playCount === 1 ? "play" : "plays"}
                    {" · "}
                    Downloaded {formatDate(p.downloadedAt)}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const sameDay =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
    if (sameDay) {
      return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    }
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "—";
  }
}
