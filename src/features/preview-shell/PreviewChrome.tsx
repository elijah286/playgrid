"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, GraduationCap, Layers, Shield, Sparkles } from "lucide-react";
import { openCoachCal } from "@/features/coach-ai/openCoachCal";
import { ShellAlertsButton } from "@/features/preview-shell/ShellAlertsButton";
import { ShellAccountMenu } from "@/features/preview-shell/ShellAccountMenu";
import {
  PreviewBottomNav,
  PreviewSideNav,
} from "@/features/preview-shell/PreviewBottomNav";
import type { ShellTeam, ShellUser } from "@/features/preview-shell/types";

/**
 * The new shell's frame: primary nav + a prominent Coach Cal action + the
 * "everything else" account menu (Learning Center, Football Library, tutorials,
 * Site Admin, sign out). Desktop puts all of this in a fixed left sidebar;
 * mobile uses a top bar + bottom nav. Production chrome is hidden on /app, so
 * this is the only chrome here.
 *
 * There is NO global team switcher: Home/Calendar/Messages are cross-team and
 * own their own controls (teams shelf, calendar multi-select, conversation
 * list). Team selection lives only on the Team hub (TeamHubChrome), the one
 * genuinely single-team surface.
 */
export function PreviewChrome({
  teams,
  user,
  footballLibraryAvailable,
  children,
}: {
  teams: ShellTeam[];
  user: ShellUser;
  footballLibraryAvailable: boolean;
  children: React.ReactNode;
}) {
  // "Coach anywhere?" — the single role signal (Workstream 1/3). A user is a
  // coach if they own or edit ANY team; otherwise they're a pure viewer
  // (player/parent) and the nav drops Cal. Same signal the role-aware Home uses.
  const isCoach = teams.some((t) => t.role === "owner" || t.role === "editor");

  // A message thread (/app/messages/<teamId>) is a full-screen conversation: it
  // FILLS the main area (composer pinned at the bottom, above the safe area),
  // not a short card in the scrolling main. The bottom nav is hidden here, so no
  // footer padding — the composer's own safe-area inset keeps it off the curved
  // corners / home indicator.
  const pathname = usePathname() ?? "";
  const isFocusedThread = /^\/app\/messages\/[^/]+/.test(pathname);

  // Publish the header's bottom edge as --coach-dock-top so the docked Coach Cal
  // panel opens BELOW the header (not level with it): the header stays a
  // full-width fixed bar and only the content row makes room for the dock. On
  // production (no shell) the var is unset → the panel keeps its top:0 behavior.
  const headerRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      const h = headerRef.current?.getBoundingClientRect().bottom ?? 0;
      root.style.setProperty("--coach-dock-top", `${Math.round(h)}px`);
    };
    apply();
    window.addEventListener("resize", apply);
    return () => {
      window.removeEventListener("resize", apply);
      root.style.removeProperty("--coach-dock-top");
    };
  }, []);

  return (
    <div
      data-app-shell
      // Fixed frame bound to the full viewport — this is the only chrome on
      // /app (production header + the old preview ribbon are both hidden here),
      // so it owns the top safe-area inset (the notch/status bar). env() is 0 on
      // the web, so the padding only appears on a notched native/standalone
      // device. box-border keeps the padded frame at exactly 100dvh so only
      // <main> scrolls.
      className="flex flex-col overflow-hidden bg-surface box-border"
      style={{ height: "100dvh", paddingTop: "env(safe-area-inset-top, 0px)" }}
    >
      {/* Persistent top bar — the brand on both platforms (nav lives in the
          sidebar on desktop, the bottom bar on mobile). No team switcher: team
          selection lives on the Team hub, not in global chrome. */}
      <header
        ref={headerRef}
        className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-surface-raised px-4 py-2"
      >
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/app/home"
            className="flex shrink-0 cursor-pointer items-center text-[#06255E] dark:text-foreground"
            aria-label="XO Gridmaker home"
          >
            {/* The official wordmark — one "xogridmaker" token, x=#1769FF,
                o=#95CC1F, "gridmaker" inherits currentColor for dark mode.
                Matches the production SiteHeader exactly (no monogram + repeated
                "XO Gridmaker" text). */}
            <svg
              viewBox="0 0 1600 320"
              role="img"
              aria-label="XO Gridmaker"
              className="h-7 w-auto"
            >
              <text
                y="210"
                fontFamily='"DejaVu Sans", Arial, sans-serif'
                fontSize="150"
                fontStyle="oblique"
                fontWeight="700"
              >
                <tspan x="278.24" fill="#1769FF">x</tspan><tspan x="378.68" fill="#95CC1F">o</tspan><tspan x="473.44" fill="currentColor">gridmaker</tspan>
              </text>
            </svg>
          </Link>
        </div>
        <div className="flex items-center gap-1.5">
          {/* Coach Cal launcher in the header — DESKTOP ONLY. On mobile Cal is
              the bottom nav's center slot, so the header must not duplicate it.
              Coach-only; opens the floating/dockable dialog. */}
          {isCoach && (
            <button
              type="button"
              onClick={() => openCoachCal()}
              aria-label="Coach Cal"
              className="hidden items-center gap-1.5 rounded-lg bg-gradient-to-br from-primary to-primary-dark px-2.5 py-1.5 text-sm font-bold text-white shadow-sm transition-opacity hover:opacity-95 sm:inline-flex"
            >
              <Sparkles className="size-4" aria-hidden />
              <span>Coach Cal</span>
            </button>
          )}
          <ShellAlertsButton />
          {/* Desktop only: on mobile the account menu lives in the footer's
              "More" tab, so the header stays brand + Cal + bell. */}
          <div className="hidden sm:block">
            <ShellAccountMenu
              user={user}
              footballLibraryAvailable={footballLibraryAvailable}
              variant="avatar"
            />
          </div>
        </div>
      </header>

      {/* app-shell-content: when Coach Cal is docked, THIS row makes room for
          the dock (padding-right via globals.css) — the header above stays
          full-width and fixed. */}
      <div className="app-shell-content flex min-h-0 w-full flex-1">
        {/* Desktop sidebar — pinned to the frame's left edge (not centered), so
            the chrome hugs the viewport the same way the header does. Fixed;
            only the nav list inside scrolls. */}
        <aside className="hidden w-60 shrink-0 flex-col border-r border-border sm:flex">
          <nav className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3">
            <PreviewSideNav />
            {/* Resources (Football library, tutorials, examples, Site Admin) sink
                to the BOTTOM of the sidebar, separated from the primary nav —
                secondary destinations, not peers of Home/Playbooks/Calendar. */}
            <div className="mt-auto pt-6">
              <ExploreNav
                footballLibraryAvailable={footballLibraryAvailable}
                isAdmin={user.isAdmin}
              />
            </div>
          </nav>
        </aside>

        {/* Main — the ONLY scroll container. Fills the remaining width up to a
            generous ceiling so grid/dashboard pages (Home, Team plays) can use
            the space, while it still guards against sprawl on ultra-wide
            displays. Reading/form pages cap themselves narrower (Messages,
            Alerts, Settings) — the frame sets the max, pages choose to go
            narrower. */}
        <main
          className={
            isFocusedThread
              ? "min-h-0 flex-1 overflow-hidden sm:p-6"
              : // Bottom clearance for the fixed nav (~48px) + protruding Cal
                // button + the home-indicator safe area, so the last row never
                // jams under the nav on a notched phone (plain pb-24 didn't
                // account for the inset). Desktop has no nav → sm:pb-10.
                "min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(6rem+env(safe-area-inset-bottom,0px))] pt-4 sm:px-6 sm:pb-10"
          }
        >
          <div
            className={
              isFocusedThread
                ? "flex h-full w-full flex-col"
                : "mx-auto w-full max-w-[1600px]"
            }
          >
            {children}
          </div>
        </main>
      </div>

      <PreviewBottomNav
        isCoach={isCoach}
        user={user}
        footballLibraryAvailable={footballLibraryAvailable}
      />
    </div>
  );
}

/** Secondary destinations that aren't team-scoped — surfaced in the sidebar so
 *  they're discoverable (also in the account menu for completeness). */
function ExploreNav({
  footballLibraryAvailable,
  isAdmin,
}: {
  footballLibraryAvailable: boolean;
  isAdmin: boolean;
}) {
  const pathname = usePathname() ?? "";
  const items = [
    ...(footballLibraryAvailable
      ? [{ href: "/learn/library", label: "Football library", Icon: BookOpen }]
      : []),
    { href: "/learn/using-xo", label: "App tutorials", Icon: GraduationCap },
    { href: "/examples", label: "Examples", Icon: Layers },
    ...(isAdmin ? [{ href: "/settings", label: "Site Admin", Icon: Shield }] : []),
  ];
  return (
    <div className="mt-4">
      <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wide text-muted">
        Explore
      </p>
      {items.map((it) => {
        const active = pathname === it.href || pathname.startsWith(`${it.href}/`);
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
              active
                ? "bg-primary-light text-primary-dark"
                : "text-muted hover:bg-surface-inset hover:text-foreground"
            }`}
          >
            <it.Icon className="size-5" aria-hidden />
            {it.label}
          </Link>
        );
      })}
    </div>
  );
}
