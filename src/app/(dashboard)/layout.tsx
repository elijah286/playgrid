import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { FeedbackWidget } from "@/components/feedback/FeedbackWidget";
import { TimeOnSiteTracker } from "@/components/TimeOnSiteTracker";
import { getFeedbackWidgetEnabled } from "@/lib/site/feedback-config";
import { userHasCreatedPlayAction } from "@/app/actions/plays";
import { getExpirationNotice } from "@/lib/billing/expiration-notice";
import { ExpirationBanner } from "@/components/billing/ExpirationBanner";

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

  if (!user) {
    redirect("/login");
  }

  const [feedbackEnabled, hasCreatedPlay, expirationNotice] = await Promise.all([
    getFeedbackWidgetEnabled(),
    userHasCreatedPlayAction(),
    getExpirationNotice(),
  ]);

  return (
    <div className="min-h-full">
      {expirationNotice && <ExpirationBanner notice={expirationNotice} />}
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
      <TimeOnSiteTracker />
      {feedbackEnabled && <FeedbackWidget hasCreatedPlay={hasCreatedPlay} />}
    </div>
  );
}
