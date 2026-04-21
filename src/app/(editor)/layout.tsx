import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { FeedbackWidget } from "@/components/feedback/FeedbackWidget";
import { getFeedbackWidgetEnabled } from "@/lib/site/feedback-config";

export default async function EditorLayout({ children }: { children: React.ReactNode }) {
  if (!hasSupabaseEnv()) {
    return <div className="mx-auto max-w-6xl px-6 py-8">{children}</div>;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const feedbackEnabled = await getFeedbackWidgetEnabled();

  return (
    <div className="flex min-h-full flex-col bg-surface-inset">
      <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col px-6 py-5">
        {children}
      </div>
      {feedbackEnabled && <FeedbackWidget />}
    </div>
  );
}
