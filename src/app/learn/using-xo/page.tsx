import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { listTutorialProgress } from "@/lib/data/tutorial-progress";
import { getTutorialLaunchOptions } from "@/lib/data/tutorial-launch";
import { TUTORIAL_LIST } from "@/features/tutorials/tutorials";
import type { TutorialStatus } from "@/features/tutorials/engine/types";
import { withFullContext } from "@/lib/seo/ld-json";
import { LessonCard } from "./LessonCard";

export const metadata: Metadata = {
  title: { absolute: "Using XO Gridmaker · Learning Center" },
  description:
    "Guided tutorials for the XO Gridmaker play editor — designing plays, building playbooks, sharing with your team, and game-day basics.",
  alternates: { canonical: "/learn/using-xo" },
  openGraph: {
    title: "Using XO Gridmaker — Learning Center",
    description:
      "Guided tutorials for designing plays, building playbooks, and sharing with your team.",
    url: "/learn/using-xo",
    type: "website",
  },
};

const breadcrumbLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: "/" },
    { "@type": "ListItem", position: 2, name: "Learn", item: "/learn" },
    { "@type": "ListItem", position: 3, name: "Using XO Gridmaker", item: "/learn/using-xo" },
  ],
};

export default async function UsingXoPage() {
  // Public page — no auth gate. Authed users get their tutorial progress
  // + per-playbook launch options; anonymous visitors see the same lesson
  // catalog with sign-in CTAs instead of launchers.
  let user: { id: string } | null = null;
  if (hasSupabaseEnv()) {
    const supabase = await createClient();
    const auth = await supabase.auth.getUser();
    user = auth.data.user ?? null;
  }

  const [progress, launchOptions] = user
    ? await Promise.all([listTutorialProgress(), getTutorialLaunchOptions()])
    : [[], []];

  const byId = new Map(progress.map((p) => [p.tutorialId, p]));
  const firstInProgressId =
    TUTORIAL_LIST.find((t) => byId.get(t.id)?.status === "in_progress")?.id ??
    TUTORIAL_LIST[0]?.id;

  return (
    <article className="mx-auto max-w-2xl px-6 py-10 text-foreground">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(withFullContext(breadcrumbLd)) }}
      />
      <header className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          Resources
        </p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight">
          App tutorials
        </h1>
        <p className="mt-2 text-sm text-muted">
          Interactive walkthroughs of the most-used flows in the XO Gridmaker
          editor. Take them in any order. Anonymous visitors can read the
          summaries; sign in to launch a tutorial inside one of your playbooks.
        </p>
      </header>

      {!user ? (
        <div className="mb-5 rounded-xl border border-border bg-surface-raised p-4">
          <p className="text-sm text-foreground">
            <strong>Sign in to launch tutorials.</strong> Each tutorial drops
            into the play editor on a real (or example) playbook so every step
            has something to click.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href="/login?mode=signup"
              className="inline-flex rounded-lg bg-primary px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-primary-hover"
            >
              Get started — free
            </Link>
            <Link
              href="/examples"
              className="inline-flex rounded-lg border border-border bg-surface-raised px-3.5 py-1.5 text-sm font-semibold text-foreground hover:border-primary"
            >
              Try an example playbook
            </Link>
          </div>
        </div>
      ) : null}

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
              launchTutorialId={user ? t.id : undefined}
              launchOptions={user ? launchOptions : undefined}
            />
          );
        })}
      </ul>
    </article>
  );
}
