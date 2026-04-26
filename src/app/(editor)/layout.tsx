import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { FeedbackWidget } from "@/components/feedback/FeedbackWidget";
import { TimeOnSiteTracker } from "@/components/TimeOnSiteTracker";
import { getFeedbackWidgetSettings } from "@/lib/site/feedback-config";
import { userHasCreatedPlayAction } from "@/app/actions/plays";

// Auth is not enforced at the layout level — anon visitors may reach
// the play editor when the play belongs to a public example playbook.
// Pages enforce auth themselves if they require it.
export default async function EditorLayout({ children }: { children: React.ReactNode }) {
  if (!hasSupabaseEnv()) {
    return <div className="mx-auto max-w-6xl px-6 py-8">{children}</div>;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [feedbackSettings, hasCreatedPlay] = await Promise.all([
    getFeedbackWidgetSettings(),
    user ? userHasCreatedPlayAction() : Promise.resolve(false),
  ]);

  return (
    <div className="flex min-h-full flex-col bg-surface-inset">
      <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col px-6 py-5">
        {children}
      </div>
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
