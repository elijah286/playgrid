import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { listTutorialProgress } from "@/lib/data/tutorial-progress";
import { getTutorialLaunchOptions } from "@/lib/data/tutorial-launch";
import { TUTORIAL_LIST } from "@/features/tutorials/tutorials";
import type { TutorialStatus } from "@/features/tutorials/engine/types";
import { LessonCard } from "./LessonCard";

export const metadata: Metadata = {
  title: "Learning Center · XO Gridmaker",
  description: "Guided tutorials for the XO Gridmaker play editor.",
};

export default async function LearningCenterPage() {
  if (!hasSupabaseEnv()) redirect("/login");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [progress, launchOptions] = await Promise.all([
    listTutorialProgress(),
    getTutorialLaunchOptions(),
  ]);
  const byId = new Map(progress.map((p) => [p.tutorialId, p]));

  // Find the lesson that's most usefully "default open": the one
  // already in progress, or the first one if nothing's been started.
  const firstInProgressId =
    TUTORIAL_LIST.find((t) => byId.get(t.id)?.status === "in_progress")?.id ??
    TUTORIAL_LIST[0]?.id;

  return (
    <article className="mx-auto max-w-2xl pb-24 text-foreground">
      <header className="mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight">
          Learning Center
        </h1>
        <p className="mt-1.5 text-sm text-muted">
          Guided walkthroughs of the most-used flows. Take them in any order.
        </p>
      </header>

      <ul className="flex flex-col gap-2.5">
        {TUTORIAL_LIST.map((t) => {
          const status: TutorialStatus =
            byId.get(t.id)?.status ?? "not_started";
          return (
            <LessonCard
              key={t.id}
              title={t.title}
              summary={t.summary}
              status={status}
              defaultOpen={t.id === firstInProgressId}
              launchTutorialId={t.id}
              launchOptions={launchOptions}
            />
          );
        })}

        {/* Placeholders for tutorials we're actively planning. Surfaced
            so coaches know what's coming and can come back to the
            Learning Center as the catalog grows. Each lands as a full
            interactive lesson when ready — drop `comingSoon` and add
            it to TUTORIAL_LIST. */}
      </ul>
    </article>
  );
}
