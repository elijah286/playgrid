import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, ChevronDown } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { loadExamplePlaybooks } from "@/lib/site/example-playbooks";
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

  // Pull marketing data in parallel — both feed below-fold sections, neither
  // blocks the hero from rendering.
  const [examples, freeMaxPlays] = await Promise.all([
    loadExamplePlaybooks().then((r) => r.slice(0, 3)),
    getFreeMaxPlaysPerPlaybook(),
  ]);

  return (
    <div className="bg-surface text-foreground">
      {/* ---------- Hero ----------
          Above-the-fold: server-rendered HTML, no client JS required to paint.
          The illustration owns LCP via `priority` — every other image on the
          page is `loading="lazy"` so the browser doesn't fight for bandwidth. */}
      <section className="relative overflow-hidden">
        {/* Hero is content-sized, not viewport-locked. Letting the next
            section's top edge crest the fold is the single most reliable
            "scroll for more" cue — a 100vh hero teaches visitors there's
            nothing below. */}
        <div className="relative mx-auto flex max-w-6xl flex-col items-center gap-10 px-6 py-16 md:flex-row md:items-center md:gap-12 md:py-20 lg:gap-16">
          <div className="flex-1">
            <h1
              className="text-5xl font-extrabold leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl"
              style={{ color: BRAND_NAVY }}
            >
              Design plays.
              <br />
              <span style={{ color: BRAND_GREEN }}>Win games.</span>
            </h1>

            <p
              className="mt-8 max-w-xl text-lg leading-relaxed"
              style={{ color: "#475569" }}
            >
              Create custom playbooks and share them with your team. Quickly
              generate game-ready wristbands and play sheets. Designed for flag,
              7v7, and tackle football coaches.
            </p>

            <div className="mt-10 flex flex-wrap gap-3">
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

          <div className="flex w-full shrink-0 items-center justify-center md:w-[420px] lg:w-[460px]">
            <Image
              src="/brand/xogridmaker_icon.svg"
              alt="xogridmaker"
              width={850}
              height={620}
              priority
              className="h-auto w-full max-w-[320px] md:max-w-none drop-shadow-[0_20px_45px_rgba(23,105,255,0.18)]"
            />
          </div>
        </div>

        {/* Scroll affordance — only renders on viewports tall enough that
            the next section *isn't* already peeking above the fold. Phones
            (vertical stack), small laptops, and any height < 800px get
            natural peek instead. CSS-only so no client JS. */}
        <Link
          href="#tour"
          aria-label="Scroll to product tour"
          className="pointer-events-auto absolute bottom-4 left-1/2 hidden -translate-x-1/2 animate-bounce rounded-full p-2 text-muted transition-colors hover:text-foreground [@media(min-width:768px)_and_(min-height:800px)]:block"
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
