import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, ChevronDown } from "lucide-react";

export const metadata: Metadata = {
  title:
    "XO Gridmaker — Flag football playbook builder (5v5, 6v6, 7v7) & tackle play designer",
  description:
    "Build a flag football playbook in minutes. Design plays, organize 5v5 / 6v6 / 7v7 and tackle playbooks, share with your team, and print game-ready wristbands. Free for solo coaches.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "XO Gridmaker — Flag football playbook builder & play designer",
    description:
      "Build a flag football playbook in minutes. 5v5, 6v6, 7v7, and tackle — free for solo coaches.",
    url: "/",
    type: "website",
  },
};
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { getUserWithTimeout } from "@/lib/supabase/get-user-with-timeout";
import {
  loadExamplePlaybooks,
  loadHeroMarketingExample,
} from "@/lib/site/example-playbooks";
import { HeroPlaybookCta } from "@/features/marketing/HeroPlaybookCta";
import { PhoneFrame } from "@/features/marketing/DeviceFrames";
import { ScrollToLink } from "@/features/marketing/ScrollToLink";
import { getFreeMaxPlaysPerPlaybook } from "@/lib/site/free-plays-config";
import {
  BuiltByACoach,
  CoachCalTeaser,
  EveryScreen,
  FinalCta,
  FootballLibraryTeaser,
  FreeForSolo,
  RealPlaybooks,
  RunTheTeam,
} from "@/features/marketing/HomeSections";
import { isFootballLibraryAvailable } from "@/lib/learn/access";

const BRAND_BLUE = "#1769FF";
const BRAND_GREEN = "#95CC1F";
const BRAND_NAVY = "#0F1E3D";

export default async function HomePage() {
  if (hasSupabaseEnv()) {
    const supabase = await createClient();
    // Same time-bound as the root layout and middleware — a hung
    // refresh-token round-trip on a flaky network shouldn't stall the
    // marketing page. On timeout, fall through as anonymous; the page
    // still renders and the next request retries the refresh.
    const result = await getUserWithTimeout(supabase);
    if (result.kind === "ok" && result.user) redirect("/home");
  }

  // Pull marketing data in parallel — neither blocks the hero from rendering.
  // - examples feeds the below-fold strip (every example, no slice).
  // - hero is the single playbook the admin promoted to the hero slot, or
  //   null when no hero is set (page falls back to the X/O illustration).
  const [examples, heroExample, freeMaxPlays, libraryAvailable] = await Promise.all([
    loadExamplePlaybooks(),
    loadHeroMarketingExample(),
    getFreeMaxPlaysPerPlaybook(),
    isFootballLibraryAvailable(),
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
        <div className="relative mx-auto flex max-w-6xl flex-col items-center gap-6 px-5 py-10 sm:gap-10 sm:px-6 sm:py-16 md:flex-row md:items-center md:justify-center md:gap-10 md:py-20 lg:gap-14">
          <div className="md:max-w-xl">
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
              Design plays, schedule the season, and keep players and parents
              in the loop — all in one place. Print game-ready wristbands and
              call sheets. Built for flag, 7v7, and tackle football coaches.
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
                className="hidden items-center gap-2 rounded-lg px-6 py-3.5 text-base font-bold text-white shadow-lg transition-transform hover:-translate-y-0.5 sm:inline-flex"
                style={{ background: BRAND_NAVY }}
              >
                Take the tour
              </Link>
            </div>

            {/* Secondary CTA sits directly under the primary buttons. */}
            {heroExample ? (
              <div className="mt-4">
                <HeroPlaybookCta playbookId={heroExample.id} />
              </div>
            ) : null}
          </div>

          <div className="flex w-full shrink-0 flex-col items-center md:w-[300px] lg:w-[320px]">
            {/* Primary visual: the real playbook grid on a phone, tilted
                in 3D. Shows the whole product at a glance — play cards,
                route diagrams, the tabbed shell — not just one play. A
                static, committed screenshot (no auth / live render).
                Clicking it jumps down to the live example playbooks. */}
            <ScrollToLink
              targetId="examples"
              ariaLabel="See real example playbooks below"
              className="block cursor-pointer [perspective:1400px]"
            >
              <div className="transition-transform duration-500 ease-out [transform:rotateY(-14deg)_rotateX(4deg)_rotate(-1deg)] hover:[transform:rotateY(-7deg)_rotateX(2deg)]">
                <PhoneFrame className="w-[190px] sm:w-[205px] md:w-[225px] drop-shadow-[0_35px_60px_rgba(15,30,61,0.28)]">
                  <Image
                    src="/marketing/screens/phone-playbook-2col.png"
                    alt="A 7v7 playbook in XO Gridmaker — a two-column grid of play cards with route diagrams"
                    width={824}
                    height={1945}
                    priority
                    className="h-full w-full object-cover object-top"
                  />
                </PhoneFrame>
              </div>
            </ScrollToLink>
          </div>
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
      <RunTheTeam />
      <CoachCalTeaser />
      {libraryAvailable ? <FootballLibraryTeaser /> : null}
      <FreeForSolo freeMaxPlays={freeMaxPlays} />
      <RealPlaybooks examples={examples} />
      <BuiltByACoach />
      <FinalCta />
    </div>
  );
}
