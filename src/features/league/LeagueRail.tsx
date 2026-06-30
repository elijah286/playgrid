"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BookOpen,
  Calendar,
  ChevronsUpDown,
  ClipboardList,
  DollarSign,
  LayoutDashboard,
  type LucideIcon,
  Megaphone,
  Rows3,
  Settings,
  Sparkles,
  Trophy,
  UserPlus,
  Users,
  UsersRound,
} from "lucide-react";

import { leagueHasPlaybooks } from "@/lib/league/sportConfig";
import { LeagueSwitcherPalette } from "./LeagueSwitcherPalette";

export type RailLeague = { id: string; name: string; sport: string; location: string | null };

type Section = { path: string; label: string; icon: LucideIcon; exact?: boolean };

function sectionsFor(sport: string, leoEnabled: boolean): Section[] {
  const items: Section[] = [
    { path: "", label: "Overview", icon: LayoutDashboard, exact: true },
    { path: "/registration", label: "Registration", icon: ClipboardList },
    { path: "/teams", label: "Teams", icon: Users },
    { path: "/roster", label: "Roster", icon: UserPlus },
    { path: "/divisions", label: "Divisions", icon: Rows3 },
    { path: "/schedule", label: "Schedule", icon: Calendar },
    { path: "/games", label: "Games", icon: Trophy },
    { path: "/communications", label: "Communications", icon: Megaphone },
    { path: "/financials", label: "Financials", icon: DollarSign },
  ];
  if (leagueHasPlaybooks(sport)) items.push({ path: "/curriculum", label: "Curriculum", icon: BookOpen });
  if (leoEnabled) items.push({ path: "/assistant", label: "Leo", icon: Sparkles });
  items.push({ path: "/settings", label: "Settings", icon: Settings });
  return items;
}

const LAST_LEAGUE_KEY = "league:last";

export function LeagueRail({ leagues, leoEnabled }: { leagues: RailLeague[]; leoEnabled: boolean }) {
  const pathname = usePathname() ?? "/league";
  const router = useRouter();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [remembered, setRemembered] = useState<string | null>(null);

  const urlLeagueId = pathname.match(/^\/league\/([0-9a-f-]{8,})/i)?.[1] ?? null;

  // Remember the last league visited so the sections stay useful at portfolio
  // scope. SSR/first render use url ?? first (deterministic); localStorage is
  // applied post-mount, so no hydration mismatch.
  useEffect(() => {
    if (urlLeagueId) {
      try {
        localStorage.setItem(LAST_LEAGUE_KEY, urlLeagueId);
      } catch {
        /* ignore */
      }
      setRemembered(urlLeagueId);
    } else {
      try {
        const r = localStorage.getItem(LAST_LEAGUE_KEY);
        if (r) setRemembered(r);
      } catch {
        /* ignore */
      }
    }
  }, [urlLeagueId]);

  // ⌘K / Ctrl-K opens the switcher (scoped to the league area — the rail only
  // mounts here).
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

  const candidate = urlLeagueId ?? remembered ?? leagues[0]?.id ?? null;
  const activeLeague =
    leagues.find((l) => l.id === candidate) ?? leagues[0] ?? null;
  const activeLeagueId = activeLeague?.id ?? null;

  const sections = activeLeague ? sectionsFor(activeLeague.sport, leoEnabled) : [];

  function hrefFor(s: Section): string {
    return `/league/${activeLeagueId}${s.path}`;
  }
  function isActive(s: Section): boolean {
    const href = hrefFor(s);
    return s.exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  }

  // Swap the active league but keep the section the operator is looking at.
  function switchLeague(id: string) {
    setPaletteOpen(false);
    const sec = pathname.match(/^\/league\/[^/]+\/(.+)$/)?.[1] ?? "";
    router.push(sec ? `/league/${id}/${sec}` : `/league/${id}`);
  }

  const portfolioActive = pathname === "/league";
  const peopleActive = pathname === "/league/people";

  return (
    <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-60 shrink-0 flex-col border-r border-border bg-surface md:flex">
      {/* portfolio nav */}
      <div className="border-b border-border p-2">
        <Link
          href="/league"
          className={`flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm ${portfolioActive ? "bg-primary/10 font-medium text-primary" : "text-foreground/80 hover:bg-foreground/5 hover:text-foreground"}`}
        >
          <LayoutDashboard className="size-4 shrink-0" />
          All leagues
        </Link>
        <Link
          href="/league/people"
          className={`flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm ${peopleActive ? "bg-primary/10 font-medium text-primary" : "text-foreground/80 hover:bg-foreground/5 hover:text-foreground"}`}
        >
          <UsersRound className="size-4 shrink-0" />
          People &amp; access
        </Link>
      </div>

      {/* league switcher */}
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

      {/* sections for the active league */}
      <nav className="flex-1 overflow-y-auto p-2">
        {sections.map((s) => {
          const Icon = s.icon;
          const active = isActive(s);
          return (
            <Link
              key={s.path}
              href={hrefFor(s)}
              className={`flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm ${active ? "bg-primary/10 font-medium text-primary" : "text-foreground/80 hover:bg-foreground/5 hover:text-foreground"}`}
            >
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
        onSelect={switchLeague}
        onClose={() => setPaletteOpen(false)}
      />
    </aside>
  );
}
