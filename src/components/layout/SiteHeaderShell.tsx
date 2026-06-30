"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserMenu } from "@/components/layout/UserMenu";
import { CoachAiLauncher } from "@/features/coach-ai/CoachAiLauncher";
import { ShareButton } from "@/components/share/ShareButton";
import { InboxBell } from "@/components/layout/InboxBell";
import { ResourcesDropdown } from "@/components/layout/ResourcesDropdown";
import { MobileNavMenu } from "@/components/layout/MobileNavMenu";
import { FeedbackTrigger } from "@/components/feedback/FeedbackTrigger";
import type { SubscriptionTier } from "@/lib/billing/entitlement";

type Props = {
  user: { id: string; email: string | null } | null;
  isAdmin: boolean;
  displayName: string | null;
  avatarUrl: string | null;
  coachAiAvailable?: boolean;
  showCoachCalPromo?: boolean;
  coachAiEvalDays: number;
  /**
   * Whether Coach Cal's photo/file attach affordance (paperclip in the chat
   * input) is visible for this user. 2026-05-21: gated behind a beta flag
   * (`coach_ai_image_upload`) while the hand-drawn play-sheet vision
   * pipeline is unreliable. Default site-wide scope is "off"; admin
   * sets "me" via the beta-features admin tab for self-only testing.
   */
  coachAiImageUploadAvailable?: boolean;
  /**
   * The user's current subscription tier. Lets non-entitled surfaces (the
   * Cal preview / upsell) distinguish a `free` user (eligible for a trial)
   * from a `coach`-paid user (must upgrade with proration, no trial). Null
   * when unauthenticated.
   */
  userTier?: SubscriptionTier | null;
  /**
   * True iff this user has ever held a Coach Pro subscription (any
   * status). Stripe refuses to grant a second trial; the preview /
   * pricing surfaces suppress trial copy when this is set so we don't
   * promise "no charge today" to someone who'd be billed immediately.
   */
  coachProTrialUsed?: boolean;
  /** Beta gate for the public Football Library. When false, the
   *  Resources dropdown's "Football library" entry is hidden. */
  footballLibraryAvailable?: boolean;
  /** League organizer — adds a "League Operations" entry to the Resources menu. */
  leagueAccess?: boolean;
  /** When false, the "Give feedback" top-nav link and mobile menu item
   *  are hidden (admin disabled the widget). */
  feedbackEnabled?: boolean;
};

// Routes where the playbook banner takes over the top of the screen on
// mobile — hide the global header there so mobile isn't stuck with two
// stacked headers. Desktop always shows both.
const PLAYBOOK_DETAIL_RE = /^\/playbooks\/[^/]+(?:\/.*)?$/;
// ...except the print sub-route. It has no playbook banner of its own —
// just a back-link row — so hiding the global header there leaves nothing
// to push content below the iOS status bar (the back button ends up under
// the clock) and removes the header the user expects. Keep it visible.
const PLAYBOOK_PRINT_RE = /^\/playbooks\/[^/]+\/print(?:\/|$)/;

export function SiteHeaderShell({ user, isAdmin, displayName, avatarUrl, coachAiAvailable, showCoachCalPromo, coachAiEvalDays, coachAiImageUploadAvailable, userTier, coachProTrialUsed, footballLibraryAvailable, leagueAccess, feedbackEnabled }: Props) {
  const pathname = usePathname();
  const hideOnMobile =
    PLAYBOOK_DETAIL_RE.test(pathname) && !PLAYBOOK_PRINT_RE.test(pathname);
  // Pricing is a top-level nav affordance on every public page — the
  // earlier homepage-only gate hid Pricing on /learn and similar surfaces
  // and coaches lost track of where to find it.
  const showPricingLink = true;

  return (
    <header
      data-site-header
      className={`sticky top-0 z-30 border-b border-border bg-surface-raised/80 backdrop-blur-lg ${
        hideOnMobile ? "hidden sm:block" : ""
      }`}
    >
      {/* Two-cluster layout:
            LEFT  = brand wordmark + site nav (Resources, Pricing) — where to go
            RIGHT = utilities + auth (Cal/Inbox/Share/Avatar, or Sign in/Get started) — what to do / who you are
          Keeping text-nav and icon-utilities in separate visual zones lets
          the eye parse the header without re-classifying mid-row, and matches
          the established pattern on every major SaaS header (Linear, Notion,
          Stripe, Vercel, GitHub). On <sm the nav row collapses behind the
          MobileNavMenu hamburger on the right; the bottom toolbar still
          owns primary app navigation for authed users. */}
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
        <div className="flex items-center gap-4 sm:gap-6">
          <Link
            href={user ? "/home" : "/"}
            aria-label="XO Gridmaker home"
            className="flex cursor-pointer items-center text-[#06255E] dark:text-foreground"
          >
            {/* Single <text> with colored <tspan>s so crawlers read the
                wordmark as one token ("xogridmaker") rather than three. The
                X (#1769FF) and O (#95CC1F) stay fixed in both themes;
                "gridmaker" inherits currentColor for dark mode.

                No `dominantBaseline` — Safari ignores both `hanging` and
                `text-before-edge` and falls back to alphabetic, so we
                pre-bake that assumption: y=210 puts the alphabetic
                baseline at ~2/3 down the 320-unit viewBox, leaving ~75
                units above for ascenders (`d`, `k`) and ~30 below for
                descenders (`g`). */}
            <svg
              viewBox="0 0 1600 320"
              role="img"
              aria-label="XO Gridmaker"
              className="h-8 w-auto sm:h-9"
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
          <nav
            aria-label="Primary"
            className="hidden items-center gap-5 sm:flex"
          >
            <ResourcesDropdown
              footballLibraryAvailable={footballLibraryAvailable ?? false}
              leagueAccess={leagueAccess ?? false}
            />
            {!user && showPricingLink && (
              <Link
                href="/pricing"
                data-web-only
                className="whitespace-nowrap text-sm text-muted hover:text-foreground transition-colors"
              >
                Pricing
              </Link>
            )}
            {feedbackEnabled && <FeedbackTrigger />}
          </nav>
        </div>
        {user ? (
          <div className="flex items-center gap-2 sm:gap-4">
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
                  imageUploadAvailable={coachAiImageUploadAvailable ?? false}
                  userTier={userTier ?? null}
                  coachProTrialUsed={coachProTrialUsed ?? false}
                />
              </div>
            )}
            {/* Global inbox bell — desktop only here. Mobile non-playbook
                surfaces get the inbox tab in HomeBottomNav; mobile in-
                playbook surfaces get a bell in the playbook chrome (where
                this SiteHeader is hidden). */}
            <div className="hidden sm:block">
              <InboxBell />
            </div>
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
            <MobileNavMenu authed footballLibraryAvailable={footballLibraryAvailable} leagueAccess={leagueAccess} feedbackEnabled={feedbackEnabled} />
          </div>
        ) : (
          // Anonymous right cluster: just auth affordances on desktop. The
          // bare ShareButton icon is intentionally NOT rendered on anonymous
          // public pages — first-time visitors have no content to share and
          // the icon's purpose isn't self-evident. On mobile the hamburger
          // (MobileNavMenu) absorbs Resources + Pricing + a Get-started CTA;
          // Sign in stays visible as the quickest re-entry for returning
          // coaches.
          <div className="flex items-center gap-3">
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
            <MobileNavMenu authed={false} footballLibraryAvailable={footballLibraryAvailable} feedbackEnabled={feedbackEnabled} />
          </div>
        )}
      </div>
    </header>
  );
}
