"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";

import { useLeagueNav, type RailLeague } from "./useLeagueNav";
import { LeagueSwitcherPalette } from "./LeagueSwitcherPalette";

/**
 * The ONE place to switch leagues — a persistent subheader above the content
 * it controls, on both desktop and mobile. Replaces the switcher that used to
 * live inside the rail sidebar (disconnected from the content it changed) and
 * the separate native-select switcher some pages embedded in their own
 * content (a second, redundant control). Owns the ⌘K shortcut.
 *
 * Renders nothing on /league and /league/people — there's no "active league"
 * to show a trail for there.
 */
export function LeagueBreadcrumb({
  leagues,
  leoEnabled,
}: {
  leagues: RailLeague[];
  leoEnabled: boolean;
}) {
  const { activeLeague, activeLeagueId, sections, isActive, switchLeague, insideLeague } =
    useLeagueNav(leagues, leoEnabled);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!insideLeague) return null;

  const currentSection = sections.find(isActive);

  return (
    <>
      <div className="sticky top-14 z-20 flex items-center gap-1.5 border-b border-border bg-surface px-4 py-2 text-sm sm:px-6">
        <Link
          href="/league"
          className="hidden shrink-0 text-muted hover:text-foreground hover:underline sm:inline"
        >
          All leagues
        </Link>
        <span className="hidden shrink-0 text-muted sm:inline">/</span>

        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="flex min-w-0 shrink items-center gap-1.5 rounded-md px-1.5 py-0.5 font-medium text-foreground hover:bg-foreground/5"
        >
          <span className="min-w-0 truncate">{activeLeague ? activeLeague.name : "Pick a league"}</span>
          <ChevronDown className="size-3.5 shrink-0 text-muted" />
          <kbd className="hidden shrink-0 rounded border border-border px-1 text-[10px] text-muted md:inline">
            ⌘K
          </kbd>
        </button>

        {currentSection ? (
          <>
            <span className="shrink-0 text-muted">/</span>
            <span className="shrink-0 truncate text-muted">{currentSection.label}</span>
          </>
        ) : null}
      </div>

      <LeagueSwitcherPalette
        open={paletteOpen}
        leagues={leagues}
        activeId={activeLeagueId}
        onSelect={(id) => {
          setPaletteOpen(false);
          switchLeague(id);
        }}
        onClose={() => setPaletteOpen(false)}
      />
    </>
  );
}
