"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { featuresByCategory, type FeatureStatus } from "@/lib/site/features-catalog";

const STATUS_LABEL: Record<FeatureStatus, string> = {
  ga: "GA",
  beta: "Beta",
  internal: "Internal",
};

const STATUS_STYLES: Record<FeatureStatus, string> = {
  ga: "bg-emerald-100 text-emerald-800 ring-emerald-300 dark:bg-emerald-950 dark:text-emerald-100 dark:ring-emerald-800",
  beta: "bg-amber-100 text-amber-800 ring-amber-300 dark:bg-amber-950 dark:text-amber-100 dark:ring-amber-800",
  internal: "bg-slate-100 text-slate-700 ring-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-600",
};

function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function FeatureListAdminClient() {
  const grouped = useMemo(() => featuresByCategory(), []);
  const total = useMemo(
    () => grouped.reduce((n, g) => n + g.entries.length, 0),
    [grouped],
  );
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return grouped;
    return grouped
      .map((g) => ({
        category: g.category,
        entries: g.entries.filter(
          (f) =>
            f.name.toLowerCase().includes(q) ||
            f.description.toLowerCase().includes(q) ||
            f.category.toLowerCase().includes(q),
        ),
      }))
      .filter((g) => g.entries.length > 0);
  }, [grouped, query]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-surface-raised p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-foreground">Feature catalog</h2>
            <p className="mt-1 max-w-2xl text-xs text-muted">
              Source-of-truth inventory of shipped capabilities, maintained
              alongside the codebase. Engineering updates this any time a new
              feature ships. Useful for marketing copy, sales conversations,
              changelog reference, and onboarding.
            </p>
            <p className="mt-2 text-[11px] text-muted">
              Edits live in{" "}
              <code className="rounded bg-surface-inset px-1 py-0.5 font-mono">
                src/lib/site/features-catalog.ts
              </code>
              .
            </p>
          </div>
          <div className="text-right text-xs text-muted">
            <div className="text-2xl font-semibold tabular-nums text-foreground">{total}</div>
            <div>features cataloged</div>
          </div>
        </div>
        <div className="mt-3 relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search features…"
            className="w-full rounded-lg bg-surface-inset py-1.5 pl-8 pr-3 text-sm text-foreground placeholder:text-muted ring-1 ring-inset ring-black/5 focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      </div>

      {filtered.length === 0 && (
        <p className="rounded-xl border border-dashed border-border bg-surface p-8 text-center text-sm text-muted">
          No features match &ldquo;{query}&rdquo;.
        </p>
      )}

      {filtered.map((group) => (
        <div key={group.category} className="rounded-xl border border-border bg-surface-raised p-4">
          <div className="flex items-baseline justify-between">
            <h3 className="text-sm font-semibold text-foreground">{group.category}</h3>
            <span className="text-xs text-muted">{group.entries.length}</span>
          </div>
          <ul className="mt-3 space-y-2.5">
            {group.entries.map((f) => (
              <li
                key={f.id}
                className="rounded-lg bg-surface-inset px-3 py-2.5"
              >
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="text-sm font-semibold text-foreground">{f.name}</span>
                  <span
                    className={
                      "inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1 " +
                      STATUS_STYLES[f.status]
                    }
                  >
                    {STATUS_LABEL[f.status]}
                  </span>
                  <span className="text-[11px] text-muted">{formatDate(f.addedDate)}</span>
                </div>
                <p className="mt-1 text-xs text-muted">{f.description}</p>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
