"use client";

import Image from "next/image";
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
};

// Routes where the playbook banner takes over the top of the screen on
// mobile — hide the global header there so mobile isn't stuck with two
// stacked headers. Desktop always shows both.
const PLAYBOOK_DETAIL_RE = /^\/playbooks\/[^/]+(?:\/.*)?$/;

export function SiteHeaderShell({ user, isAdmin, displayName, avatarUrl, coachAiAvailable, showCoachCalPromo }: Props) {
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
          className="flex cursor-pointer items-center"
        >
          <Image
            src="/brand/xogridmaker_wordmark.svg"
            alt="XO Gridmaker"
            width={200}
            height={36}
            priority
            className="h-9 w-auto"
          />
        </Link>
        {user ? (
          <div className="flex items-center gap-2">
            {(coachAiAvailable || showCoachCalPromo) && (
              <CoachAiLauncher
                isAdmin={isAdmin}
                entitled={coachAiAvailable ?? false}
                acceptGlobalCommands
              />
            )}
            <ShareButton userId={user.id} />
            {/* Thin divider separates "things I can do" (Coach Cal,
                Share) from "me" (avatar) — same trick Linear and
                Stripe Dashboard use to group action vs. account. */}
            <span className="mx-1 h-5 w-px bg-border" aria-hidden />
            <UserMenu
              email={user.email ?? ""}
              displayName={displayName}
              avatarUrl={avatarUrl}
              isAdmin={isAdmin}
            />
          </div>
        ) : (
          <div className="flex items-center gap-4">
            {/* Mobile collapses to just logo + Get started. Desktop shows
                a lightweight nav: Pricing, Share, Sign in. Tour was removed
                because it just anchors down to a section on the same page —
                the page scroll already exposes it, and dropping it lets
                "Get started" hold more visual weight against secondary
                items. */}
            {showPricingLink && (
              <Link
                href="/pricing"
                data-web-only
                className="hidden text-sm text-muted hover:text-foreground transition-colors sm:inline"
              >
                Pricing
              </Link>
            )}
            <div className="hidden sm:block">
              <ShareButton userId={null} />
            </div>
            <Link
              href="/login"
              className="text-sm font-semibold text-foreground hover:text-primary transition-colors"
            >
              Sign in
            </Link>
            <Link
              href="/login?mode=signup"
              className="rounded-lg bg-primary px-3.5 py-1.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-hover"
            >
              Get started
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}
