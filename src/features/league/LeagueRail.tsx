"use client";

import Link from "next/link";
import { LayoutDashboard, Library, UsersRound } from "lucide-react";

import { useLeagueNav, type RailLeague } from "./useLeagueNav";
import { OrgSwitcher, type SwitcherOrg } from "./OrgSwitcher";

export type { RailLeague };

/** Desktop app-wide rail for the operator area (md+): org switcher, portfolio
 *  links, and this league's sections. The mobile counterpart is
 *  LeagueMobileNav; both share useLeagueNav. League switching itself lives in
 *  LeagueBreadcrumb, the persistent subheader above the content — not here,
 *  so there's exactly one place to switch leagues, not two. */
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
  const { pathname, sections, hrefFor, isActive } = useLeagueNav(leagues, leoEnabled);

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
        <Link href="/league/library" className={linkCls(pathname === "/league/library")}>
          <Library className="size-4 shrink-0" />
          Library
        </Link>
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
    </aside>
  );
}
