"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Bell, BookOpen, Calendar, CreditCard, GraduationCap, Inbox, Loader2, LogOut, MoreHorizontal, Shield, User } from "lucide-react";
import { CalNavButton } from "@/features/coach-ai/CalNavButton";
import { useInboxBadge } from "@/features/dashboard/InboxBadgeContext";
import { signOutAction } from "@/app/actions/auth";
import { useIsNativeApp } from "@/lib/native/useIsNativeApp";
import { isOwnBottomBarRoute } from "./bottomNavRoutes";

/**
 * Mobile-first bottom nav rendered at the dashboard layout level.
 * Persists across page navigations within `(dashboard)` so the user
 * never sees the toolbar disappear or flicker between routes.
 *
 * Slot layout (always 5 wide on mobile):
 *   1. Playbooks   2. Calendar*   3. Cal*   4. Inbox   5. Account / More
 *
 *   * Calendar slot only renders when team-calendar is available.
 *   * Cal only renders when the user is entitled (or admin).
 *   * Slot 5 is a direct link to /account for non-admins; for site
 *     admins it's a "More" button that opens the same small slide-up
 *     popover used by PlaybookBottomNav, exposing both Account and
 *     Site Admin.
 *
 * Active-state detection is URL-driven (pathname + ?tab=X), not state,
 * so the same component renders correctly whether you're on /home,
 * /account, /admin, etc. Hidden entirely when the route owns its own
 * bottom toolbar (playbook detail, play editor) — see isOwnBottomBarRoute.
 *
 * Visible only on mobile (`<sm`); the top `HomeTabNav` takes over on
 * tablet/desktop.
 */
export type HomeBottomNavTab = "playbooks" | "calendar" | "inbox";

export function HomeBottomNav({
  showCalendar,
  showCoachCal,
  isAdmin,
}: {
  showCalendar: boolean;
  showCoachCal: boolean;
  isAdmin: boolean;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { count: inboxCount, urgent: inboxUrgent } = useInboxBadge();
  const native = useIsNativeApp();
  const [moreOpen, setMoreOpen] = useState(false);
  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMoreOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [moreOpen]);

  // Bail when a context-specific toolbar owns the bottom of the screen
  // (editor, playbook, viewer, full-screen Cal) — see isOwnBottomBarRoute.
  const onOwnBar = isOwnBottomBarRoute(pathname);
  // While the bar is visible, flag the body so the site footer reserves
  // clearance for it (globals.css `body.has-bottom-nav`). Kept in sync per
  // route so the spacing appears/disappears exactly with the bar.
  useEffect(() => {
    if (onOwnBar) return;
    document.body.classList.add("has-bottom-nav");
    return () => document.body.classList.remove("has-bottom-nav");
  }, [onOwnBar]);
  if (onOwnBar) return null;

  // Active-state derivation. On /home the active tab is whichever
  // ?tab= search param is set (defaulting to playbooks); on /account
  // the Account slot lights up; on /admin the More button glows;
  // everywhere else, nothing is active.
  const tabParam = searchParams.get("tab");
  const homeTab: HomeBottomNavTab =
    tabParam === "calendar" || tabParam === "inbox"
      ? tabParam
      : "playbooks";
  const onHome = pathname === "/home" || pathname.startsWith("/home/");
  const onAccount = pathname === "/account" || pathname.startsWith("/account/");
  const onAdmin = pathname === "/settings" || pathname.startsWith("/settings/");

  return (
    <>
      <nav
        aria-label="Primary"
        // `left-0 w-screen` (instead of `inset-x-0`) so the toolbar
        // spans the full viewport width — including the scrollbar
        // gutter on html. Otherwise `right: 0` aligns to html's
        // content edge and a thin sliver of the page background
        // peeks through next to the toolbar where the scrollbar lives.
        className="fixed left-0 bottom-0 z-40 flex w-screen items-stretch border-t border-border bg-surface-raised shadow-[0_-1px_0_0_rgba(0,0,0,0.02)] sm:hidden"
        style={{
          // Pad up by exactly the home-indicator safe area (no extra
          // cushion) so the tab row sits right above the indicator the way
          // a native iOS UITabBar does — the inset already reserves the
          // "drag up to home" gesture zone. safe-area-inset-left/right
          // keeps tabs clear of the curved corners on iPhone Pro/Plus/Max.
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
          paddingLeft: "env(safe-area-inset-left, 0px)",
          paddingRight: "env(safe-area-inset-right, 0px)",
        }}
      >
        <NavLink
          href="/home"
          isActive={onHome && homeTab === "playbooks"}
          label="Playbooks"
          Icon={BookOpen}
        />
        {showCalendar && (
          <NavLink
            href="/home?tab=calendar"
            isActive={onHome && homeTab === "calendar"}
            label="Calendar"
            Icon={Calendar}
          />
        )}
        {showCoachCal && <CalNavButton />}
        <NavLink
          href="/home?tab=inbox"
          isActive={onHome && homeTab === "inbox"}
          label="Inbox"
          Icon={Inbox}
          badge={inboxCount > 0 ? inboxCount : undefined}
          badgeUrgent={inboxUrgent}
        />
        {/* 5th slot: a "More" popover for everyone — exposes Account,
            Sign out, and (for admins) Billing + Site Admin. Same metaphor
            as the playbook More menu so the gesture is identical, and
            Sign out stays reachable from any mobile surface. */}
        <NavButton
          isActive={onAccount || onAdmin || moreOpen}
          label="More"
          Icon={MoreHorizontal}
          onClick={() => setMoreOpen(true)}
        />
      </nav>

      {moreOpen && (
        <MorePopover
          onClose={() => setMoreOpen(false)}
          items={[
            { label: "Account", href: "/account", Icon: User },
            { label: "Learning Center", href: "/learn", Icon: GraduationCap },
            // Native-only: on-device game/practice reminders (local
            // notifications don't exist in the mobile-web build).
            ...(native
              ? [{ label: "Reminders", href: "/reminders", Icon: Bell }]
              : []),
            ...(isAdmin
              ? [
                  { label: "Billing", href: "/account?tab=billing", Icon: CreditCard },
                  { label: "Site Admin", href: "/settings", Icon: Shield },
                ]
              : []),
          ]}
        />
      )}
    </>
  );
}

