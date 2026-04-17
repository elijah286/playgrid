import Link from "next/link";
import { redirect } from "next/navigation";
import { FootballIcon, FieldGoalIcon } from "@/components/brand/FootballMarks";
import { SiteHeaderBar } from "@/components/layout/SiteHeaderBar";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";

export default async function HomePage() {
  if (hasSupabaseEnv()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) redirect("/playbooks");
  }

  return (
    <div className="relative mx-auto flex min-h-full max-w-3xl flex-col justify-center gap-10 px-6 py-16">
      <SiteHeaderBar />
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-40 rounded-b-[3rem] bg-gradient-to-b from-pg-turf/12 via-pg-field/30 to-transparent"
        aria-hidden
      />
      <div className="relative flex flex-col gap-10">
        <div className="flex flex-wrap items-start gap-5">
          <div className="flex shrink-0 items-center gap-2 rounded-2xl bg-pg-turf px-3 py-2 shadow-md ring-2 ring-pg-chalk/90 ring-offset-2 ring-offset-pg-mist">
            <FootballIcon className="h-10 w-10" />
            <FieldGoalIcon className="h-10 w-10 text-pg-chalk" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-display text-2xl tracking-[0.12em] text-pg-turf">PLAYGRID</p>
            <h1 className="font-display mt-2 text-5xl leading-[0.95] text-pg-ink md:text-6xl">
              From clipboard
              <span className="text-pg-turf"> to the field.</span>
            </h1>
            <p className="mt-4 text-lg leading-relaxed text-pg-muted">
              Design flag and 7v7 offense, preview wristbands and sheets, and carry plays on the
              field — with a structured document model built for AI-assisted edits later.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/login"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-pg-turf px-5 py-2.5 text-sm font-semibold text-pg-chalk shadow-md hover:bg-pg-turf-deep"
          >
            <FootballIcon className="h-5 w-5 shrink-0" />
            Sign in
          </Link>
          <Link
            href="/playbooks"
            className="rounded-xl border-2 border-pg-turf/25 bg-pg-chalk px-5 py-2.5 text-sm font-semibold text-pg-turf shadow-sm hover:border-pg-turf/50 hover:bg-pg-mist dark:hover:bg-pg-surface"
          >
            Go to playbooks
          </Link>
        </div>
      </div>
    </div>
  );
}
