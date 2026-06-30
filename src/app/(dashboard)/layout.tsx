import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { getRequestUser } from "@/lib/supabase/request-user";
import { FeedbackWidget } from "@/components/feedback/FeedbackWidget";
import { TimeOnSiteTracker } from "@/components/TimeOnSiteTracker";
import { getFeedbackWidgetSettings } from "@/lib/site/feedback-config";
import { userHasCreatedPlayAction } from "@/app/actions/plays";
import { getExpirationNotice } from "@/lib/billing/expiration-notice";
import { ExpirationBanner } from "@/components/billing/ExpirationBanner";
import { NameCapturePrompt } from "@/components/account/NameCapturePrompt";
import { TermsAcceptancePrompt } from "@/components/account/TermsAcceptancePrompt";
import { termsAcceptanceNeeded } from "@/lib/auth/terms";
import { OfflineAutoRefreshMount } from "@/components/offline/OfflineAutoRefreshMount";
import { NativeWelcomeSpotlight } from "@/components/native/NativeWelcomeSpotlight";
import { RatingNudge } from "@/components/native/RatingNudge";
import { userSignedInWithApple } from "@/lib/auth/provider";

// Auth is NOT enforced here. Anon visitors may reach example-playbook
// pages under this layout (e.g. /playbooks/[id] for a public example);
// pages that require auth call `redirect("/login")` themselves.
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!hasSupabaseEnv()) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-10">
        <p className="text-sm text-muted">
          Add Supabase environment variables to use authenticated playbooks.
        </p>
        <div className="mt-6">{children}</div>
      </div>
    );
  }

  // Shared request-scoped auth check (see request-user.ts) — reuses the same
  // getUser() the root layout already made for this render instead of issuing
  // another. Time-bound inside the helper: on timeout we render the
  // logged-out shell and the next request retries the refresh.
  const authResult = await getRequestUser();
  const user = authResult.kind === "ok" ? authResult.user : null;

  const [
    feedbackSettings,
    hasCreatedPlay,
    expirationNotice,
    nameCaptureNeeded,
    termsNeeded,
  ] = await Promise.all([
    getFeedbackWidgetSettings(),
    user ? userHasCreatedPlayAction() : Promise.resolve(false),
    user ? getExpirationNotice() : Promise.resolve(null),
    user ? checkNameCaptureNeeded(user) : Promise.resolve(false),
    user ? checkTermsAcceptanceNeeded(user) : Promise.resolve(false),
  ]);

  return (
    // No `overflow-x-hidden` anywhere in this subtree — that property
    // creates a containing block for sticky descendants, which would
    // pin the playbook page's sticky banner at top-14 relative to the
    // wrapper instead of the viewport (a ~60-100px ghost gap below the
    // site header). The body has `overflow-x: clip` (set in globals
    // CSS via `<body class="...overflow-x-hidden">`) which prevents
    // horizontal scroll without becoming a sticky containing block.
    //
    // InboxBadgeProvider now lives at the root layout so the bell can
    // mount in the editor chrome too — see src/app/layout.tsx.
    <div className="min-h-full">
      {expirationNotice && <ExpirationBanner notice={expirationNotice} />}
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
      <TermsAcceptancePrompt needed={termsNeeded} />
      {/* Defer the (dismissible) name prompt until the (blocking) terms gate is
          cleared, so a new user never sees both modals stacked. */}
      <NameCapturePrompt needed={nameCaptureNeeded && !termsNeeded} />
      {user && <NativeWelcomeSpotlight />}
      {user && <RatingNudge />}
      <TimeOnSiteTracker />
      {feedbackSettings.enabled && (
        <FeedbackWidget
          hasCreatedPlay={hasCreatedPlay}
          touchEnabled={feedbackSettings.touchEnabled}
        />
      )}
      {/* The global mobile bottom nav is mounted once in the root layout
          (GlobalBottomNav) so it persists across every route — including
          resource pages like /learn that live outside this group. */}
      {user && <OfflineAutoRefreshMount />}
    </div>
  );
}

/** Returns true when this user should be prompted to set a real name —
 *  i.e. profiles.display_name is null OR equals their auth email. The
 *  email-as-display-name case is the legacy default produced by the
 *  pre-fix handle_new_user trigger; treating it as "not set" lets the
 *  one-time prompt rescue those accounts.
 *
 *  Apple sign-in is excluded unconditionally: App Store Guideline 4.8
 *  forbids re-requesting the name Apple's Authentication Services already
 *  provides. We capture that name at sign-in (appleAuth.ts → AuthFlow), and
 *  even when the user declines to share it we must never re-prompt — so Apple
 *  users never see the name-capture modal regardless of their stored name. */
async function checkNameCaptureNeeded(user: User): Promise<boolean> {
  if (userSignedInWithApple(user)) return false;

  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();
  const name = (data?.display_name ?? "").trim();
  if (!name) return true;
  const email = user.email ?? null;
  if (email && name.toLowerCase() === email.toLowerCase()) return true;
  return false;
}

/** Returns true when this user still owes an affirmative Terms/EULA acceptance
 *  (App Store Guideline 1.2) — i.e. profiles.terms_accepted_at is NULL. Email
 *  signups set it via the AuthFlow checkbox; OAuth signups (which skip that
 *  form) are caught by the blocking TermsAcceptancePrompt. Existing users were
 *  grandfathered at migration time, so only new signups read as needing it. */
async function checkTermsAcceptanceNeeded(user: User): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("terms_accepted_at")
    .eq("id", user.id)
    .maybeSingle();
  return termsAcceptanceNeeded(
    data?.terms_accepted_at as string | null | undefined,
  );
}