function NavLink({
  href,
  isActive,
  label,
  Icon,
  badge,
  badgeUrgent,
}: {
  href: string;
  isActive: boolean;
  label: string;
  Icon: React.ElementType;
  badge?: number;
  badgeUrgent?: boolean;
}) {
  // Wrap navigation in a transition so the toolbar item can show a
  // pending visual the moment a coach taps it — even if the destination
  // pane takes 500ms+ to fetch and hydrate. Without this, the only
  // acknowledgment was the css :active flash that disappeared the
  // instant their finger left the screen, then a long blank gap before
  // the new page rendered. Mirrors EditorBottomNav.NavLink.
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const pending = isPending && !isActive;
  return (
    <button
      type="button"
      onClick={() => {
        if (isActive) return;
        startTransition(() => {
          router.push(href);
        });
      }}
      aria-current={isActive ? "page" : undefined}
      aria-busy={pending || undefined}
      className={`flex min-h-[48px] flex-1 flex-col items-center justify-center gap-1 px-1 py-1.5 text-[11px] font-semibold tracking-tight transition-all duration-100 active:scale-[0.94] active:bg-surface-inset ${
        isActive || pending ? "text-primary" : "text-muted hover:text-foreground"
      }`}
    >
      <span className="relative inline-flex">
        {pending ? (
          <Loader2 className="size-5 animate-spin" aria-hidden />
        ) : (
          <Icon className="size-5" aria-hidden />
        )}
        {typeof badge === "number" && badge > 0 && (
          <span
            className="absolute -right-2 -top-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-bold leading-none text-white ring-2 ring-surface-base"
            aria-label={`${badge} ${badgeUrgent ? "urgent" : ""} item${badge === 1 ? "" : "s"}`}
          >
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </span>
      <span className="truncate">{label}</span>
      {/* Hidden prefetch <Link> — Next.js automatically prefetches Link
       *  hrefs on viewport intersection, so keeping a 0-size Link in
       *  the tree warms the route cache for our button-driven push. */}
      <Link href={href} prefetch className="sr-only" aria-hidden tabIndex={-1}>
        {label}
      </Link>
    </button>
  );
}

function NavButton({
  isActive,
  label,
  Icon,
  onClick,
}: {
  isActive: boolean;
  label: string;
  Icon: React.ElementType;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={isActive ? "page" : undefined}
      className={`flex min-h-[48px] flex-1 flex-col items-center justify-center gap-1 px-1 py-1.5 text-[11px] font-semibold tracking-tight transition-all duration-100 active:scale-[0.94] active:bg-surface-inset ${
        isActive ? "text-primary" : "text-muted hover:text-foreground"
      }`}
    >
      <Icon className="size-5" aria-hidden />
      <span className="truncate">{label}</span>
    </button>
  );
}

function MorePopover({
  items,
  onClose,
}: {
  items: { label: string; href: string; Icon: React.ElementType }[];
  onClose: () => void;
}) {
  return (
    <>
      <button
        type="button"
        aria-label="Close"
        className="fixed inset-0 z-40 sm:hidden"
        onClick={onClose}
      />
      <div
        role="menu"
        aria-label="More options"
        className="fixed right-2 z-40 w-56 animate-in slide-in-from-bottom-2 fade-in rounded-xl border border-black/10 bg-surface-raised p-1 shadow-elevated duration-150 sm:hidden"
        style={{
          // Clear the full height of the nav row (48px) PLUS the Cal
          // button's bubble, which pokes ~12px above the row via its
          // `-mt-3` lift. At the old 52px the popover's bottom-left
          // corner overlapped the centered Cal mark on iOS; 68px seats
          // it just above the bubble with a small gap.
          bottom: "calc(env(safe-area-inset-bottom, 0px) + 68px)",
        }}
      >
        {items.map((it) => (
          <Link
            key={it.href}
            href={it.href}
            role="menuitem"
            onClick={onClose}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-foreground transition-colors hover:bg-surface-inset"
          >
            <it.Icon className="size-4 shrink-0" aria-hidden />
            <span className="flex-1 text-left">{it.label}</span>
          </Link>
        ))}
        <form action={signOutAction}>
          <button
            type="submit"
            role="menuitem"
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-foreground transition-colors hover:bg-surface-inset"
          >
            <LogOut className="size-4 shrink-0" aria-hidden />
            <span className="flex-1 text-left">Sign out</span>
          </button>
        </form>
      </div>
    </>
  );
}
