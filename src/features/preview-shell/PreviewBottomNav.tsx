"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Calendar, Home, MessageCircle, Sparkles, Users } from "lucide-react";

/**
 * The one stable footer of the new shell — identical on every screen:
 *   Home · Schedule · Cal · Messages · Team
 * Nothing moves or changes meaning across the old lobby↔team boundary. The
 * team-only surfaces (Plays/Roster/…) live INSIDE Team, not in a global "More".
 */
type Slot = {
  href: string;
  label: string;
  Icon: React.ElementType;
  match: (p: string) => boolean;
  center?: boolean;
};

const SLOTS: Slot[] = [
  { href: "/app/home", label: "Home", Icon: Home, match: (p) => p === "/app/home" || p === "/app" },
  { href: "/app/schedule", label: "Schedule", Icon: Calendar, match: (p) => p.startsWith("/app/schedule") },
  { href: "/coach-cal/chat", label: "Cal", Icon: Sparkles, match: () => false, center: true },
  { href: "/app/messages", label: "Messages", Icon: MessageCircle, match: (p) => p.startsWith("/app/messages") },
  { href: "/app/team", label: "Team", Icon: Users, match: (p) => p.startsWith("/app/team") },
];

export function PreviewBottomNav() {
  const pathname = usePathname() ?? "/app/home";
  return (
    <nav
      aria-label="Primary"
      className="fixed bottom-0 left-0 z-30 flex w-screen items-stretch border-t border-border bg-surface-raised sm:hidden"
      style={{
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        paddingLeft: "env(safe-area-inset-left, 0px)",
        paddingRight: "env(safe-area-inset-right, 0px)",
      }}
    >
      {SLOTS.map((s) => {
        const active = s.match(pathname);
        if (s.center) {
          return (
            <Link
              key={s.href}
              href={s.href}
              aria-label={s.label}
              className="flex min-h-[48px] flex-1 flex-col items-center justify-center gap-1 px-1 py-1.5 text-[11px] font-semibold text-muted"
            >
              <span className="-mt-4 grid size-11 place-items-center rounded-full bg-gradient-to-br from-primary to-primary-dark text-white shadow-card">
                <s.Icon className="size-5" aria-hidden />
              </span>
              <span className="truncate">{s.label}</span>
            </Link>
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
      <Link
        href="/app/alerts"
        aria-current={pathname.startsWith("/app/alerts") ? "page" : undefined}
        className={linkCls(pathname.startsWith("/app/alerts"))}
      >
        <Bell className="size-5" aria-hidden />
        Alerts
      </Link>
    </div>
  );
}
