import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { FeedbackWidget } from "@/components/feedback/FeedbackWidget";
import { TimeOnSiteTracker } from "@/components/TimeOnSiteTracker";
import { getFeedbackWidgetSettings } from "@/lib/site/feedback-config";
import { userHasCreatedPlayAction } from "@/app/actions/plays";
import { getExpirationNotice } from "@/lib/billing/expiration-notice";
import { ExpirationBanner } from "@/components/billing/ExpirationBanner";
import { NameCapturePrompt } from "@/components/account/NameCapturePrompt";

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

  const [feedbackSettings, hasCreatedPlay, expirationNotice, nameCaptureNeeded] =
    await Promise.all([
      getFeedbackWidgetSettings(),
      user ? userHasCreatedPlayAction() : Promise.resolve(false),
      user ? getExpirationNotice() : Promise.resolve(null),
      user ? checkNameCaptureNeeded(user.id, user.email ?? null) : Promise.resolve(false),
    ]);

  return (
    <div className="min-h-full">
      {expirationNotice && <ExpirationBanner notice={expirationNotice} />}
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
      <NameCapturePrompt needed={nameCaptureNeeded} />
      <TimeOnSiteTracker />
      {feedbackSettings.enabled && (
        <FeedbackWidget
          hasCreatedPlay={hasCreatedPlay}
          touchEnabled={feedbackSettings.touchEnabled}
        />
      )}
    </div>
  );
}

/** Returns true when this user should be prompted to set a real name —
 *  i.e. profiles.display_name is null OR equals their auth email. The
 *  email-as-display-name case is the legacy default produced by the
 *  pre-fix handle_new_user trigger; treating it as "not set" lets the
 *  one-time prompt rescue those accounts. */
async function checkNameCaptureNeeded(
  userId: string,
  email: string | null,
): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", userId)
    .maybeSingle();
  const name = (data?.display_name ?? "").trim();
  if (!name) return true;
  if (email && name.toLowerCase() === email.toLowerCase()) return true;
  return false;
}
