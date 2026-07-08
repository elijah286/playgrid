"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ClipboardList,
  LayoutDashboard,
  Library,
  type LucideIcon,
  MoreHorizontal,
  UserPlus,
  Users,
  UsersRound,
} from "lucide-react";

import { useLeagueNav, type LeagueSection, type RailLeague } from "./useLeagueNav";
import { OrgSwitcher, type SwitcherOrg } from "./OrgSwitcher";

// The four primary sections that live in the bottom bar; everything else is in
// the "More" sheet. Mirrors the iOS tab-bar-plus-More metaphor — scales to any
// number of sections without crowding the bar.
const PRIMARY: { path: string; label: string; Icon: LucideIcon; exact?: boolean }[] = [
  { path: "", label: "Overview", Icon: LayoutDashboard, exact: true },
  { path: "/registration", label: "Registration", Icon: ClipboardList },
  { path: "/roster", label: "Roster", Icon: UserPlus },
  { path: "/teams", label: "Teams", Icon: Users },
];

const tabCls = (active: boolean) =>
  `flex min-h-[48px] flex-1 flex-col items-center justify-center gap-1 px-1 py-1.5 text-[11px] font-semibold tracking-tight transition-all duration-100 active:scale-[0.94] active:bg-surface-inset ${
    active ? "text-primary" : "text-muted hover:text-foreground"
  }`;

/** Mobile (<md) bottom bar for the operator area — replaces the coach bottom nav
 *  on /league (HomeBottomNav bails there via isOwnBottomBarRoute). League
 *  switching itself lives in LeagueBreadcrumb (the sticky bar above the
 *  content), not here — this bar is sections-only. */
export function LeagueMobileNav({
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
  const { pathname, activeLeague, activeLeagueId, sections, hrefFor, isActive } = useLeagueNav(
    leagues,
    leoEnabled,
  );
  const [sheetOpen, setSheetOpen] = useState(false);

  // Reserve footer clearance for the bar (globals.css `body.has-bottom-nav`).
  useEffect(() => {
    document.body.classList.add("has-bottom-nav");
    return () => document.body.classList.remove("has-bottom-nav");
  }, []);
  useEffect(() => {
    if (!sheetOpen) return;
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSheetOpen(false);
    };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [sheetOpen]);

  const base = `/league/${activeLeagueId ?? ""}`;
  const tabActive = (path: string, exact?: boolean) => {
    const href = `${base}${path}`;
    return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  };

  // Members see the fixed primary tabs; a delegated member gets their first few
  // accessible sections instead, so the bar never shows a tab they'd 404 on.
  const primary =
    activeLeague?.capabilities == null
      ? PRIMARY
      : sections
          .slice(0, 4)
          .map((s) => ({ path: s.path, label: s.label, Icon: s.icon, exact: s.exact }));

  return (
    <>
      <nav
        aria-label="League"
        className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-border bg-surface-raised md:hidden"
        style={{
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
          paddingLeft: "env(safe-area-inset-left, 0px)",
          paddingRight: "env(safe-area-inset-right, 0px)",
        }}
      >
        {primary.map((t) => (
          <Link key={t.path} href={`${base}${t.path}`} className={tabCls(tabActive(t.path, t.exact))}>
            <t.Icon className="size-5" aria-hidden />
            <span className="truncate">{t.label}</span>
          </Link>
        ))}
        <button type="button" onClick={() => setSheetOpen(true)} className={tabCls(sheetOpen)}>
          <MoreHorizontal className="size-5" aria-hidden />
          <span className="truncate">More</span>
        </button>
      </nav>

      {sheetOpen ? (
        <MoreSheet
          leagueName={activeLeague?.name ?? "Pick a league"}
          sections={sections}
          hrefFor={hrefFor}
          isActive={isActive}
          orgs={orgs}
          activeOrgId={activeOrgId}
          onClose={() => setSheetOpen(false)}
        />
      ) : null}
    </>
  );
}

function MoreSheet({
  leagueName,
  sections,
  hrefFor,
  isActive,
  orgs,
  activeOrgId,
  onClose,
}: {
  leagueName: string;
  sections: LeagueSection[];
  hrefFor: (s: LeagueSection) => string;
  isActive: (s: LeagueSection) => boolean;
  orgs: SwitcherOrg[];
  activeOrgId: string | null;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-label="League menu">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div
        className="absolute inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto rounded-t-2xl border-t border-border bg-surface-raised pb-[env(safe-area-inset-bottom,0px)]"
      >
        {/* org switcher (only when the user belongs to more than one org) */}
        {orgs.length > 1 ? (
          <div className="border-b border-border p-3">
            <div className="px-1 pb-1.5 text-[11px] uppercase tracking-wide text-muted">
              Organization
            </div>
            <OrgSwitcher orgs={orgs} activeOrgId={activeOrgId} />
          </div>
        ) : null}

        {/* current league (context only — switch via the bar above the content) */}
        <div className="border-b border-border px-3 py-2.5">
          <div className="text-[11px] uppercase tracking-wide text-muted">League</div>
          <div className="truncate text-sm font-semibold text-foreground">{leagueName}</div>
        </div>

        {/* all sections */}
        <div className="grid grid-cols-2 gap-1 p-2">
          {sections.map((s) => {
            const Icon = s.icon;
            const active = isActive(s);
            return (
              <Link
                key={s.path}
                href={hrefFor(s)}
                onClick={onClose}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm ${active ? "bg-primary/10 font-medium text-primary" : "text-foreground hover:bg-foreground/5"}`}
              >
                <Icon className="size-4 shrink-0" />
                <span className="truncate">{s.label}</span>
              </Link>
            );
          })}
        </div>

        {/* portfolio */}
        <div className="border-t border-border p-2">
          <Link
            href="/league"
            onClick={onClose}
            className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-foreground hover:bg-foreground/5"
          >
            <LayoutDashboard className="size-4 shrink-0" />
            All leagues
          </Link>
          <Link
            href="/league/people"
            onClick={onClose}
            className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-foreground hover:bg-foreground/5"
          >
            <UsersRound className="size-4 shrink-0" />
            People &amp; access
          </Link>
          <Link
            href="/league/library"
            onClick={onClose}
            className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-foreground hover:bg-foreground/5"
          >
            <Library className="size-4 shrink-0" />
            Library
          </Link>
        </div>
      </div>
    </div>
  );
}
