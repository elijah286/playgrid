"use client";

import Image from "next/image";
import Link from "next/link";
import { ShellAlertsButton } from "@/features/preview-shell/ShellAlertsButton";
import { TeamSwitcher } from "@/features/preview-shell/TeamSwitcher";
import {
  PreviewBottomNav,
  PreviewSideNav,
} from "@/features/preview-shell/PreviewBottomNav";
import type { ShellTeam, ShellUser } from "@/features/preview-shell/types";

function initialsFor(user: ShellUser): string {
  const src = user.displayName?.trim() || user.email;
  const parts = src.split(/[\s@._-]+/).filter(Boolean);
  return parts.slice(0, 2).map((p) => p[0]!.toUpperCase()).join("") || "?";
}

/**
 * The new shell's frame: a constant header (persistent team switcher + Alerts +
 * account) that never changes across screens, a desktop left rail, and the
 * mobile bottom nav. The production SiteHeader/footer are hidden on /app via
 * HideOnAppShell, so this is the only chrome here.
 */
export function PreviewChrome({
  teams,
  selected,
  user,
  children,
}: {
  teams: ShellTeam[];
  selected: string;
  user: ShellUser;
  children: React.ReactNode;
}) {
  return (
    <div data-app-shell className="flex min-h-[100dvh] flex-col bg-surface">
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border bg-surface-raised/85 px-4 py-2.5 backdrop-blur-lg">
        <TeamSwitcher teams={teams} selected={selected} />
        <div className="flex items-center gap-1.5">
          <ShellAlertsButton />
          <Link
            href="/account"
            aria-label="Account"
            className="relative grid size-8 shrink-0 place-items-center overflow-hidden rounded-full bg-primary text-xs font-bold text-white ring-1 ring-border"
          >
            {user.avatarUrl ? (
              <Image
                src={user.avatarUrl}
                alt=""
                fill
                sizes="32px"
                className="object-cover"
                unoptimized
              />
            ) : (
              initialsFor(user)
            )}
          </Link>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-6xl flex-1">
        <aside className="hidden shrink-0 sm:block sm:w-52 sm:border-r sm:border-border sm:p-3">
          <PreviewSideNav />
        </aside>
        <main className="min-w-0 flex-1 px-4 pb-24 pt-4 sm:px-6 sm:pb-10">
          {children}
        </main>
      </div>

      <PreviewBottomNav />
    </div>
  );
}
