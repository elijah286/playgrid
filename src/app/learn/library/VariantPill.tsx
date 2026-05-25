"use client";

import { useState } from "react";

const VARIANTS = [
  { value: "all", label: "All variants" },
  { value: "flag-5v5", label: "5v5 Flag" },
  { value: "flag-6v6", label: "6v6 Flag" },
  { value: "flag-7v7", label: "7v7 Flag" },
  { value: "tackle-8v8", label: "8v8 Tackle" },
  { value: "tackle-11v11", label: "11v11 Tackle" },
] as const;

type VariantValue = (typeof VARIANTS)[number]["value"];

/** Variant filter for the Football Library. Currently visual-only — once
 *  concept pages exist (Phase 1c+) this becomes a real filter via URL
 *  search params so /learn/library?v=flag-5v5 only surfaces 5v5 content. */
export function VariantPill() {
  const [value, setValue] = useState<VariantValue>("all");
  return (
    <div
      role="tablist"
      aria-label="Filter by football variant"
      className="inline-flex gap-0.5 rounded-xl border border-border bg-surface-inset p-1"
    >
      {VARIANTS.map((v) => {
        const active = value === v.value;
        return (
          <button
            key={v.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => setValue(v.value)}
            className={`whitespace-nowrap rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors ${
              active
                ? "bg-surface-raised text-foreground shadow-sm font-semibold"
                : "text-muted hover:text-foreground"
            }`}
          >
            {v.label}
          </button>
        );
      })}
    </div>
  );
}
