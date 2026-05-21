"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserMenu } from "@/components/layout/UserMenu";
import { CoachAiLauncher } from "@/features/coach-ai/CoachAiLauncher";
import { ShareButton } from "@/components/share/ShareButton";

type Props = {
  user: { id: string; email: string | null } | null;
  isAdmin: boolean;
  displayName: string | null;
  avatarUrl: string | null;
  coachAiAvailable?: boolean;
  showCoachCalPromo?: boolean;
  coachAiEvalDays: number;
};

// Routes where the playbook banner takes over the top of the screen on
// mobile — hide the global header there so mobile isn't stuck with two
// stacked headers. Desktop always shows both.
const PLAYBOOK_DETAIL_RE = /^\/playbooks\/[^/]+(?:\/.*)?$/;

export function SiteHeaderShell({ user, isAdmin, displayName, avatarUrl, coachAiAvailable, showCoachCalPromo, coachAiEvalDays }: Props) {
  const pathname = usePathname();
  const hideOnMobile = PLAYBOOK_DETAIL_RE.test(pathname);
  // Pricing link is a landing-page-only nav affordance. Everywhere else
  // we keep the header minimal.
  const showPricingLink = pathname === "/";

  return (
    <header
      data-site-header
      className={`sticky top-0 z-30 border-b border-border bg-surface-raised/80 backdrop-blur-lg ${
        hideOnMobile ? "hidden sm:block" : ""
      }`}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
        <Link
          href={user ? "/home" : "/"}
          aria-label="XO Gridmaker home"
          className="flex cursor-pointer items-center text-[#06255E] dark:text-foreground"
        >
          {/* Single <text> with colored <tspan>s so crawlers read the
              wordmark as one token ("xogridmaker") rather than three. The
              X (#1769FF) and O (#95CC1F) stay fixed in both themes;
              "gridmaker" inherits currentColor for dark mode.

              `text-before-edge` pegs y to the top of the text bounding
              box (above ascenders). Safari treats the older `hanging`
              value as the alphabetic baseline, which clipped the tops
              of `d`/`k`/`r`. */}
          <svg
            viewBox="0 0 1600 320"
            role="img"
            aria-label="XO Gridmaker"
            className="h-8 w-auto sm:h-9"
          >
            <text
              y="70"
              fontFamily='"DejaVu Sans", Arial, sans-serif'
              fontSize="150"
              fontStyle="oblique"
              fontWeight="700"
              dominantBaseline="text-before-edge"
            >
              <tspan x="278.24" fill="#1769FF">x</tspan><tspan x="378.68" fill="#95CC1F">o</tspan><tspan x="473.44" fill="currentColor">gridmaker</tspan>
            </text>
          </svg>
        </Link>
        {user ? (
          <div className="flex items-center gap-2">
            {/* Cal launcher: trigger button visible only on desktop.
                The bottom toolbar's CalNavButton takes over on mobile.
                The launcher stays mounted on every viewport (the
                wrapper hides only the trigger via `display: none`) so
                its `coach-cal:open` window listener stays alive — the
                chat panel renders via createPortal so the hidden
                wrapper doesn't suppress it. */}
            {(coachAiAvailable || showCoachCalPromo) && (
              <div className="hidden sm:block">
                <CoachAiLauncher
                  isAdmin={isAdmin}
                  entitled={coachAiAvailable ?? false}
                  acceptGlobalCommands
                  evalDays={coachAiEvalDays}
                />
              </div>
            )}
            <ShareButton userId={user.id} />
            {/* Account moves to the bottom toolbar on mobile (slot 5).
                Desktop keeps the avatar + thin divider treatment. */}
            <div className="hidden sm:flex sm:items-center sm:gap-2">
              <span className="h-5 w-px bg-border" aria-hidden />
              <UserMenu
                email={user.email ?? ""}
                displayName={displayName}
                avatarUrl={avatarUrl}
                isAdmin={isAdmin}
              />
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 sm:gap-4">
            {/* Mobile shows Pricing + Sign in (no Share, no Get started).
                Pricing is muted-weight so Sign in remains the primary CTA,
                but visible enough that pricing isn't hidden behind a menu.
                Desktop adds Share and the Get started button. */}
            {showPricingLink && (
              <Link
                href="/pricing"
                data-web-only
                className="whitespace-nowrap text-sm text-muted hover:text-foreground transition-colors"
              >
                Pricing
              </Link>
            )}
            <div className="hidden sm:block">
              <ShareButton userId={null} />
            </div>
            <Link
              href="/login"
              className="whitespace-nowrap text-sm font-semibold text-foreground hover:text-primary transition-colors"
            >
              Sign in
            </Link>
            <Link
              href="/login?mode=signup"
              className="hidden rounded-lg bg-primary px-3.5 py-1.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-hover sm:inline-flex"
            >
              Get started
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}
