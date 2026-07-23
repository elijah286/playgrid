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
import { isLightAccent } from "@/lib/ui/playbook-accent";

const FALLBACK = "#134e2a";

const TABS = [
  { href: "/app/team", label: "Plays", Icon: ListChecks, exact: true },
  { href: "/app/team/roster", label: "Roster", Icon: Users },
  { href: "/app/team/practice", label: "Practice", Icon: ClipboardList },
  { href: "/app/team/results", label: "Results", Icon: Trophy },
  { href: "/app/team/formations", label: "Formations", Icon: Layers },
  { href: "/app/team/settings", label: "Settings", Icon: Settings },
];

/** Shared Team-hub chrome: the team-identity banner + the sub-nav, wrapping
 *  every /app/team/* screen so the team context is constant across them. */
export function TeamHubChrome({
  team,
  children,
}: {
  team: {
    name: string;
    color: string | null;
    logoUrl: string | null;
    season: string | null;
    sportLabel: string | null;
  };
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "/app/team";
  const color = team.color || FALLBACK;
  const onColor = isLightAccent(color) ? "text-slate-900" : "text-white";

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
          <h1 className="truncate text-lg font-extrabold">{team.name}</h1>
          <p className="truncate text-xs opacity-85">
            {[team.season, team.sportLabel].filter(Boolean).join(" · ") || "Team"}
          </p>
        </div>
      </div>

      <nav
        aria-label="Team sections"
        className="-mx-1 flex gap-1 overflow-x-auto border-b border-border px-1"
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
