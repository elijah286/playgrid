"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Calendar,
  ClipboardList,
  Layers,
  ListChecks,
  Loader2,
  LogOut,
  MessageCircle,
  MoreHorizontal,
  Shield,
  Trophy,
  User,
  Users,
} from "lucide-react";
import { CalNavButton } from "@/features/coach-ai/CalNavButton";
import { signOutAction } from "@/app/actions/auth";

/**
 * Mobile-only footer for the play editor — mirrors PlaybookBottomNav's
 * structure (Plays · Cal · Game · More) so coaches see the same nav on
 * both surfaces. Differences vs. the playbook nav:
 *
 *   - Plays  → opens the all-plays picker IN-EDITOR (parent renders a
 *              hidden controlled PlaybookPlaySearchMenu).
 *   - More   → opens a sheet with links back to the playbook's other
 *              tabs (Roster, Calendar, Messages, Formations, Practice,
 *              Results) — the editor itself doesn't host those tabs.
 */
export function EditorBottomNav({
  playbookId,
  showCoachCal,
  available,
  isAdmin = false,
}: {
  playbookId: string;
  showCoachCal: boolean;
  available: {
    calendar: boolean;
    games: boolean;
    practicePlans: boolean;
    messages: boolean;
  };
  /** Site admin sees an extra "Site Admin" link in the More sheet. */
  isAdmin?: boolean;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const router = useRouter();

  // Prefetch the playbook page on mount so tapping "Plays" (or any
  // other tab) feels as instant as a tab toggle on the playbook page
  // itself. Next.js's automatic Link prefetching is gated by
  // viewport intersection + production mode, so explicit warming is
  // the most reliable way to get the playbook RSC into the cache
  // before the user taps. Re-runs if `playbookId` changes (rare).
  useEffect(() => {
    router.prefetch(`/playbooks/${playbookId}?tab=plays`);
    if (available.messages) {
      router.prefetch(`/playbooks/${playbookId}?tab=messages`);
    }
  }, [router, playbookId, available.messages]);

  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMoreOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [moreOpen]);

  return (
    <>
      <nav
        aria-label="Playbook sections"
        className="fixed left-0 bottom-0 z-40 flex w-screen items-stretch border-t border-border bg-surface-raised shadow-[0_-1px_0_0_rgba(0,0,0,0.02)] sm:hidden"
        style={{
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
          paddingLeft: "env(safe-area-inset-left, 0px)",
          paddingRight: "env(safe-area-inset-right, 0px)",
        }}
      >
        <NavLink
          href={`/playbooks/${playbookId}?tab=plays`}
          label="Plays"
          Icon={ListChecks}
        />
        {available.messages && (
          <NavLink
            href={`/playbooks/${playbookId}?tab=messages`}
            label="Chat"
            Icon={MessageCircle}
          />
        )}
        {showCoachCal && <CalNavButton />}
        {available.calendar && (
          <NavLink
            href={`/playbooks/${playbookId}?tab=calendar`}
            label="Calendar"
            Icon={Calendar}
          />
        )}
        <NavButton
          onClick={() => setMoreOpen(true)}
          label="More"
          Icon={MoreHorizontal}
        />
      </nav>

      {moreOpen && (
        <MoreSheet
          playbookId={playbookId}
          available={available}
          isAdmin={isAdmin}
          onClose={() => setMoreOpen(false)}
        />
      )}
    </>
  );
}

function NavButton({
  onClick,
  label,
  Icon,
  isActive,
}: {
  onClick: () => void;
  label: string;
  Icon: React.ElementType;
  isActive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={isActive ? "true" : undefined}
      className={`flex min-h-[48px] flex-1 flex-col items-center justify-center gap-1 px-1 py-1.5 text-[11px] font-semibold tracking-tight transition-all duration-100 active:scale-[0.94] active:bg-surface-inset ${
        isActive ? "text-primary" : "text-muted hover:text-foreground"
      }`}
    >
      <Icon className="size-5" aria-hidden />
      <span className="truncate">{label}</span>
    </button>
  );
}

