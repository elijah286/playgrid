// Editorial how-to article — targets "flag football practice plan" (and
// "60 minute / youth flag football practice") informational intent. This
// query is high-volume, high-intent, and under-served by tool-makers —
// and Coach Cal literally generates practice plans, so it's a natural
// differentiator page. AEO-shaped per the 2026 answer-engine playbook:
// direct answer front-loaded in the first 30%, HowTo + FAQ schema, "2026"
// in the title, self-contained.
//
// Lives at the /learn root (editorial prose), NOT under /learn/library
// (catalog render path per Rule 14).

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Clock } from "lucide-react";
import { withFullContext } from "@/lib/seo/ld-json";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.xogridmaker.com";
const PAGE_PATH = "/learn/flag-football-practice-plan";
const PAGE_URL = `${SITE_URL}${PAGE_PATH}`;

const PAGE_TITLE = "Free 60-Minute Flag Football Practice Plan (2026)";
const PAGE_DESCRIPTION =
  "A ready-to-run 60-minute flag football practice plan for youth coaches — warmup, position skills, play install, team period, and scrimmage, minute by minute. Works for 5v5, 6v6, and 7v7.";

const PUBLISHED_ISO = "2026-07-22";
const MODIFIED_ISO = "2026-07-22";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: PAGE_PATH },
  openGraph: {
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    url: PAGE_URL,
    type: "article",
    publishedTime: PUBLISHED_ISO,
    modifiedTime: MODIFIED_ISO,
  },
  twitter: {
    card: "summary_large_image",
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
  },
};

// The plan, as data — drives both the on-page table and the HowTo schema.
const BLOCKS = [
  {
    time: "0:00–0:10",
    name: "Dynamic warmup",
    detail:
      "Light jog, high knees, carioca, and dynamic stretch, then two lines of partner catches. Get hands warm and heart rates up — never static-stretch a cold youth team.",
  },
  {
    time: "0:10–0:22",
    name: "Position skills (split up)",
    detail:
      "QB: footwork and 3-step timing throws. Receivers: releases off the line and high-point catching. Defense: backpedal, break, and — the whole game in flag — flag-pulling technique (break down, aim for the hips, rip the flag). Rotate so everyone reps QB and defense.",
  },
  {
    time: "0:22–0:38",
    name: "Play install & walkthrough",
    detail:
      "Install one or two plays only. Walk it at zero speed so everyone knows their spot, then run it at half speed 3–5 times, then full speed vs air. Recognizable beats perfect — polish comes over the next few weeks.",
  },
  {
    time: "0:38–0:52",
    name: "Team period (7-on-7 / situational)",
    detail:
      "Run today's install plus last week's plays against a defense. Script situations: 1st-and-long, 3rd-and-short, red zone. This is where plays become real — coach the read, not just the route.",
  },
  {
    time: "0:52–0:58",
    name: "Controlled scrimmage",
    detail:
      "One short drive, live. Move the ball, keep score, let them call it. Competitive reps are what kids remember — and what shows you which plays are actually ready.",
  },
  {
    time: "0:58–1:00",
    name: "Break it down",
    detail:
      "One thing you did well, one thing to fix, and the play you're installing next week. Send them home knowing the plan.",
  },
];

const FAQ = [
  {
    q: "How long should a youth flag football practice be?",
    a: "Sixty minutes is the sweet spot for most youth (8U–12U) flag teams — long enough to warm up, teach, and compete, short enough to hold attention. Under 8U, drop to 45 minutes. Adult and 7v7 travel teams can push to 75–90 minutes, but the structure below still holds; just lengthen the team period.",
  },
  {
    q: "How much of practice should be install vs. reps?",
    a: "Roughly a third teaching, two-thirds reps. Install one or two plays per practice (about 15 minutes) and spend the rest running plays you already have against a defense. Teams that try to install four plays a night end up with eight plays nobody can run.",
  },
  {
    q: "What should the first 10 minutes of practice be?",
    a: "A dynamic warmup and partner catches — movement, not standing around, and hands on the ball immediately. Never open with a chalk talk or static stretching; you lose a young team's focus before you've used it.",
  },
  {
    q: "How many plays can you install in one practice?",
    a: "One or two. A play is 'installed' when players can line up and run it at full speed without thinking — that takes a walkthrough, half-speed reps, and full-speed-vs-air in the same session, then live reps the following week.",
  },
  {
    q: "Do you need a practice plan for flag football?",
    a: "Yes. A minute-by-minute plan is the difference between a practice that teaches and a practice that drifts. It keeps every player moving, guarantees your install gets real reps, and ends on time. You can build one in seconds with Coach Cal, or use the 60-minute template on this page.",
  },
];

