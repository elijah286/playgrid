"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  Calendar,
  ChevronDown,
  ClipboardList,
  DollarSign,
  LayoutDashboard,
  type LucideIcon,
  Megaphone,
  Rows3,
  Search,
  Settings,
  Sparkles,
  Trophy,
  UserPlus,
  Users,
  UsersRound,
} from "lucide-react";

import { leagueHasPlaybooks } from "@/lib/league/sportConfig";

export type RailLeague = { id: string; name: string; sport: string };

type Section = { href: string; label: string; icon: LucideIcon; exact?: boolean };

function leagueSections(leagueId: string, sport: string, leoEnabled: boolean): Section[] {
  const base = `/league/${leagueId}`;
  const items: Section[] = [
    { href: base, label: "Overview", icon: LayoutDashboard, exact: true },
    { href: `${base}/registration`, label: "Registration", icon: ClipboardList },
    { href: `${base}/teams`, label: "Teams", icon: Users },
    { href: `${base}/roster`, label: "Roster", icon: UserPlus },
    { href: `${base}/divisions`, label: "Divisions", icon: Rows3 },
    { href: `${base}/schedule`, label: "Schedule", icon: Calendar },
    { href: `${base}/games`, label: "Games", icon: Trophy },
    { href: `${base}/communications`, label: "Communications", icon: Megaphone },
    { href: `${base}/financials`, label: "Financials", icon: DollarSign },
  ];
  if (leagueHasPlaybooks(sport)) {
    items.push({ href: `${base}/curriculum`, label: "Curriculum", icon: BookOpen });
  }
  if (leoEnabled) {
    items.push({ href: `${base}/assistant`, label: "Leo", icon: Sparkles });
  }
  items.push({ href: `${base}/settings`, label: "Settings", icon: Settings });
  return items;
}

export function LeagueRail({
  leagues,
  leoEnabled,
}: {
  leagues: RailLeague[];
  leoEnabled: boolean;
}) {
  const pathname = usePathname() ?? "/league";
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [q, setQ] = useState("");
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Scope = portfolio (/league) or a specific league (/league/<id>/...).
  const match = pathname.match(/^\/league\/([0-9a-f-]{8,})/i);
  const activeLeagueId = match?.[1] ?? null;
  const activeLeague = activeLeagueId ? leagues.find((l) => l.id === activeLeagueId) ?? null : null;

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    return n ? leagues.filter((l) => l.name.toLowerCase().includes(n)) : leagues;
  }, [leagues, q]);

  const sections: Section[] = activeLeague
    ? leagueSections(activeLeague.id, activeLeague.sport, leoEnabled)
    : [
        { href: "/league", label: "Overview", icon: LayoutDashboard, exact: true },
        { href: "/league/people", label: "People & access", icon: UsersRound, exact: true },
      ];

  const isActive = (s: Section) =>
    s.exact ? pathname === s.href : pathname === s.href || pathname.startsWith(`${s.href}/`);

  return (
    <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-60 shrink-0 flex-col border-r border-border bg-surface md:flex">
      {/* scope switcher */}
      <div className="relative border-b border-border p-3">
        <div className="px-1 pb-1 text-[11px] uppercase tracking-wide text-muted">Scope</div>
        <button
          type="button"
          onClick={() => setSwitcherOpen((v) => !v)}
          onBlur={() => {
            closeTimer.current = setTimeout(() => setSwitcherOpen(false), 120);
          }}
          className="flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-surface-raised px-2.5 py-2 text-left text-sm font-medium text-foreground hover:bg-foreground/5"
        >
          <span className="min-w-0 truncate">{activeLeague ? activeLeague.name : "All leagues"}</span>
          <ChevronDown className="size-4 shrink-0 text-muted" />
        </button>

        {switcherOpen ? (
          <div
            className="absolute left-3 right-3 z-20 mt-1 overflow-hidden rounded-lg border border-border bg-surface shadow-lg"
            onMouseDown={() => {
              if (closeTimer.current) clearTimeout(closeTimer.current);
            }}
          >
            <div className="flex items-center gap-1.5 border-b border-border px-2.5 py-1.5">
              <Search className="size-3.5 text-muted" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Find a league…"
                className="w-full bg-transparent text-sm text-foreground placeholder:text-muted focus:outline-none"
              />
            </div>
            <div className="max-h-72 overflow-y-auto py-1">
              <Link
                href="/league"
                onClick={() => setSwitcherOpen(false)}
                className={`block px-3 py-1.5 text-sm hover:bg-foreground/5 ${
                  !activeLeague ? "font-medium text-primary" : "text-foreground"
                }`}
              >
                All leagues
              </Link>
              {filtered.map((l) => (
                <Link
                  key={l.id}
                  href={`/league/${l.id}`}
                  onClick={() => setSwitcherOpen(false)}
                  className={`block truncate px-3 py-1.5 text-sm hover:bg-foreground/5 ${
                    activeLeague?.id === l.id ? "font-medium text-primary" : "text-foreground"
                  }`}
                >
                  {l.name}
                </Link>
              ))}
              {filtered.length === 0 ? (
                <div className="px-3 py-2 text-xs text-muted">No match.</div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {/* sections */}
      <nav className="flex-1 overflow-y-auto p-2">
        {activeLeague ? (
          <Link
            href="/league"
            className="mb-1 flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-muted hover:text-foreground"
          >
            ← All leagues
          </Link>
        ) : null}
        {sections.map((s) => {
          const Icon = s.icon;
          const active = isActive(s);
          return (
            <Link
              key={s.href}
              href={s.href}
              className={`flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm ${
                active
                  ? "bg-primary/10 font-medium text-primary"
                  : "text-foreground/80 hover:bg-foreground/5 hover:text-foreground"
              }`}
            >
              <Icon className="size-4 shrink-0" />
              {s.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
