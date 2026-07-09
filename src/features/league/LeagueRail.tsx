"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronsUpDown, LayoutDashboard, Library, UsersRound } from "lucide-react";

import { sportConfig } from "@/lib/league/sportConfig";
import { useLeagueNav, type LeagueSection, type RailLeague } from "./useLeagueNav";
import { LeagueSwitcherPalette } from "./LeagueSwitcherPalette";
import { OrgSwitcher, type SwitcherOrg } from "./OrgSwitcher";

export type { RailLeague };

/**
 * Desktop app-wide rail for the operator area (md+), scope-aware so portfolio
 * and league contexts never blend:
 *
 *  - On portfolio pages (/league, /league/people, /league/library) it shows the
 *    organization's own nav plus the league list — no league sections, because
 *    there is no active league there.
 *  - Inside a league it shows that league's identity (name + sport, tap to
 *    switch via the same ⌘K palette the breadcrumb owns), its sections grouped
 *    by job, and a way back to the portfolio.
 *
 * The mobile counterpart is LeagueMobileNav; both share useLeagueNav.
 */
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
  const { pathname, activeLeague, sections, hrefFor, isActive, switchLeague, insideLeague } =
    useLeagueNav(leagues, leoEnabled);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const linkCls = (active: boolean) =>
    `flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm ${active ? "bg-primary/10 font-medium text-primary" : "text-foreground/80 hover:bg-foreground/5 hover:text-foreground"}`;

  return (
    <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-60 shrink-0 flex-col border-r border-border bg-surface md:flex">
      {orgs.length > 1 ? (
        <div className="border-b border-border p-2">
          <OrgSwitcher orgs={orgs} activeOrgId={activeOrgId} />
        </div>
      ) : null}

      {insideLeague && activeLeague ? (
        <>
          <div className="border-b border-border p-2">
            <Link
              href="/league"
              className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-muted hover:bg-foreground/5 hover:text-foreground"
            >
              <ArrowLeft className="size-3.5 shrink-0" />
              All leagues
            </Link>
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              title="Switch league (⌘K)"
              className="mt-1 flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-surface-raised px-2.5 py-2 text-left hover:border-primary/40"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-foreground">
                  {activeLeague.name}
                </span>
                <span className="block truncate text-[11px] text-muted">
                  {sportConfig(activeLeague.sport).label}
                  {activeLeague.location ? ` · ${activeLeague.location}` : ""}
                </span>
              </span>
              <ChevronsUpDown className="size-3.5 shrink-0 text-muted" />
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto p-2">
            <GroupedSections sections={sections} hrefFor={hrefFor} isActive={isActive} linkCls={linkCls} />
          </nav>

          <LeagueSwitcherPalette
            open={paletteOpen}
            leagues={leagues}
            activeId={activeLeague.id}
            onSelect={(id) => {
              setPaletteOpen(false);
              switchLeague(id);
            }}
            onClose={() => setPaletteOpen(false)}
          />
        </>
      ) : (
        <>
          <div className="border-b border-border p-2">
            <Link href="/league" className={linkCls(pathname === "/league")}>
              <LayoutDashboard className="size-4 shrink-0" />
              All leagues
            </Link>
            <Link href="/league/people" className={linkCls(pathname === "/league/people")}>
              <UsersRound className="size-4 shrink-0" />
              People &amp; access
            </Link>
            <Link href="/league/library" className={linkCls(pathname === "/league/library")}>
              <Library className="size-4 shrink-0" />
              Library
            </Link>
          </div>

          <nav className="flex-1 overflow-y-auto p-2">
            <div className="px-2.5 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wide text-muted">
              Leagues
            </div>
            {leagues.map((l) => (
              <Link key={l.id} href={`/league/${l.id}`} className={linkCls(false)}>
                <span className="min-w-0">
                  <span className="block truncate">{l.name}</span>
                  <span className="block truncate text-[11px] text-muted">
                    {sportConfig(l.sport).label}
                    {l.location ? ` · ${l.location}` : ""}
                  </span>
                </span>
              </Link>
            ))}
          </nav>
        </>
      )}
    </aside>
  );
}

/** League sections with their group headings. Ungrouped sections (Overview,
 *  Leo, Settings) render flat, in list order, outside any heading. */
function GroupedSections({
  sections,
  hrefFor,
  isActive,
  linkCls,
}: {
  sections: LeagueSection[];
  hrefFor: (s: LeagueSection) => string;
  isActive: (s: LeagueSection) => boolean;
  linkCls: (active: boolean) => string;
}) {
  // Preserve section order while emitting a heading whenever the group changes.
  let lastGroup: string | undefined;
  return (
    <>
      {sections.map((s) => {
        const Icon = s.icon;
        const heading =
          s.group && s.group !== lastGroup ? (
            <div className="px-2.5 pb-1 pt-3 text-[11px] font-medium uppercase tracking-wide text-muted">
              {s.group}
            </div>
          ) : !s.group && lastGroup ? (
            <div className="mx-2.5 my-2 border-t border-border" />
          ) : null;
        lastGroup = s.group;
        return (
          <div key={s.path}>
            {heading}
            <Link href={hrefFor(s)} className={linkCls(isActive(s))}>
              <Icon className="size-4 shrink-0" />
              {s.label}
            </Link>
          </div>
        );
      })}
    </>
  );
}
