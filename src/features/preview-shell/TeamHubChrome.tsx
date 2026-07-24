"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ClipboardList,
  Layers,
  ListChecks,
  Settings,
  Trophy,
  Users,
} from "lucide-react";
import { TeamSwitcher } from "@/features/preview-shell/TeamSwitcher";
import type { ShellTeam } from "@/features/preview-shell/types";

const FALLBACK = "#134e2a";

const TABS = [
  { href: "/app/team", label: "Plays", Icon: ListChecks, exact: true },
  { href: "/app/team/roster", label: "Roster", Icon: Users },
  { href: "/app/team/practice", label: "Practice", Icon: ClipboardList },
  { href: "/app/team/results", label: "Results", Icon: Trophy },
  { href: "/app/team/formations", label: "Formations", Icon: Layers },
  { href: "/app/team/settings", label: "Settings", Icon: Settings },
];

function hexLuminance(hex: string): number {
  const m = hex.replace("#", "");
  if (m.length < 6) return 0.3;
  const r = parseInt(m.slice(0, 2), 16) / 255;
  const g = parseInt(m.slice(2, 4), 16) / 255;
  const b = parseInt(m.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Shared Team-hub chrome: the team-identity banner + the sub-nav, wrapping
 *  every /app/team/* screen so the team context is constant across them. */
export function TeamHubChrome({
  team,
  teams,
  selected,
  children,
}: {
  team: {
    name: string;
    color: string | null;
    logoUrl: string | null;
    season: string | null;
    sportLabel: string | null;
  };
  /** All the user's teams + the selected id — the Team hub is the ONE place the
   *  team switcher lives now (the global switcher was removed). */
  teams: ShellTeam[];
  selected: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "/app/team";
  const color = team.color || FALLBACK;
  const isLight = hexLuminance(color) > 0.6;
  const onColor = isLight ? "text-slate-900" : "text-white";
  const onColorHover = isLight ? "hover:bg-black/10" : "hover:bg-white/15";

  return (
    // Fluid: the team hub fills the shell width so the plays/formations grids
    // can use it. Reading/form tabs (Settings, Roster) and the reused
    // production tabs cap their own content narrower.
    <div className="space-y-4">
      <div
        className="flex items-center gap-3 rounded-2xl p-4"
        style={{ background: `linear-gradient(135deg, ${color}, ${color}cc)` }}
      >
        <span className="relative grid size-11 shrink-0 place-items-center overflow-hidden rounded-xl bg-white/20 text-lg font-black text-white">
          {team.logoUrl ? (
            <Image src={team.logoUrl} alt="" fill sizes="44px" className="object-contain p-1" unoptimized />
          ) : (
            team.name.trim().charAt(0).toUpperCase()
          )}
        </span>
        <div className={`min-w-0 flex-1 ${onColor}`}>
          {/* The team name IS the switcher — click it to change teams. This is
              the only team selector in the shell now. */}
          <TeamSwitcher
            teams={teams}
            selected={selected}
            variant="bare"
            triggerClassName={`${onColor} ${onColorHover}`}
          />
          <p className="truncate text-xs opacity-85">
            {[team.season, team.sportLabel].filter(Boolean).join(" · ") || "Team"}
          </p>
        </div>
      </div>

      <nav
        aria-label="Team sections"
        // Horizontal-only scroller: overflow-y-hidden stops the browser from
        // promoting the y-axis to `auto` (which it does when x is auto and y is
        // visible), which was causing a transient vertical scrollbar + a few px
        // of vertical drift. Scrollbar itself hidden to match the production
        // playbook strip.
        className="-mx-1 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-border px-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {TABS.map((t) => {
          const active = t.exact ? pathname === t.href : pathname.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={`-mb-px flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-bold transition-colors ${
                active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted hover:text-foreground"
              }`}
            >
              <t.Icon className="size-4" aria-hidden />
              {t.label}
            </Link>
          );
        })}
      </nav>

      {children}
    </div>
  );
}
