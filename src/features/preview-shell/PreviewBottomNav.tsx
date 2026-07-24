"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Calendar, Home, Library, MessageCircle, Sparkles } from "lucide-react";
import { openCoachCal } from "@/features/coach-ai/openCoachCal";
import { ShellAccountMenu } from "@/features/preview-shell/ShellAccountMenu";
import type { ShellUser } from "@/features/preview-shell/types";

/**
 * Mobile footer:  Home · Calendar · Cal · Messages · More
 * Desktop sidebar: Home · Playbooks · Calendar · Messages (Cal is the header).
 * There is no "Team" tab: a team is entered from Home (its shelf) or the
 * Playbooks library. "Playbooks" is desktop-only (sidebarOnly) — on mobile the
 * library is reached from Home's "See all", keeping the footer to five slots.
 * "More" opens the account + everything-else menu (the footer's overflow).
 */
type Slot = {
  href: string;
  label: string;
  Icon: React.ElementType;
  match: (p: string) => boolean;
  center?: boolean;
  /** Shown in the desktop sidebar only, never in the mobile footer. */
  sidebarOnly?: boolean;
};

const SLOTS: Slot[] = [
  { href: "/app/home", label: "Home", Icon: Home, match: (p) => p === "/app/home" || p === "/app" },
  { href: "/app/playbooks", label: "Playbooks", Icon: Library, match: (p) => p.startsWith("/app/playbooks"), sidebarOnly: true },
  { href: "/app/schedule", label: "Calendar", Icon: Calendar, match: (p) => p.startsWith("/app/schedule") },
  { href: "/coach-cal/chat", label: "Cal", Icon: Sparkles, match: () => false, center: true },
  { href: "/app/messages", label: "Messages", Icon: MessageCircle, match: (p) => p.startsWith("/app/messages") },
];

export function PreviewBottomNav({
  isCoach,
  user,
  footballLibraryAvailable,
}: {
  isCoach: boolean;
  user: ShellUser;
  footballLibraryAvailable: boolean;
}) {
  const pathname = usePathname() ?? "/app/home";
  // Focused thread (Workstream 4): hide the bottom bar while a single team's
  // message thread is open (/app/messages/<teamId>) so the composer gets full
  // height and the thread reads as a focused view. The hub (/app/messages)
  // keeps the bar. The thread's own header has a "‹ Messages" back link.
  if (/^\/app\/messages\/[^/]+/.test(pathname)) return null;
  // Role-adaptive (Workstream 1): Cal is a coaching tool, so viewer-only users
  // (players/parents — coach on no team) don't get the center Cal slot; the
  // remaining four items re-center evenly. Everything else is identical, so a
  // user's bar never reorders across screens — only differs by who they are.
  const slots = SLOTS.filter((s) => !s.sidebarOnly && (isCoach || !s.center));
  return (
    <nav
      aria-label="Primary"
      // z-40 (not z-30) so the mobile Coach Cal half-sheet (z-30) slides up
      // BEHIND the footer as designed, matching the production bottom navs.
      className="fixed bottom-0 left-0 z-40 flex w-screen items-stretch border-t border-border bg-surface-raised sm:hidden"
      style={{
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        paddingLeft: "env(safe-area-inset-left, 0px)",
        paddingRight: "env(safe-area-inset-right, 0px)",
      }}
    >
      {slots.map((s) => {
        const active = s.match(pathname);
        if (s.center) {
          // Opens Coach Cal as a floating/dockable dialog over the current
          // screen (not full-screen), so the coach keeps the main view.
          return (
            <button
              key={s.href}
              type="button"
              onClick={() => openCoachCal()}
              aria-label={s.label}
              className="flex min-h-[48px] flex-1 flex-col items-center justify-center gap-1 px-1 py-1.5 text-[11px] font-semibold text-muted"
            >
              <span className="-mt-4 grid size-11 place-items-center rounded-full bg-gradient-to-br from-primary to-primary-dark text-white shadow-card">
                <s.Icon className="size-5" aria-hidden />
              </span>
              <span className="truncate">{s.label}</span>
            </button>
          );
        }
        return (
          <Link
            key={s.href}
            href={s.href}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-[48px] flex-1 flex-col items-center justify-center gap-1 px-1 py-1.5 text-[11px] font-semibold transition-colors ${
              active ? "text-primary" : "text-muted hover:text-foreground"
            }`}
          >
            <s.Icon className="size-5" aria-hidden />
            <span className="truncate">{s.label}</span>
          </Link>
        );
      })}
      {/* Last slot: "More" — the account + everything-else menu (opens upward).
          Reuses ShellAccountMenu so the destinations never drift from the
          desktop avatar menu. Replaces the old "Team" tab. */}
      <ShellAccountMenu
        user={user}
        footballLibraryAvailable={footballLibraryAvailable}
        variant="more"
      />
    </nav>
  );
}

/** Desktop primary nav list — rendered inside the sidebar's own <nav> in
 *  PreviewChrome (Coach Cal is a prominent CTA there, not a list item). */
export function PreviewSideNav() {
  const pathname = usePathname() ?? "/app/home";
  const linkCls = (active: boolean) =>
    `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
      active
        ? "bg-primary-light text-primary-dark"
        : "text-muted hover:bg-surface-inset hover:text-foreground"
    }`;
  return (
    <div className="flex flex-col gap-1">
      {SLOTS.filter((s) => !s.center).map((s) => {
        const active = s.match(pathname);
        return (
          <Link
            key={s.href}
            href={s.href}
            aria-current={active ? "page" : undefined}
            className={linkCls(active)}
          >
            <s.Icon className="size-5" aria-hidden />
            {s.label}
          </Link>
        );
      })}
      {/* No "Alerts" here: the header bell (ShellAlertsButton) is the single
          entry point for notifications (Decision F), so the sidebar doesn't
          duplicate it. */}
    </div>
  );
}
