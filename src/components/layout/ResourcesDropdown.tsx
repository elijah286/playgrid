"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

type Item = { href: string; label: string; description: string };

const APP_ITEMS: Item[] = [
  {
    href: "/learn/using-xo",
    label: "App tutorials",
    description: "Hands-on walkthroughs of the editor",
  },
  { href: "/examples", label: "Examples", description: "Real playbooks to remix" },
  { href: "/faq", label: "FAQ", description: "How XO Gridmaker works" },
];

const LIBRARY_ITEM: Item = {
  href: "/learn/library",
  label: "Football library",
  description: "Plays, drills, and coaching concepts",
};

const LEAGUE_ITEM: Item = {
  href: "/league",
  label: "League Operations",
  description: "Run your leagues — registration, rosters, schedule",
};

/** Returns the items list for a given gate state; shared with [[MobileNavMenu]].
 *  League organizers get a "League Operations" entry first — their way back to
 *  the operator area from anywhere in the classic product. */
export function getResourceItems(
  footballLibraryAvailable: boolean,
  leagueAccess = false,
): Item[] {
  const base = footballLibraryAvailable ? [LIBRARY_ITEM, ...APP_ITEMS] : APP_ITEMS;
  return leagueAccess ? [LEAGUE_ITEM, ...base] : base;
}

/** Header nav dropdown grouping the free educational/reference content.
 *  The Football Library entry is beta-gated — included only when
 *  footballLibraryAvailable=true. Hidden on mobile (footer covers it). */
export function ResourcesDropdown({
  footballLibraryAvailable = false,
  leagueAccess = false,
}: {
  footballLibraryAvailable?: boolean;
  leagueAccess?: boolean;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const items = getResourceItems(footballLibraryAvailable, leagueAccess);

  // Click outside + Escape close. Standard menu pattern; using refs +
  // listeners rather than onBlur so clicks on menu items don't dismiss
  // before the link navigates.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const activeSection = items.some((it) => pathname.startsWith(it.href));

  return (
    <div ref={wrapRef} className="relative hidden sm:block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`inline-flex items-center gap-1 whitespace-nowrap text-sm transition-colors ${
          activeSection
            ? "font-semibold text-foreground"
            : "text-muted hover:text-foreground"
        }`}
      >
        Resources
        <ChevronDown
          className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-40 mt-2 w-64 overflow-hidden rounded-xl border border-border bg-surface-raised shadow-lg ring-1 ring-black/[0.03]"
        >
          <ul className="py-1">
            {items.map((it) => {
              const active = pathname.startsWith(it.href);
              return (
                <li key={it.href} role="none">
                  <Link
                    href={it.href}
                    role="menuitem"
                    onClick={() => setOpen(false)}
                    className={`block px-4 py-2.5 text-sm transition-colors ${
                      active
                        ? "bg-primary-light/40 text-foreground"
                        : "text-foreground hover:bg-surface-inset"
                    }`}
                  >
                    <div className="font-medium">{it.label}</div>
                    <div className="mt-0.5 text-xs text-muted">{it.description}</div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
