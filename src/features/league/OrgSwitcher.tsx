"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Building2, Check, ChevronsUpDown } from "lucide-react";

import { setActiveOrgAction } from "@/app/actions/league-org";

export type SwitcherOrg = { ownerId: string; label: string; isOwn: boolean };

/**
 * Organization switcher — the top of the hierarchy (org → leagues → teams). Only
 * renders when the user belongs to more than one org (their own + a delegated
 * one); for the common single-org operator it's invisible. Switching re-scopes
 * the whole surface (dashboard, rail, KPIs) to the chosen org via a cookie, so
 * two organizations' figures never blend.
 */
export function OrgSwitcher({
  orgs,
  activeOrgId,
}: {
  orgs: SwitcherOrg[];
  activeOrgId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (orgs.length <= 1) return null;
  const active = orgs.find((o) => o.ownerId === activeOrgId) ?? orgs[0];

  const select = (ownerId: string) => {
    setOpen(false);
    if (ownerId === active.ownerId) return;
    startTransition(() => setActiveOrgAction(ownerId));
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={pending}
        className="flex w-full items-center gap-2 rounded-lg border border-border bg-surface-raised px-2.5 py-2 text-left text-sm font-semibold text-foreground hover:bg-foreground/5 disabled:opacity-60"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <Building2 className="size-4 shrink-0 text-muted" />
        <span className="min-w-0 flex-1 truncate">{active.label}</span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted" />
      </button>

      {open ? (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-lg border border-border bg-surface-raised shadow-lg"
        >
          <div className="px-2.5 py-1.5 text-[11px] uppercase tracking-wide text-muted">
            Organization
          </div>
          {orgs.map((o) => {
            const isActive = o.ownerId === active.ownerId;
            return (
              <button
                key={o.ownerId}
                type="button"
                role="option"
                aria-selected={isActive}
                onClick={() => select(o.ownerId)}
                className={`flex w-full items-center gap-2 px-2.5 py-2 text-left text-sm ${
                  isActive ? "bg-primary/10 text-primary" : "text-foreground hover:bg-foreground/5"
                }`}
              >
                <span className="min-w-0 flex-1 truncate">
                  {o.label}
                  {o.isOwn ? <span className="ml-1.5 text-[11px] text-muted">· yours</span> : null}
                </span>
                {isActive ? <Check className="size-4 shrink-0" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
