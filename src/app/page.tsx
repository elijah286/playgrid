import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, ChevronDown } from "lucide-react";

export const metadata: Metadata = {
  title: "XO Gridmaker — Football play designer & playbook builder for coaches",
  description:
    "Design football plays, organize them into playbooks, share with your team, and print game-ready wristbands. Free for solo coaches — built for flag, 7v7, and tackle football.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "XO Gridmaker — Football play designer & playbook builder",
    description:
      "Design plays. Win games. Free for solo coaches — built for flag, 7v7, and tackle football.",
    url: "/",
    type: "website",
  },
};
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import {
  loadExamplePlaybooks,
  loadHeroMarketingExample,
} from "@/lib/site/example-playbooks";
import { ExampleBookTile } from "@/features/dashboard/ExampleBookTile";
import { getFreeMaxPlaysPerPlaybook } from "@/lib/site/free-plays-config";
import {
  BuiltByACoach,
  CoachCalTeaser,
  EveryScreen,
  FinalCta,
  FreeForSolo,
  PrintoutsAndWristbands,
  RealPlaybooks,
} from "@/features/marketing/HomeSections";

const BRAND_BLUE = "#1769FF";
const BRAND_GREEN = "#95CC1F";
const BRAND_NAVY = "#0F1E3D";

export default async function HomePage() {
  if (hasSupabaseEnv()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) redirect("/home");
  }

  // Pull marketing data in parallel — neither blocks the hero from rendering.
  // - examples feeds the below-fold strip (every example, no slice).
  // - hero is the single playbook the admin promoted to the hero slot, or
  //   null when no hero is set (page falls back to the X/O illustration).
  const [examples, heroExample, freeMaxPlays] = await Promise.all([
    loadExamplePlaybooks(),
    loadHeroMarketingExample(),
    getFreeMaxPlaysPerPlaybook(),
  ]);

  return (
    <div className="overflow-x-hidden bg-surface text-foreground">
      {/* ---------- Hero ----------
          Above-the-fold: server-rendered HTML, no client JS required to paint.
          The illustration owns LCP via `priority` — every other image on the
          page is `loading="lazy"` so the browser doesn't fight for bandwidth. */}
      <section className="relative overflow-hidden">
        {/* Hero is content-sized, not viewport-locked. Letting the next
            section's top edge crest the fold is the single most reliable
            "scroll for more" cue — a 100vh hero teaches visitors there's
            nothing below. */}
        <div className="relative mx-auto flex max-w-6xl flex-col items-center gap-6 px-5 py-10 sm:gap-10 sm:px-6 sm:py-16 md:flex-row md:items-center md:gap-12 md:py-20 lg:gap-16">
          <div className="flex-1">
            <h1
              className="text-4xl font-extrabold leading-[1.02] tracking-tight sm:text-5xl md:text-6xl lg:text-7xl"
              style={{ color: BRAND_NAVY }}
            >
              <span className="whitespace-nowrap">Design plays.</span>
              <br />
              <span className="whitespace-nowrap" style={{ color: BRAND_GREEN }}>
                Win games.
              </span>
            </h1>

            <p
              className="mt-5 max-w-xl text-base leading-relaxed sm:mt-8 sm:text-lg"
              style={{ color: "#475569" }}
            >
              Create custom playbooks and share them with your team. Quickly
              generate game-ready wristbands and play sheets. Designed for flag,
              7v7, and tackle football coaches.
            </p>

            <div className="mt-6 flex flex-wrap gap-3 sm:mt-10">
              <Link
                href="/login?mode=signup"
                className="inline-flex items-center gap-2 rounded-lg px-6 py-3.5 text-base font-bold text-white shadow-lg transition-transform hover:-translate-y-0.5"
                style={{ background: BRAND_BLUE }}
              >
                Get started — free
                <ArrowRight className="size-5" />
              </Link>
              <Link
                href="#tour"
                className="inline-flex items-center gap-2 rounded-lg px-6 py-3.5 text-base font-bold text-white shadow-lg transition-transform hover:-translate-y-0.5"
                style={{ background: BRAND_NAVY }}
              >
                Take the tour
              </Link>
            </div>

            <p className="mt-4 text-sm text-muted">
              Free for solo coaches · Build your first play in minutes
            </p>
          </div>

          {heroExample ? (
            <div className="flex w-full shrink-0 flex-col items-center gap-5 md:w-[360px] lg:w-[400px]">
              {/* centerOnOpen auto-opens the book on mobile (where hover
                  isn't available) so phone visitors immediately see the
                  play thumbnails. Desktop keeps the hover-to-open
                  animation that the rest of the site uses. */}
              <div className="w-full max-w-[280px] sm:max-w-[320px] md:max-w-none">
                <ExampleBookTile tile={heroExample} centerOnOpen />
              </div>
              <Link
                href={`/playbooks/${heroExample.id}`}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface-raised px-4 py-2.5 text-sm font-semibold text-foreground shadow-sm hover:bg-surface-inset"
              >
                Try this playbook
                <ArrowRight className="size-4" />
              </Link>
            </div>
          ) : (
            <div className="flex w-full shrink-0 items-center justify-center md:w-[420px] lg:w-[460px]">
              <Image
                src="/brand/xogridmaker_icon.svg"
                alt="xogridmaker"
                width={850}
                height={620}
                priority
                className="h-auto w-full max-w-[220px] sm:max-w-[280px] md:max-w-none drop-shadow-[0_20px_45px_rgba(23,105,255,0.18)]"
              />
            </div>
          )}
        </div>

        {/* Scroll affordance — bouncing chevron only on md+ viewports
            that are tall enough that the next section likely *isn't*
            already peeking above the fold. Phones (stacked layout) and
            short windows hide it because peek does the work. */}
        <Link
          href="#tour"
          aria-label="Scroll to product tour"
          className="absolute bottom-4 left-1/2 hidden -translate-x-1/2 animate-bounce rounded-full p-2 text-muted transition-colors hover:text-foreground md:[@media(min-height:850px)]:block"
        >
          <ChevronDown className="size-7" />
        </Link>
      </section>

      {/* Order matters: tour answers "show me," Coach Cal is the wedge,
          free pitch is cost reassurance, then proof (print, examples, story),
          then a final CTA. */}
      <EveryScreen />
      <CoachCalTeaser />
      <FreeForSolo freeMaxPlays={freeMaxPlays} />
      <PrintoutsAndWristbands />
      <RealPlaybooks examples={examples} />
      <BuiltByACoach />
      <FinalCta />
    </div>
  );
}
