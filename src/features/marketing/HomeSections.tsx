import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Bell,
  BookOpen,
  Calendar as CalendarIcon,
  Check,
  ClipboardList,
  LayoutGrid,
  MapPin,
  Printer,
  Sparkles,
  UserPlus,
  Users,
} from "lucide-react";
import { PhoneFrame, TabletFrame, WristBand } from "./DeviceFrames";
import { Reveal } from "./Reveal";
import { ExampleBookTile } from "@/features/dashboard/ExampleBookTile";
import { CoachAiIcon } from "@/features/coach-ai/CoachAiIcon";
import { PlayThumbnail, type PlayThumbnailInput } from "@/features/editor/PlayThumbnail";
import {
  playConceptThumbnail,
  formationThumbnail,
  defenseThumbnail,
} from "./featuredThumbnails";
import type { loadExamplePlaybooks } from "@/lib/site/example-playbooks";

const BRAND_BLUE = "#1769FF";
const BRAND_GREEN = "#95CC1F";
const BRAND_NAVY = "#0F1E3D";
const BRAND_ORANGE = "#F26522";

/* ========================================================================
   Sections rendered on the consolidated home page (`/`). These were once
   shared with a separate `/learn-more` deep-dive page; that route is now
   redirected to `/#tour` and the home page is the single marketing surface.
   ======================================================================== */

