"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  BookOpen,
  Calendar,
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
} from "lucide-react";

import { leagueHasPlaybooks } from "@/lib/league/sportConfig";

export type RailLeague = { id: string; name: string; sport: string; location: string | null };

export type LeagueSection = { path: string; label: string; icon: LucideIcon; exact?: boolean };

export function leagueSections(sport: string, leoEnabled: boolean): LeagueSection[] {
  const items: LeagueSection[] = [
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

/**
 * Shared league-navigation state for the desktop rail and the mobile bar: the
 * "active league" (URL → last-visited → first), its sections, active-route
 * detection, and a section-preserving league swap. Both nav surfaces mount (one
 * is CSS-hidden), so the logic lives here once.
 */
export function useLeagueNav(leagues: RailLeague[], leoEnabled: boolean) {
  const pathname = usePathname() ?? "/league";
  const router = useRouter();
  const [remembered, setRemembered] = useState<string | null>(null);

  const urlLeagueId = pathname.match(/^\/league\/([0-9a-f-]{8,})/i)?.[1] ?? null;

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

  const candidate = urlLeagueId ?? remembered ?? leagues[0]?.id ?? null;
  const activeLeague = leagues.find((l) => l.id === candidate) ?? leagues[0] ?? null;
  const activeLeagueId = activeLeague?.id ?? null;
  const sections = activeLeague ? leagueSections(activeLeague.sport, leoEnabled) : [];

  const hrefFor = (s: LeagueSection) => `/league/${activeLeagueId}${s.path}`;
  const isActive = (s: LeagueSection) => {
    const href = hrefFor(s);
    return s.exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  };

  // Swap the active league but keep the section the operator is on.
  const switchLeague = (id: string) => {
    const sec = pathname.match(/^\/league\/[^/]+\/(.+)$/)?.[1] ?? "";
    router.push(sec ? `/league/${id}/${sec}` : `/league/${id}`);
  };

  return { pathname, activeLeague, activeLeagueId, sections, hrefFor, isActive, switchLeague };
}
