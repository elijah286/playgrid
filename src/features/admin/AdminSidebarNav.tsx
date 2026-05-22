"use client";

import { useEffect } from "react";
import type { LucideIcon } from "lucide-react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export type AdminNavItem<T extends string> = {
  value: T;
  label: string;
  icon: LucideIcon;
  badge?: number;
};

export type AdminNavGroup<T extends string> = {
  label: string;
  items: AdminNavItem<T>[];
};

type Props<T extends string> = {
  groups: AdminNavGroup<T>[];
  value: T;
  onChange: (value: T) => void;
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
};

export function AdminSidebarNav<T extends string>({
  groups,
  value,
  onChange,
  mobileOpen,
  onMobileOpenChange,
}: Props<T>) {
  useEffect(() => {
    if (!mobileOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onMobileOpenChange(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileOpen, onMobileOpenChange]);

  // Lock body scroll while the mobile drawer is open so the page
  // underneath doesn't double-scroll when the user swipes the menu.
  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  function selectAndClose(next: T) {
    onChange(next);
    onMobileOpenChange(false);
  }

  return (
    <>
      <aside className="hidden lg:block">
        <nav
          aria-label="Site admin sections"
          className="sticky top-4 space-y-5 pr-2"
        >
          {groups.map((group) => (
            <NavGroup
              key={group.label}
              group={group}
              value={value}
              onChange={onChange}
            />
          ))}
        </nav>
      </aside>

      {mobileOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Site admin navigation"
          className="fixed inset-0 z-50 lg:hidden"
        >
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => onMobileOpenChange(false)}
            aria-hidden="true"
          />
          <div className="absolute inset-y-0 left-0 flex w-[min(300px,88vw)] flex-col bg-surface shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <p className="text-sm font-semibold text-foreground">Site admin</p>
              <button
                type="button"
                onClick={() => onMobileOpenChange(false)}
                aria-label="Close menu"
                className="rounded-md p-1 text-muted hover:bg-surface-inset hover:text-foreground"
              >
                <X className="size-5" />
              </button>
            </div>
            <nav
              aria-label="Site admin sections"
              className="flex-1 space-y-5 overflow-y-auto px-3 py-4"
            >
              {groups.map((group) => (
                <NavGroup
                  key={group.label}
                  group={group}
                  value={value}
                  onChange={selectAndClose}
                />
              ))}
            </nav>
          </div>
        </div>
      )}
    </>
  );
}

function NavGroup<T extends string>({
  group,
  value,
  onChange,
}: {
  group: AdminNavGroup<T>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <p className="px-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
        {group.label}
      </p>
      <ul className="mt-1.5 space-y-0.5">
        {group.items.map((item) => {
          const Icon = item.icon;
          const active = item.value === value;
          return (
            <li key={item.value}>
              <button
                type="button"
                onClick={() => onChange(item.value)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                  active
                    ? "bg-primary/10 font-semibold text-primary"
                    : "text-foreground hover:bg-surface-inset",
                )}
              >
                <Icon
                  className={cn(
                    "size-4 shrink-0",
                    active
                      ? "text-primary"
                      : "text-muted group-hover:text-foreground",
                  )}
                />
                <span className="flex-1 truncate">{item.label}</span>
                {item.badge && item.badge > 0 ? (
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-1.5 text-[10px] font-semibold tabular-nums",
                      active
                        ? "bg-primary/15 text-primary"
                        : "bg-surface-inset text-muted",
                    )}
                  >
                    {item.badge > 99 ? "99+" : item.badge}
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