/* ---------- Tour: Every screen ---------- */
// Renders with id="tour" so the homepage hero CTA + the header "Tour" link
// can deep-link to the tour section via /#tour.
export function EveryScreen() {
  return (
    <section id="tour" className="relative scroll-mt-24 py-12 md:py-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className="grid gap-10 md:grid-cols-[1fr_auto] md:items-end md:gap-12">
          {/* Left column: heading + paragraph on top, tablet underneath.
              The heading owns the full left-col width so it can render in
              two lines as designed instead of word-wrapping. The tablet
              sits beneath the text, bottom-aligned with the phone. */}
          <div>
            <Reveal>
              <SectionEyebrow icon={LayoutGrid}>Every screen</SectionEyebrow>
              <h2 className="mt-3 text-4xl font-extrabold leading-[1.05] tracking-tight md:text-5xl lg:text-6xl">
                Make plays on your desktop
                <br />
                <span className="text-muted">or on the field.</span>
              </h2>
              <p className="mt-5 max-w-lg text-lg text-muted">
                An easy, fun play editor designed for desktop, tablet, and
                mobile. Draw it up at the kitchen table, review it on the
                sideline, pull up the call on your phone between series.
              </p>
            </Reveal>

            <Reveal delay={100}>
              <div className="mt-10">
                <TabletFrame>
                  <Image
                    src="/marketing/screens/tablet-playbook.png"
                    alt="Playbook on a tablet"
                    width={1024}
                    height={768}
                    loading="lazy"
                    className="h-full w-full object-cover object-top"
                  />
                </TabletFrame>
              </div>
            </Reveal>
          </div>

          {/* Right column: phone alone, bottom-aligned. Its taller frame
              extends up alongside the heading on the left. */}
          <Reveal delay={150}>
            <div className="flex justify-center md:justify-end">
              <PhoneFrame>
                <Image
                  src="/marketing/screens/phone-play.png"
                  alt="A play open on a phone"
                  width={390}
                  height={844}
                  loading="lazy"
                  className="h-full w-full object-cover object-top"
                />
              </PhoneFrame>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* ---------- Coach Cal teaser (homepage-sized) ---------- */
// A condensed version of the Coach Cal hero — chat bubbles + headline + CTA
// pointing to the deep-dive page. Sized to live as a section on `/`, not as a
// full hero.
export function CoachCalTeaser() {
  return (
    <section
      className="relative overflow-hidden py-12 md:py-24"
      style={{
        background:
          "linear-gradient(180deg, rgba(23,105,255,0.05) 0%, transparent 100%)",
      }}
    >
      <div className="mx-auto grid max-w-6xl gap-12 px-6 md:grid-cols-[1.05fr_1fr] md:items-center">
        <Reveal>
          <div>
            <p
              className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider"
              style={{ background: "#E5EDFF", color: BRAND_BLUE }}
            >
              <Sparkles className="size-3.5" /> AI coaching partner · included
            </p>
            <h2
              className="mt-4 text-4xl font-extrabold leading-[1.05] tracking-tight md:text-5xl"
              style={{ color: BRAND_NAVY }}
            >
              Meet <span style={{ color: BRAND_BLUE }}>Coach Cal</span>
              <span style={{ color: BRAND_GREEN }}>.</span>
            </h2>
            <p className="mt-5 max-w-xl text-lg text-muted">
              The AI coaching partner that game-plans your offense{" "}
              <em>and</em> defense, generates plays and full playbooks, reviews
              last week&apos;s game, schedules your season, and writes the QB
              reads you don&apos;t have time to. Built for youth, flag, 7v7,
              and tackle.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link
                href="/login?mode=signup"
                className="inline-flex items-center gap-2 rounded-lg px-5 py-3 text-base font-bold text-white shadow-lg transition-transform hover:-translate-y-0.5"
                style={{ background: BRAND_BLUE }}
              >
                Get started — free
                <ArrowRight className="size-4" />
              </Link>
              <Link
                href="/coach-cal"
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface-raised px-5 py-3 text-base font-semibold text-foreground hover:bg-surface-inset"
              >
                See what Coach Cal can do
              </Link>
            </div>
          </div>
        </Reveal>

        <Reveal delay={100}>
          <div className="relative">
            <div className="absolute -inset-8 -z-10 rounded-[36px] bg-gradient-to-br from-white/40 to-white/0 blur-2xl" />
            <div className="rounded-2xl border border-border bg-surface-raised p-5 shadow-xl">
              <div className="flex items-center gap-2 border-b border-border pb-3">
                <CoachAiIcon className="size-7" />
                <div>
                  <p className="text-sm font-bold text-foreground">Coach Cal</p>
                  <p className="text-[11px] text-muted">scoped to: Flag Football</p>
                </div>
              </div>
              <div className="mt-4 space-y-4 text-sm">
                <ChatBubble
                  role="user"
                  text="We lost 28-6 last Saturday. They killed us with deep balls vs Cover 2."
                />
                <ChatBubble
                  role="cal"
                  text="Three plays in your book are vulnerable here. Want me to add a Smash and a Deep Over to attack the seam?"
                />
                <ChatBubble
                  role="user"
                  text="Yes. Then queue them in next practice."
                />
                <ChatBubble
                  role="cal"
                  text="Added both. Built Tuesday's practice around them — install block, vs. Cover 2 walkthrough, 12 team reps. Saved as Practice Plan #5."
                />
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function ChatBubble({ role, text }: { role: "user" | "cal"; text: string }) {
  if (role === "user") {
    return (
      <div className="flex justify-end">
        <div
          className="max-w-[85%] rounded-2xl px-3.5 py-2 text-white"
          style={{ background: BRAND_NAVY }}
        >
          {text}
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2">
      <div className="mt-0.5">
        <CoachAiIcon className="size-5" />
      </div>
      <div className="max-w-[85%] rounded-2xl bg-surface-inset px-3.5 py-2 text-foreground">
        {text}
      </div>
    </div>
  );
}

/* ---------- Free for solo coaches ---------- */
/* ---------- Run your whole season — free team operations ---------- */
// Sits between the product tour and Coach Cal. The pitch: this isn't
// just a play designer — it's everything you need to run a team, and
// the team-operations side (calendar, roster, player + parent invites)
// is free for every coach. Three feature cards mirror the actual
// in-product surfaces (Calendar, Roster, Share dialog).
export function RunTheTeam() {
  const features = [
    {
      Icon: CalendarIcon,
      title: "Schedule the season",
      body:
        "Practices, games, scrimmages — with arrival times, locations, and one-tap directions. RSVPs roll up so you know who's coming before you load the cooler.",
      bullets: [
        { Icon: Bell, text: "Reminders go out automatically" },
        { Icon: MapPin, text: "Embedded maps + Apple/Google Calendar feed" },
      ],
    },
    {
      Icon: Users,
      title: "Roster, in one place",
      body:
        "Names, jersey numbers, and positions — kept current without spreadsheets. Coaches and players see the same source of truth.",
      bullets: [
        { Icon: ClipboardList, text: "Free for every coach, no per-seat fees" },
      ],
    },
    {
      Icon: UserPlus,
      title: "Players and parents in the loop",
      body:
        "Invite unlimited players and parents to view the playbook and schedule from any phone. They see what's coming next without texts and screenshots.",
      bullets: [
        { Icon: Check, text: "Owner-controlled — disable, approve, or open" },
      ],
    },
  ];
  return (
    <section className="relative py-12 md:py-20">
      <div className="mx-auto max-w-6xl px-6">
        <Reveal>
          <div className="max-w-3xl">
            <p
              className="text-xs font-semibold uppercase tracking-wider"
              style={{ color: BRAND_BLUE }}
            >
              Free team operations · No coach left behind
            </p>
            <h2 className="mt-3 text-3xl font-extrabold leading-[1.1] tracking-tight md:text-4xl lg:text-5xl">
              Run your whole season — not just the playbook.
            </h2>
            <p className="mt-4 text-base text-muted md:text-lg">
              The schedule, the roster, and team comms are bundled in.
              You don&rsquo;t pay for any of it. The paywall is for things
              like assistant-coach collaboration and bigger playbooks —
              not for showing your team when practice is.
            </p>
          </div>
        </Reveal>

        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {features.map((f) => (
            <Reveal key={f.title}>
              <article className="flex h-full flex-col rounded-2xl border border-border bg-surface-raised p-6 shadow-[var(--shadow-elevated)]">
                <div
                  className="mb-4 inline-flex size-10 shrink-0 items-center justify-center rounded-lg"
                  style={{
                    background: "rgba(23, 105, 255, 0.10)",
                    color: BRAND_BLUE,
                  }}
                >
                  <f.Icon className="size-5" />
                </div>
                <h3 className="text-lg font-bold tracking-tight text-foreground">
                  {f.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  {f.body}
                </p>
                <ul className="mt-4 space-y-2 text-sm">
                  {f.bullets.map((b) => (
                    <li key={b.text} className="flex items-start gap-2">
                      <b.Icon
                        className="mt-0.5 size-4 shrink-0"
                        style={{ color: BRAND_GREEN }}
                      />
                      <span className="text-foreground">{b.text}</span>
                    </li>
                  ))}
                </ul>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- Free for solo coaches ---------- */
export function FreeForSolo({ freeMaxPlays }: { freeMaxPlays: number }) {
  const perks = [
    `Up to ${freeMaxPlays} plays in your own playbook`,
    "Full editor — routes, formations, tags",
    "Team calendar — practices, games, scrimmages with player RSVPs",
    "Invite unlimited players + parents — playbook and schedule on every phone",
    "Mobile & tablet views included",
    "Print call sheets to PDF",
  ];
  return (
    <section
      className="relative py-12 md:py-20"
      style={{
        background:
          "linear-gradient(180deg, rgba(149,204,31,0.08) 0%, transparent 100%)",
      }}
    >
      <div className="mx-auto max-w-5xl px-6">
        <Reveal>
          <div className="rounded-3xl border border-border bg-surface-raised p-8 shadow-[var(--shadow-elevated)] md:p-12">
            <div className="flex flex-col items-start gap-6 md:flex-row md:items-center md:justify-between">
              <div>
                <p
                  className="text-xs font-semibold uppercase tracking-wider"
                  style={{ color: BRAND_GREEN }}
                >
                  Free, forever
                </p>
                <h2 className="mt-2 text-3xl font-extrabold tracking-tight md:text-4xl">
                  Your first team is <span style={{ color: BRAND_GREEN }}>free</span>.
                </h2>
                <p className="mt-3 max-w-xl text-muted">
                  One playbook with up to {freeMaxPlays} plays is free, forever.
                  Call sheets print free. The team calendar, player invites,
                  and roster are all yours
                  <span data-web-only>
                    {" "}— upgrade to Coach when you want wristbands,
                    bigger playbooks, and assistant-coach collaboration
                  </span>
                  .
                </p>
              </div>
              <Link
                href="/pricing"
                data-web-only
                className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-foreground px-5 py-3 text-sm font-semibold text-surface-raised hover:opacity-90"
              >
                See pricing
                <ArrowRight className="size-4" />
              </Link>
            </div>
            <ul className="mt-8 grid gap-3 sm:grid-cols-2">
              {perks.map((perk) => (
                <li key={perk} className="flex items-start gap-2 text-sm">
                  <Check
                    className="mt-0.5 size-4 shrink-0"
                    style={{ color: BRAND_GREEN }}
                  />
                  <span className="text-foreground">{perk}</span>
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ---------- Football Library teaser ---------- */
// Discovery surface for /learn/library. Each featured tile renders a
// REAL diagram (not a faded word on a gradient) using the same render
// path as the library detail pages and the in-app editor — Rule 14,
// one render path. The geometry is resolved server-side from the
// catalog (concept skeleton / formation synth / route template /
// defensive alignment) and handed to the static <PlayThumbnail> SVG.
// Tiles whose geometry fails to resolve fall back to a gradient header.
const FEATURED_CONCEPTS: Array<{
  name: string;
  variant: string;
  blurb: string;
  accent: string;
  href: string;
  thumbnail: PlayThumbnailInput | null;
}> = [
  {
    name: "Mesh",
    variant: "Play · 5v5 Flag",
    blurb: "Crossing in-routes that pick man coverage at 6 yards.",
    accent: BRAND_BLUE,
    href: "/learn/library/plays/mesh/flag-5v5",
    thumbnail: playConceptThumbnail("Mesh", "flag_5v5"),
  },
  {
    name: "Smash",
    variant: "Play · 7v7 Flag",
    blurb: "Classic high-low on the corner — flag football's most reliable concept.",
    accent: BRAND_GREEN,
    href: "/learn/library/plays/smash/flag-7v7",
    thumbnail: playConceptThumbnail("Smash", "flag_7v7"),
  },
  {
    name: "Four Verticals",
    variant: "Play · Tackle 11",
    blurb: "Stretch the field vertically. Hits the seam when the safety bites.",
    accent: BRAND_ORANGE,
    href: "/learn/library/plays/four-verticals/tackle-11",
    thumbnail: playConceptThumbnail("Four Verticals", "tackle_11"),
  },
  {
    name: "Trips",
    variant: "Formation · all variants",
    blurb: "Three receivers stacked to one side. Forces the defense to declare.",
    accent: BRAND_GREEN,
    href: "/learn/library/formations/trips",
    thumbnail: formationThumbnail("Trips", ["flag_7v7", "tackle_11", "flag_6v6", "flag_5v5"]),
  },
  {
    name: "Flood",
    variant: "Play · 7v7 Flag",
    blurb: "Three receivers, three levels, one side. Stresses the flat defender.",
    accent: BRAND_BLUE,
    href: "/learn/library/plays/flood/flag-7v7",
    thumbnail: playConceptThumbnail("Flood", "flag_7v7"),
  },
  {
    name: "Defenses",
    variant: "Cover 1 / 2 / 3 · Tampa 2 · blitzes",
    blurb: "Every front + coverage in the library — from man-press to deep zone.",
    accent: BRAND_ORANGE,
    href: "/learn/library/defense",
    thumbnail: defenseThumbnail(["flag_7v7", "tackle_11", "flag_6v6", "flag_5v5"]),
  },
];

export function FootballLibraryTeaser() {
  return (
    <section
      className="relative overflow-hidden py-14 md:py-24"
      style={{
        background:
          "linear-gradient(180deg, rgba(23,105,255,0.06) 0%, transparent 70%)",
      }}
    >
      <div className="mx-auto max-w-6xl px-6">
        <Reveal>
          <div className="flex flex-col items-start gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <SectionEyebrow icon={BookOpen} color={BRAND_BLUE}>
                Football Library
              </SectionEyebrow>
              <h2 className="mt-3 text-4xl font-extrabold tracking-tight md:text-5xl">
                Learn the game
                <br />
                <span style={{ color: BRAND_BLUE }}>while you build playbooks.</span>
              </h2>
              <p className="mt-5 max-w-2xl text-lg text-muted">
                A free, public library of football concepts — plays, formations,
                routes, defenses, drills, and practice plans. Each concept page
                renders the play in the same editor you&apos;d use to design it,
                with coaching cues and an &ldquo;Add to my playbook&rdquo; button.
              </p>
            </div>
            <Link
              href="/learn/library"
              className="inline-flex shrink-0 items-center gap-2 rounded-lg px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-hover"
              style={{ background: BRAND_BLUE }}
            >
              Browse the library
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </Reveal>

        <Reveal delay={100}>
          <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURED_CONCEPTS.map((c) => (
              <li key={c.name}>
                <Link
                  href={c.href}
                  className="group block h-full overflow-hidden rounded-2xl border border-border bg-surface-raised transition-all hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div
                    aria-hidden
                    className="border-b border-border p-3"
                    style={{
                      background: `linear-gradient(135deg, ${c.accent}12 0%, ${c.accent}05 100%)`,
                    }}
                  >
                    {c.thumbnail ? (
                      <div className="overflow-hidden rounded-lg shadow-sm transition-transform duration-300 group-hover:scale-[1.02]">
                        <PlayThumbnail preview={c.thumbnail} light />
                      </div>
                    ) : (
                      <div
                        className="flex aspect-[16/10] items-center justify-center rounded-lg border border-slate-200 bg-white text-4xl font-extrabold tracking-tight opacity-30"
                        style={{ color: c.accent }}
                      >
                        {c.name.split(" ")[0]}
                      </div>
                    )}
                  </div>
                  <div className="p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                      {c.variant}
                    </p>
                    <h3 className="mt-1 text-base font-semibold text-foreground transition-colors group-hover:text-primary">
                      {c.name}
                    </h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted">
                      {c.blurb}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal delay={200}>
          <p className="mt-8 text-center text-sm text-muted">
            Each concept page renders in the same play editor that powers the
            builder — same diagrams, same coaching cues.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

/* ---------- Printouts + wristbands ---------- */
export function PrintoutsAndWristbands() {
  return (
    <section
      className="relative overflow-hidden py-14 md:py-28"
      style={{
        background:
          "linear-gradient(180deg, rgba(242,101,34,0.06) 0%, transparent 60%)",
      }}
    >
      <div className="mx-auto max-w-6xl px-6">
        <div className="grid gap-12 md:grid-cols-2 md:items-center">
          <Reveal>
            <div className="overflow-hidden rounded-3xl shadow-[var(--shadow-elevated)] ring-1 ring-black/10">
              <Image
                src="/marketing/photos/wristbands-callsheet.jpg"
                alt="Printed call sheet and four wristbands on the field — generated from a real xogridmaker playbook"
                width={1400}
                height={1050}
                loading="lazy"
                className="block h-auto w-full"
                sizes="(min-width: 768px) 600px, 100vw"
              />
            </div>
          </Reveal>

          <Reveal delay={100}>
            <div>
              <SectionEyebrow icon={Printer} color={BRAND_ORANGE}>
                Print-ready
              </SectionEyebrow>
              <h2 className="mt-3 text-4xl font-extrabold tracking-tight md:text-5xl">
                From screen
                <br />
                <span style={{ color: BRAND_ORANGE }}>to wristband.</span>
              </h2>
              <p className="mt-5 max-w-lg text-lg text-muted">
                One-click PDFs sized for wristbands, call sheets, and the
                bench-side binder. Numbering, formations, and tags all carry
                through so the printout reads just like the app.
              </p>
              <p className="mt-3 text-sm text-muted">
                Every example playbook has a live print preview — try one.
              </p>
            </div>
          </Reveal>
        </div>

        <div className="mt-20 grid gap-10 md:grid-cols-2 md:items-center">
          <Reveal>
            <WristBand>
              <MockWristSheet />
            </WristBand>
            <p className="mt-6 text-center text-sm text-muted">
              4-across wristband layout — generated from your call sheet.
            </p>
          </Reveal>

          <Reveal delay={100}>
            <div className="mx-auto max-w-md rotate-[-2deg] rounded-lg bg-white p-4 shadow-[var(--shadow-elevated)] ring-1 ring-black/10">
              <MockCallSheet />
            </div>
            <p className="mt-6 text-center text-sm text-muted">
              Full call sheet — group by situation or personnel.
            </p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* ---------- Real playbooks — point to /examples ---------- */
export function RealPlaybooks({
  examples,
}: {
  examples: Awaited<ReturnType<typeof loadExamplePlaybooks>>;
}) {
  return (
    // id="examples" is the scroll target for the hero phone (tap to jump here).
    <section id="examples" className="relative scroll-mt-24 py-12 md:py-24">
      <div className="mx-auto max-w-6xl px-6">
        <Reveal>
          <div className="max-w-2xl">
            <SectionEyebrow icon={LayoutGrid}>See it live</SectionEyebrow>
            <h2 className="mt-3 text-4xl font-extrabold tracking-tight md:text-5xl">
              Real playbooks.
              <br />
              <span className="text-muted">Open one, poke around.</span>
            </h2>
            <p className="mt-5 text-lg text-muted">
              These are actual xogridmaker playbooks built by coaches. Every
              play opens in the real editor, every formation is live, every
              wristband is printable. Click in and tinker — nothing you do
              here is saved.
            </p>
          </div>
        </Reveal>

        {examples.length > 0 && (
          <Reveal delay={100}>
            <div className="mt-12 flex flex-wrap justify-center gap-6">
              {examples.map((pb) => (
                <div key={pb.id} className="w-40 sm:w-48 lg:w-56">
                  <ExampleBookTile tile={pb} />
                </div>
              ))}
            </div>
          </Reveal>
        )}
      </div>
    </section>
  );
}

/* ---------- Built by a coach ---------- */
export function BuiltByACoach() {
  return (
    <section className="relative py-12 md:py-24">
      <div className="mx-auto max-w-3xl px-6 text-center">
        <Reveal>
          <SectionEyebrow icon={Users} center>
            Built by a coach
          </SectionEyebrow>
          <h2 className="mt-3 text-4xl font-extrabold tracking-tight md:text-5xl">
            Built by a youth football coach
            <br />
            <span className="text-muted">for youth football coaches.</span>
          </h2>
          <p className="mt-6 text-lg text-muted">
            xogridmaker is built by an active flag, youth tackle, and 7v7
            coach. Every feature exists because a real practice, a real game,
            or a real drive home from the field demanded it.
          </p>
          <Link
            href="/about"
            className="mt-8 inline-flex items-center gap-2 text-base font-semibold"
            style={{ color: BRAND_BLUE }}
          >
            Read the story
            <ArrowRight className="size-4" />
          </Link>
        </Reveal>
      </div>
    </section>
  );
}

/* ---------- Final CTA ---------- */
export function FinalCta() {
  return (
    <section
      className="relative py-14 md:py-28"
      style={{
        background:
          "linear-gradient(135deg, rgba(23,105,255,0.10) 0%, rgba(149,204,31,0.10) 100%)",
      }}
    >
      <div className="mx-auto max-w-3xl px-6 text-center">
        <Reveal>
          <div className="mx-auto mb-8 flex items-center justify-center">
            <Image
              src="/brand/xogridmaker_icon.svg"
              alt="xogridmaker"
              width={120}
              height={90}
              loading="lazy"
              className="h-auto w-[120px]"
            />
          </div>
          <h2
            className="text-4xl font-extrabold tracking-tight md:text-5xl"
            style={{ color: BRAND_NAVY }}
          >
            Design plays. <span style={{ color: BRAND_GREEN }}>Win games.</span>
          </h2>
          <p className="mt-5 text-lg text-muted">
            Free for solo coaches. Live in five minutes. Wristbands tonight.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href="/login?mode=signup"
              className="inline-flex items-center gap-2 rounded-lg px-6 py-3.5 text-base font-bold text-white shadow-lg transition-transform hover:-translate-y-0.5"
              style={{ background: BRAND_BLUE }}
            >
              Get started — free
              <ArrowRight className="size-5" />
            </Link>
            <Link
              href="/faq"
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface-raised px-6 py-3.5 text-base font-semibold hover:bg-surface-inset"
            >
              Read the FAQ
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ========================================================================
   Building blocks.
   ======================================================================== */

export function SectionEyebrow({
  icon: Icon,
  children,
  light = false,
  center = false,
  color,
}: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  children: React.ReactNode;
  light?: boolean;
  center?: boolean;
  color?: string;
}) {
  const tone = color ?? (light ? "#95CC1F" : BRAND_BLUE);
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider ${
        center ? "mx-auto" : ""
      }`}
      style={{
        background: light ? "rgba(255,255,255,0.08)" : `${tone}18`,
        color: tone,
      }}
    >
      <Icon className="size-3.5" style={{ color: tone }} />
      {children}
    </div>
  );
}

export function FeatureBullet({
  children,
  light = false,
}: {
  children: React.ReactNode;
  light?: boolean;
}) {
  return (
    <li className="flex items-start gap-2">
      <Check
        className="mt-0.5 size-4 shrink-0"
        style={{ color: light ? BRAND_GREEN : BRAND_BLUE }}
      />
      <span className={light ? "text-white/80" : "text-foreground"}>
        {children}
      </span>
    </li>
  );
}

function MockWristSheet() {
  return (
    <Image
      src="/marketing/screens/print-wristband-v2.png"
      alt="Single wristband card generated from a real example playbook"
      width={1338}
      height={754}
      loading="lazy"
      className="block h-auto w-full"
    />
  );
}

function MockCallSheet() {
  return (
    <Image
      src="/marketing/screens/print-callsheet-v2.png"
      alt="Call sheet generated from a real example playbook"
      width={1338}
      height={1732}
      loading="lazy"
      className="block h-auto w-full"
    />
  );
}
