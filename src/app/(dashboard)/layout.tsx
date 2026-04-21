import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { FeedbackWidget } from "@/components/feedback/FeedbackWidget";
import { getFeedbackWidgetEnabled } from "@/lib/site/feedback-config";
import { userHasCreatedPlayAction } from "@/app/actions/plays";

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

  const [feedbackEnabled, hasCreatedPlay] = await Promise.all([
    getFeedbackWidgetEnabled(),
    userHasCreatedPlayAction(),
  ]);

  return (
    <div className="min-h-full">
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
      {feedbackEnabled && <FeedbackWidget hasCreatedPlay={hasCreatedPlay} />}
    </div>
  );
}
