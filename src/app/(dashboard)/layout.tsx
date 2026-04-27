import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { FeedbackWidget } from "@/components/feedback/FeedbackWidget";
import { TimeOnSiteTracker } from "@/components/TimeOnSiteTracker";
import { getFeedbackWidgetSettings } from "@/lib/site/feedback-config";
import { userHasCreatedPlayAction } from "@/app/actions/plays";
import { getExpirationNotice } from "@/lib/billing/expiration-notice";
import { ExpirationBanner } from "@/components/billing/ExpirationBanner";
import { CoachAiLauncher } from "@/features/coach-ai/CoachAiLauncher";
import {
  getBetaFeatures,
  isBetaFeatureAvailable,
} from "@/lib/site/beta-features-config";

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

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [feedbackSettings, hasCreatedPlay, expirationNotice, betaFeatures, profile] = await Promise.all([
    getFeedbackWidgetSettings(),
    user ? userHasCreatedPlayAction() : Promise.resolve(false),
    user ? getExpirationNotice() : Promise.resolve(null),
    getBetaFeatures(),
    user
      ? supabase.from("profiles").select("role").eq("id", user.id).single()
      : Promise.resolve({ data: null }),
  ]);

  const isAdmin = (profile as { data: { role?: string } | null }).data?.role === "admin";
  const coachAiAvailable =
    !!user &&
    isBetaFeatureAvailable(betaFeatures.coach_ai, { isAdmin, isEntitled: true });

  return (
    <div className="min-h-full">
      {expirationNotice && <ExpirationBanner notice={expirationNotice} />}
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
      <TimeOnSiteTracker />
      {feedbackSettings.enabled && (
        <FeedbackWidget
          hasCreatedPlay={hasCreatedPlay}
          touchEnabled={feedbackSettings.touchEnabled}
        />
      )}
      {coachAiAvailable && <CoachAiLauncher />}
    </div>
  );
}
