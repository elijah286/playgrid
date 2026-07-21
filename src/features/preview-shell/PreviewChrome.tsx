"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, GraduationCap, Layers, Shield, Sparkles } from "lucide-react";
import { openCoachCal } from "@/features/coach-ai/openCoachCal";
import { ShellAlertsButton } from "@/features/preview-shell/ShellAlertsButton";
import { ShellAccountMenu } from "@/features/preview-shell/ShellAccountMenu";
import { TeamSwitcher } from "@/features/preview-shell/TeamSwitcher";
import {
  PreviewBottomNav,
  PreviewSideNav,
} from "@/features/preview-shell/PreviewBottomNav";
import type { ShellTeam, ShellUser } from "@/features/preview-shell/types";

/**
 * The new shell's frame: a persistent team switcher + primary nav + a prominent
 * Coach Cal action + the "everything else" account menu (Learning Center,
 * Football Library, tutorials, Site Admin, sign out). Desktop puts all of this
 * in a fixed left sidebar; mobile uses a top bar + bottom nav. Production
 * chrome is hidden on /app, so this is the only chrome here.
 */
export function PreviewChrome({
  teams,
  selected,
  user,
  footballLibraryAvailable,
  children,
}: {
  teams: ShellTeam[];
  selected: string;
  user: ShellUser;
  footballLibraryAvailable: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      data-app-shell
      // Fixed frame: bound to the viewport minus the preview ribbon (which
      // publishes --ux-ribbon-h). The 28px default keeps SSR/first paint from
      // overflowing before the ribbon's ResizeObserver refines it. Only <main>
      // scrolls.
      className="flex flex-col overflow-hidden bg-surface"
      style={{ height: "calc(100dvh - var(--ux-ribbon-h, 28px))" }}
    >
      {/* Persistent top bar. Desktop shows the brand (nav lives in the
          sidebar); mobile shows the team switcher (no sidebar there). */}
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-surface-raised px-4 py-2">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/app/home"
            className="hidden shrink-0 items-center gap-2 sm:flex"
            aria-label="XO Gridmaker home"
          >
            <Image
              src="/brand/xogridmaker_monogram.svg"
              alt=""
              // The monogram is a wide 900×380 mark — size by height and let the
              // width follow (h-7 w-auto) so it isn't squished into a square.
              width={66}
              height={28}
              className="h-7 w-auto"
              unoptimized
            />
            <span className="text-sm font-black tracking-tight text-foreground">
              XO Gridmaker
            </span>
          </Link>
          <div className="min-w-0 sm:hidden">
            <TeamSwitcher teams={teams} selected={selected} />
          </div>
        </div>
        <div className="flex items-center gap-1">
          <ShellAlertsButton />
          <ShellAccountMenu
            user={user}
            footballLibraryAvailable={footballLibraryAvailable}
            variant="avatar"
          />
        </div>
      </header>

      <div className="flex min-h-0 w-full flex-1">
        {/* Desktop sidebar — pinned to the frame's left edge (not centered), so
            the chrome hugs the viewport the same way the header does. Fixed;
            only the nav list inside scrolls. */}
        <aside className="hidden w-60 shrink-0 flex-col border-r border-border sm:flex">
          <div className="shrink-0 border-b border-border p-3">
            <TeamSwitcher teams={teams} selected={selected} block />
          </div>
          <nav className="min-h-0 flex-1 overflow-y-auto p-3">
            <PreviewSideNav />
            <CalCta />
            <ExploreNav
              footballLibraryAvailable={footballLibraryAvailable}
              isAdmin={user.isAdmin}
            />
          </nav>
        </aside>

        {/* Main — the ONLY scroll container. Fills the remaining width, but its
            content is centered under one generous, shell-wide cap so pages read
            consistently and never sprawl on ultra-wide displays. Every /app page
            inherits this width — no per-page max-width. */}
        <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-24 pt-4 sm:px-6 sm:pb-10">
          <div className="mx-auto w-full max-w-[1200px]">{children}</div>
        </main>
      </div>

      <PreviewBottomNav />
    </div>
  );
}

/** Prominent Coach Cal action — opens the launcher as a floating/dockable
 *  dialog over the main view (openCoachCal), never full-screen. */
function CalCta() {
  return (
    <button
      type="button"
      onClick={() => openCoachCal()}
      className="mt-2 flex w-full items-center gap-2.5 rounded-xl bg-gradient-to-br from-primary to-primary-dark px-3 py-2.5 text-sm font-bold text-white shadow-card transition-opacity hover:opacity-95"
    >
      <Sparkles className="size-5" aria-hidden />
      Coach Cal
    </button>
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
