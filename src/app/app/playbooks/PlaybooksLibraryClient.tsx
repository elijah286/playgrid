"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ChevronRight, Loader2, Search } from "lucide-react";
import { setSelectedTeamAction } from "@/app/actions/app-shell";
import type { ShellPlaybook } from "@/features/preview-shell/team-context";

const FALLBACK = "#64748B";

/**
 * The Playbooks library — every playbook the user belongs to, with Archived /
 * Examples toggles + search. This is the exhaustive counterpart to the curated
 * Home shelf: Home shows a finite set + "See all", this shows everything.
 * Opening a book carries the team into the Team hub (same path as Home).
 */
export function PlaybooksLibraryClient({ books }: { books: ShellPlaybook[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [q, setQ] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [showExamples, setShowExamples] = useState(false);

  const hasArchived = useMemo(() => books.some((b) => b.isArchived), [books]);
  const hasExamples = useMemo(() => books.some((b) => b.isExample), [books]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return books.filter((b) => {
      if (b.isArchived && !showArchived) return false;
      if (b.isExample && !showExamples) return false;
      if (s && !b.name.toLowerCase().includes(s)) return false;
      return true;
    });
  }, [books, q, showArchived, showExamples]);

  const openTeam = (id: string) =>
    start(async () => {
      await setSelectedTeamAction(id);
      router.push("/app/team");
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-extrabold tracking-tight text-foreground">Playbooks</h1>
          <span className="text-[11px] font-bold text-muted">{filtered.length}</span>
          {pending && <Loader2 className="size-4 animate-spin text-muted" aria-hidden />}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-[12rem] flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
            aria-hidden
          />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search playbooks…"
            aria-label="Search playbooks"
            className="w-full rounded-lg border border-border bg-surface-raised py-2 pl-9 pr-3 text-sm outline-none focus:border-primary"
          />
        </div>
        {hasArchived && (
          <Toggle checked={showArchived} onChange={setShowArchived} label="Show archived" />
        )}
        {hasExamples && (
          <Toggle checked={showExamples} onChange={setShowExamples} label="Show examples" />
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted">
          {books.length === 0 ? "No playbooks yet." : "No playbooks match your filters."}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {filtered.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => openTeam(b.id)}
              disabled={pending}
              className={`group relative flex items-center gap-3 rounded-xl border border-border bg-surface-raised p-3 text-left shadow-sm transition-colors hover:bg-surface-inset disabled:opacity-60 ${
                b.isArchived ? "opacity-70" : ""
              }`}
            >
              <BookMark book={b} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-foreground">{b.name}</span>
                <span className="block truncate text-[11px] text-muted">
                  {b.season || "Open team"}
                  {b.isArchived && " · Archived"}
                  {b.isExample && " · Example"}
                </span>
              </span>
              <ChevronRight
                className="size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5"
                aria-hidden
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function BookMark({ book }: { book: ShellPlaybook }) {
  const color = book.color || FALLBACK;
  return (
    <span
      className="relative grid size-10 shrink-0 place-items-center overflow-hidden rounded-lg text-sm font-black text-white"
      style={{ backgroundColor: color }}
    >
      {book.logoUrl ? (
        <Image src={book.logoUrl} alt="" fill sizes="40px" className="object-contain p-1" />
      ) : (
        book.name.trim().charAt(0).toUpperCase()
      )}
    </span>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors ${
        checked
          ? "border-primary bg-primary text-white"
          : "border-border bg-surface-raised text-muted hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
}