export default function FlagFootballPracticePlanPage() {
  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "HowTo",
        "@id": `${PAGE_URL}#howto`,
        name: PAGE_TITLE,
        description: PAGE_DESCRIPTION,
        totalTime: "PT60M",
        step: BLOCKS.map((b, i) => ({
          "@type": "HowToStep",
          position: i + 1,
          name: b.name,
          text: b.detail,
        })),
      },
      {
        "@type": "Article",
        "@id": `${PAGE_URL}#article`,
        headline: PAGE_TITLE,
        description: PAGE_DESCRIPTION,
        url: PAGE_URL,
        datePublished: PUBLISHED_ISO,
        dateModified: MODIFIED_ISO,
        author: { "@type": "Organization", name: "XO Gridmaker", url: SITE_URL },
        publisher: { "@type": "Organization", name: "XO Gridmaker", url: SITE_URL },
        mainEntityOfPage: { "@type": "WebPage", "@id": PAGE_URL },
        about: [
          { "@type": "Thing", name: "Flag football" },
          { "@type": "Thing", name: "Practice plan" },
          { "@type": "Thing", name: "Youth coaching" },
        ],
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: "/" },
          { "@type": "ListItem", position: 2, name: "Learning Center", item: "/learn/library" },
          { "@type": "ListItem", position: 3, name: "Flag football practice plan", item: PAGE_PATH },
        ],
      },
      {
        "@type": "FAQPage",
        mainEntity: FAQ.map((item) => ({
          "@type": "Question",
          name: item.q,
          acceptedAnswer: { "@type": "Answer", text: item.a },
        })),
      },
    ],
  };

  return (
    <article className="mx-auto max-w-3xl px-6 py-12 text-foreground">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(withFullContext(ld)) }}
      />

      <header className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">
          Coaching guide · Flag football
        </p>
        <h1 className="mt-3 text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
          Free 60-minute flag football practice plan
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-muted">
          A ready-to-run, minute-by-minute practice plan for youth flag
          football coaches — warmup, skills, install, team period, and a
          short scrimmage. Sized for 5v5, 6v6, or 7v7.
        </p>
      </header>

      {/* Front-loaded direct answer — the block AI engines extract. */}
      <div className="mb-10 overflow-hidden rounded-2xl border border-border bg-surface-raised">
        <div className="flex items-center gap-2 border-b border-border px-5 py-3">
          <Clock className="size-4 text-primary" />
          <h2 className="m-0 text-base font-semibold">The 60-minute plan at a glance</h2>
        </div>
        <ul className="divide-y divide-border">
          {BLOCKS.map((b) => (
            <li key={b.time} className="flex gap-4 px-5 py-3 text-sm">
              <span className="w-24 shrink-0 font-mono font-semibold text-foreground">
                {b.time}
              </span>
              <span className="text-muted">
                <span className="font-semibold text-foreground">{b.name}.</span>{" "}
                {b.detail}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <section className="prose prose-lg max-w-none text-foreground prose-headings:text-foreground prose-p:text-muted prose-li:text-muted prose-strong:text-foreground prose-a:text-primary">
        <p>
          The best youth flag football practices share one trait: nobody is
          ever standing around. The plan above keeps every player moving,
          guarantees your new plays actually get repped, and ends on time —
          which parents and players both appreciate. Below is the coaching
          detail behind each block, plus how to adjust it for your variant.
        </p>

        <h2>0:00–0:10 — Dynamic warmup</h2>
        <p>
          Open with movement, not a chalk talk. A light jog, high knees,
          carioca, and a dynamic stretch, then split into two lines and
          throw. Two things happen: hands get warm on the ball immediately,
          and you&rsquo;ve set the tone that practice is fast. Never open a
          young team with static stretching or a whiteboard — you spend the
          focus you need before you&rsquo;ve used it.
        </p>

        <h2>0:10–0:22 — Position skills</h2>
        <p>
          Split the team and rep the fundamentals the game actually turns
          on:
        </p>
        <ul>
          <li>
            <strong>Quarterbacks:</strong> footwork and three-step timing —
            the ball should come out on rhythm, not on a hitch.
          </li>
          <li>
            <strong>Receivers:</strong> a clean release off the line and
            high-pointing the catch. Most dropped flag-football passes are
            release and eyes, not hands.
          </li>
          <li>
            <strong>Defense:</strong> backpedal-and-break, and{" "}
            <strong>flag-pulling</strong> — break down, aim for the hips,
            rip the flag. Flag-pulling is the single most-missed skill in
            youth flag; rep it every practice.
          </li>
        </ul>
        <p>Rotate so every kid gets reps at quarterback and on defense.</p>

        <h2>0:22–0:38 — Install one or two plays</h2>
        <p>
          This is the part coaches get wrong. Install <em>one or two</em>{" "}
          plays, not four. Walk the play at zero speed so everyone knows
          their spot, run it at half speed three to five times, then full
          speed against air. A play is &ldquo;installed&rdquo; when players
          can line up and run it without thinking — not when you&rsquo;ve
          described it once. If you need a starting set, the{" "}
          <Link href="/learn/how-to-build-a-flag-football-playbook">
            how-to-build-a-playbook guide
          </Link>{" "}
          walks through the first plays to teach, and every concept in the{" "}
          <Link href="/learn/library">play library</Link> has a coaching
          breakdown and a diagram.
        </p>

        <h2>0:38–0:52 — Team period</h2>
        <p>
          Now run your plays against a defense — today&rsquo;s install plus
          the plays from previous weeks. Script situations so practice looks
          like a game: 1st-and-long, 3rd-and-short, red zone. Coach the{" "}
          <em>read</em>, not just the route — where the quarterback&rsquo;s
          eyes go, which defender tells him where to throw. This is where a
          collection of routes becomes an offense.
        </p>

        <h2>0:52–0:58 — Controlled scrimmage</h2>
        <p>
          End with one short live drive. Move the ball, keep score, and let
          the players call it. Competitive reps are what kids remember all
          week, and they show you — better than any drill — which plays are
          actually ready and which need another week.
        </p>

        <h2>0:58–1:00 — Break it down</h2>
        <p>
          One thing the team did well, one thing to fix, and a preview of
          next week&rsquo;s install. Ending with the plan for next time
          turns practices into a season instead of six disconnected
          Saturdays.
        </p>

        <h2>Adjusting the plan for your variant and age</h2>
        <ul>
          <li>
            <strong>5v5 / 6v6:</strong> shrink the team period slightly and
            add reps to flag-pulling and quick-game timing — smaller fields
            reward the quick throw.
          </li>
          <li>
            <strong>7v7:</strong> lengthen the team period to 20 minutes; the
            extra receivers mean more coverage looks to teach the
            quarterback to read.
          </li>
          <li>
            <strong>Under 8U:</strong> run 45 minutes, keep every block
            shorter, and make flag-pulling a game (sharks-and-minnows) rather
            than a drill.
          </li>
          <li>
            <strong>Adult / travel:</strong> push to 75–90 minutes by
            extending team period and scrimmage; the teaching blocks stay the
            same length.
          </li>
        </ul>

        <h2>Let Coach Cal build your practice plan</h2>
        <p>
          This template is a starting point — the best practice plan is the
          one built around the plays <em>your</em> team is installing this
          week. In XO Gridmaker,{" "}
          <Link href="/coach-cal">Coach Cal</Link> builds a full practice
          plan from your playbook: tell it your variant, age group, and how
          long you have, and it schedules the install, the team period, and
          the drills around the exact concepts you&rsquo;re teaching — then
          you print it and coach.
        </p>

        <h2>Frequently asked questions</h2>
        <dl className="mt-6 space-y-6 not-prose">
          {FAQ.map((item) => (
            <div key={item.q}>
              <dt className="text-base font-semibold">{item.q}</dt>
              <dd className="mt-1 text-sm leading-relaxed text-muted">{item.a}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-12 rounded-2xl bg-primary px-6 py-10 text-center text-white">
        <h2 className="text-2xl font-bold tracking-tight">
          Get a practice plan built from your playbook
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-sm opacity-90">
          Free for solo coaches. Coach Cal turns the plays you&rsquo;re
          installing into a minute-by-minute practice plan you can print.
        </p>
        <Link
          href="/coach-cal"
          className="mt-5 inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-primary transition-colors hover:bg-surface-raised"
        >
          Meet Coach Cal
          <ArrowRight className="size-4" />
        </Link>
      </section>
    </article>
  );
}
