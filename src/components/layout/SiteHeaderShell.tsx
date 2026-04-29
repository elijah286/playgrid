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
          aria-label="xogridmaker home"
          className="flex cursor-pointer items-center"
        >
          <Image
            src="/brand/xogridmaker_wordmark.svg"
            alt="xogridmaker"
            width={200}
            height={36}
            priority
            className="h-9 w-auto"
          />
        </Link>
        {user ? (
          <div className="flex items-center gap-2">
            {(coachAiAvailable || showCoachCalPromo) && (
              <CoachAiLauncher isAdmin={isAdmin} entitled={coachAiAvailable ?? false} />
            )}
            <ShareButton userId={user.id} />
            <UserMenu
              email={user.email ?? ""}
              displayName={displayName}
              avatarUrl={avatarUrl}
              isAdmin={isAdmin}
            />
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <Link
              href="/learn-more"
              className="text-sm text-muted hover:text-foreground transition-colors"
            >
              Tour
            </Link>
            <Link
              href="/coach-cal"
              className="text-sm text-muted hover:text-foreground transition-colors"
            >
              Coach Cal
            </Link>
            {showPricingLink && (
              <Link
                href="/pricing"
                data-web-only
                className="text-sm text-muted hover:text-foreground transition-colors"
              >
                Pricing
              </Link>
            )}
            <ShareButton userId={null} />
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
