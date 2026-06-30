"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronsUpDown, LayoutDashboard, UsersRound } from "lucide-react";

import { useLeagueNav, type RailLeague } from "./useLeagueNav";
import { LeagueSwitcherPalette } from "./LeagueSwitcherPalette";
import { OrgSwitcher, type SwitcherOrg } from "./OrgSwitcher";

export type { RailLeague };

/** Desktop app-wide rail for the operator area (md+). The mobile counterpart is
 *  LeagueMobileNav; both share useLeagueNav. */
export function LeagueRail({
  leagues,
  leoEnabled,
  orgs,
  activeOrgId,
}: {
  leagues: RailLeague[];
  leoEnabled: boolean;
  orgs: SwitcherOrg[];
  activeOrgId: string | null;
}) {
  const { pathname, activeLeague, activeLeagueId, sections, hrefFor, isActive, switchLeague } =
    useLeagueNav(leagues, leoEnabled);
  const [paletteOpen, setPaletteOpen] = useState(false);

  // ⌘K / Ctrl-K opens the switcher (desktop only; the rail owns the shortcut).
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

  const portfolioActive = pathname === "/league";
  const peopleActive = pathname === "/league/people";
  const linkCls = (active: boolean) =>
    `flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm ${active ? "bg-primary/10 font-medium text-primary" : "text-foreground/80 hover:bg-foreground/5 hover:text-foreground"}`;

  return (
    <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-60 shrink-0 flex-col border-r border-border bg-surface md:flex">
      {orgs.length > 1 ? (
        <div className="border-b border-border p-2">
          <OrgSwitcher orgs={orgs} activeOrgId={activeOrgId} />
        </div>
      ) : null}

      <div className="border-b border-border p-2">
        <Link href="/league" className={linkCls(portfolioActive)}>
          <LayoutDashboard className="size-4 shrink-0" />
          All leagues
        </Link>
        <Link href="/league/people" className={linkCls(peopleActive)}>
          <UsersRound className="size-4 shrink-0" />
          People &amp; access
        </Link>
      </div>

      <div className="border-b border-border p-3">
        <div className="px-1 pb-1 text-[11px] uppercase tracking-wide text-muted">League</div>
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-surface-raised px-2.5 py-2 text-left text-sm font-medium text-foreground hover:bg-foreground/5"
        >
          <span className="min-w-0 truncate">{activeLeague ? activeLeague.name : "Pick a league"}</span>
          <span className="flex shrink-0 items-center gap-1 text-muted">
            <kbd className="rounded border border-border px-1 text-[10px]">⌘K</kbd>
            <ChevronsUpDown className="size-4" />
          </span>
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto p-2">
        {sections.map((s) => {
          const Icon = s.icon;
          return (
            <Link key={s.path} href={hrefFor(s)} className={linkCls(isActive(s))}>
              <Icon className="size-4 shrink-0" />
              {s.label}
            </Link>
          );
        })}
      </nav>

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
    </aside>
  );
}