function NavLink({
  href,
  label,
  Icon,
}: {
  href: string;
  label: string;
  Icon: React.ElementType;
}) {
  // Wrap navigation in a transition so the button can show a pending
  // visual the moment a coach taps it — even if the destination page
  // takes 1–3s to fetch and hydrate. Without this, the only
  // acknowledgment was the css :active flash that disappeared the
  // instant their finger left the screen, then a long blank gap
  // before the new page rendered.
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  return (
    <button
      type="button"
      onClick={() => {
        startTransition(() => {
          router.push(href);
        });
      }}
      aria-busy={isPending || undefined}
      className={`flex min-h-[48px] flex-1 flex-col items-center justify-center gap-1 px-1 py-1.5 text-[11px] font-semibold tracking-tight transition-all duration-100 active:scale-[0.94] active:bg-surface-inset ${
        isPending ? "text-primary" : "text-muted hover:text-foreground"
      }`}
    >
      {isPending ? (
        <Loader2 className="size-5 animate-spin" aria-hidden />
      ) : (
        <Icon className="size-5" aria-hidden />
      )}
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

function MoreSheet({
  playbookId,
  available,
  isAdmin,
  onClose,
}: {
  playbookId: string;
  available: {
    calendar: boolean;
    games: boolean;
    practicePlans: boolean;
    messages: boolean;
  };
  isAdmin: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  // Keep the sheet open with a spinner on the tapped row until the
  // navigation commits, then dismiss it — so the tap reads as "working…"
  // rather than the sheet vanishing into a blank ~1s wait. `sawPending`
  // guards against closing before the transition has actually started.
  const sawPending = useRef(false);
  useEffect(() => {
    if (isPending) {
      sawPending.current = true;
    } else if (sawPending.current) {
      sawPending.current = false;
      onClose();
    }
  }, [isPending, onClose]);

  const items: { label: string; href: string; Icon: React.ElementType }[] = [];
  if (available.calendar) {
    items.push({
      label: "Calendar",
      href: `/playbooks/${playbookId}?tab=calendar`,
      Icon: Calendar,
    });
  }
  // Messages is in the primary footer row when available, so it doesn't
  // appear here too (avoid duplication).
  items.push({
    label: "Roster",
    href: `/playbooks/${playbookId}?tab=roster`,
    Icon: Users,
  });
  items.push({
    label: "Formations",
    href: `/playbooks/${playbookId}?tab=formations`,
    Icon: Layers,
  });
  if (available.games) {
    items.push({
      label: "Results",
      href: `/playbooks/${playbookId}?tab=games`,
      Icon: Trophy,
    });
  }
  if (available.practicePlans) {
    items.push({
      label: "Practice Plans",
      href: `/playbooks/${playbookId}?tab=practice_plans`,
      Icon: ClipboardList,
    });
  }
  // Account + (admin) Site Admin live in the More sheet on every mobile
  // surface so they're reachable from anywhere without burning a
  // top-level nav slot.
  items.push({ label: "Account", href: "/account", Icon: User });
  if (isAdmin) {
    items.push({ label: "Site Admin", href: "/settings", Icon: Shield });
  }

  // Overflow popover — anchored above the More button (right-bottom),
  // sized to its content. Mirrors PlaybookBottomNav's MoreSheet.
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
        aria-label="More playbook sections"
        className="fixed right-2 z-40 w-56 animate-in slide-in-from-bottom-2 fade-in rounded-xl border border-black/10 bg-surface-raised p-1 shadow-elevated duration-150 sm:hidden"
        style={{
          // Seat the popover above the nav row (48px) AND the Cal
          // button's bubble (~12px lift via `-mt-3`). The old 52px let
          // the menu overlap the centered Cal mark on iOS.
          bottom: "calc(env(safe-area-inset-bottom, 0px) + 68px)",
        }}
      >
        {items.map((it) => {
          const pending = pendingHref === it.href;
          return (
            <button
              key={it.href}
              type="button"
              role="menuitem"
              disabled={isPending}
              onClick={() => {
                setPendingHref(it.href);
                startTransition(() => router.push(it.href));
              }}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-foreground transition-colors hover:bg-surface-inset disabled:cursor-default"
            >
              {pending ? (
                <Loader2
                  className="size-4 shrink-0 animate-spin text-primary"
                  aria-hidden
                />
              ) : (
                <it.Icon className="size-4 shrink-0" aria-hidden />
              )}
              <span className="flex-1 text-left">{it.label}</span>
            </button>
          );
        })}
        {/* Hidden, zero-size prefetch Links warm each route while the sheet
            is open so the tapped router.push resolves fast. */}
        <span className="sr-only" aria-hidden>
          {items.map((it) => (
            <Link key={it.href} href={it.href} prefetch tabIndex={-1}>
              {it.label}
            </Link>
          ))}
        </span>
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
