// Editorial how-to article — targets "flag football wristband template" /
// "call sheet template" / "how to make a play wristband". High-intent,
// under-served by content (mostly Etsy PDFs), and XO Gridmaker literally
// prints wristband inserts + call sheets — a natural product-tie page.
// AEO-shaped: front-loaded answer, HowTo + FAQ schema, "2026" in title.
//
// Lives at the /learn root (editorial prose), NOT under /learn/library.

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Grid3x3 } from "lucide-react";
import { withFullContext } from "@/lib/seo/ld-json";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.xogridmaker.com";
const PAGE_PATH = "/learn/flag-football-wristband-template";
const PAGE_URL = `${SITE_URL}${PAGE_PATH}`;

const PAGE_TITLE = "Flag Football Wristband & Call-Sheet Template (2026)";
const PAGE_DESCRIPTION =
  "How to make a flag football play wristband and sideline call sheet — how to number your plays, group them by situation, and print three-window wristband inserts. Free template and printer for 5v5, 6v6, and 7v7.";

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

const STEPS = [
  {
    name: "Number your plays",
    text: "Give every play a number, ideally grouped so the number itself hints at the situation (10s = early downs, 20s = 3rd down, 30s = red zone). The QB calls 'Red 24' — the wristband translates it to the actual play.",
  },
  {
    name: "Group by situation, not formation",
    text: "Lay the sheet out by game situation — early downs, 3rd-and-short, 3rd-and-long, red zone, two-minute — so a coach hunting for a 3rd-and-8 call scans one row, not the whole card.",
  },
  {
    name: "Keep each cell to a name + number (and a tiny diagram if it fits)",
    text: "Under game speed, the QB needs the number and the play name, not a paragraph. A small route diagram helps younger players; older QBs just need the call.",
  },
  {
    name: "Print the three-window insert",
    text: "Standard QB wristbands hold a three-window insert (about 2\" x 3\" per window). Print your grid to that size, cut, and slide it in. Make a matching full-page sideline call sheet for the coach.",
  },
  {
    name: "Match the coach's sheet to the wristband",
    text: "The coach's call sheet and the QB's wristband should use the same numbers and layout, so 'Red 24' means the same thing on both. Mismatched sheets are how busted calls happen.",
  },
];

const FAQ = [
  {
    q: "How do flag football play wristbands work?",
    a: "Each play gets a number on a small printed insert worn in a wristband. The coach calls a number ('Red 24'), the quarterback reads the matching play off the wristband and relays it to the huddle. It's the fastest way to call plays without a long huddle, and it lets a young quarterback run a real playbook without memorizing every call.",
  },
  {
    q: "How many plays fit on a flag football wristband?",
    a: "A standard three-window insert holds roughly 12–18 plays comfortably (4–6 per window). That's more than enough — most youth teams should carry 8–12 plays anyway. If you need more, use a color/number system (Red 10s, Blue 20s) rather than shrinking the text past readable.",
  },
  {
    q: "What size is a flag football wristband insert?",
    a: "Standard quarterback wristbands take a three-window insert around 2 inches by 3 inches per window (about 6 inches wide total). Print your play grid to that size, cut along the windows, and slide it in. XO Gridmaker formats the insert to size for you.",
  },
  {
    q: "Should the wristband show play diagrams or just names?",
    a: "For younger players (8U–10U), a tiny diagram plus the number helps them picture the play. For older and more experienced quarterbacks, the name and number are enough and let you fit more plays. Match it to your QB, not to what looks impressive.",
  },
  {
    q: "How do you make a flag football call sheet?",
    a: "Group your plays by situation (early downs, 3rd down, red zone, two-minute) on a single page, number each one, and keep it to one line per play. The coach calls off this sheet; the quarterback's wristband uses the same numbers. You can build and print both from your playbook in XO Gridmaker.",
  },
];

export default function FlagFootballWristbandTemplatePage() {
  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "HowTo",
        "@id": `${PAGE_URL}#howto`,
        name: "How to make a flag football wristband and call sheet",
        description: PAGE_DESCRIPTION,
        step: STEPS.map((s, i) => ({
          "@type": "HowToStep",
          position: i + 1,
          name: s.name,
          text: s.text,
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
          { "@type": "Thing", name: "Play wristband" },
          { "@type": "Thing", name: "Call sheet" },
        ],
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: "/" },
          { "@type": "ListItem", position: 2, name: "Learning Center", item: "/learn/library" },
          { "@type": "ListItem", position: 3, name: "Wristband & call-sheet template", item: PAGE_PATH },
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
          Flag football wristband &amp; call-sheet template
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-muted">
          How to turn your playbook into a quarterback wristband and a
          sideline call sheet — number the plays, group them by situation,
          and print the insert to size. Works for 5v5, 6v6, and 7v7.
        </p>
      </header>

      {/* Front-loaded direct answer: a sample layout the reader (and AI) can lift. */}
      <div className="mb-10 overflow-hidden rounded-2xl border border-border bg-surface-raised">
        <div className="flex items-center gap-2 border-b border-border px-5 py-3">
          <Grid3x3 className="size-4 text-primary" />
          <h2 className="m-0 text-base font-semibold">
            Sample wristband layout (three windows)
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-px bg-border sm:grid-cols-3">
          {[
            { head: "Early downs (10s)", rows: ["11 · Snag", "12 · Mesh", "13 · Sweep", "14 · Stick"] },
            { head: "3rd down (20s)", rows: ["21 · Stick", "22 · QB Draw", "23 · Snag", "24 · Slant-Flat"] },
            { head: "Red zone (30s)", rows: ["31 · Fade", "32 · QB Draw", "33 · Snag", "34 · Flood"] },
          ].map((col) => (
            <div key={col.head} className="bg-surface-raised px-4 py-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-primary">
                {col.head}
              </p>
              <ul className="space-y-1 font-mono text-sm text-muted">
                {col.rows.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="px-5 py-3 text-xs text-muted">
          The QB hears &ldquo;Red 24&rdquo; and reads Slant-Flat off the
          3rd-down window. The coach&rsquo;s call sheet uses the same
          numbers.
        </p>
      </div>

      <section className="prose prose-lg max-w-none text-foreground prose-headings:text-foreground prose-p:text-muted prose-li:text-muted prose-strong:text-foreground prose-a:text-primary">
        <p>
          A play wristband is the fastest huddle in football. Instead of a
          long verbal call, the coach says a number, the quarterback reads
          the play off the wristband, and the offense is on the ball in
          seconds. It also lets a young quarterback run a full playbook
          without memorizing every call — the wristband remembers for them.
          Here&rsquo;s how to build one, plus a matching sideline call sheet.
        </p>

        <h2>1. Number your plays</h2>
        <p>
          Give every play a number, and make the number do double duty:
          group it so the number itself hints at the situation — 10s for
          early downs, 20s for third down, 30s for the red zone. Now
          &ldquo;Red 24&rdquo; isn&rsquo;t just a play, it tells everyone
          it&rsquo;s a third-down call. This is how varsity staffs call
          plays, scaled down for flag.
        </p>

        <h2>2. Group by situation, not by formation</h2>
        <p>
          Lay the card out by game situation — early downs, 3rd-and-short,
          3rd-and-long, red zone, two-minute. A coach looking for a
          3rd-and-8 call has about ten seconds; a situation-sorted card lets
          them scan one row instead of the whole sheet. (This is the same
          principle covered in the{" "}
          <Link href="/learn/how-to-build-a-flag-football-playbook">
            how-to-build-a-playbook guide
          </Link>{" "}
          — organize by situation, always.)
        </p>

        <h2>3. Keep each cell readable at game speed</h2>
        <p>
          Under pressure, the quarterback needs the number and the play
          name — not a paragraph. For younger players (8U–10U), a small
          route diagram next to the name helps them picture it; for older,
          more experienced quarterbacks, the name and number alone let you
          fit more plays. Don&rsquo;t shrink the text past readable to cram
          in more — carry fewer plays instead.
        </p>

        <h2>4. Print the three-window insert</h2>
        <p>
          Standard quarterback wristbands hold a three-window insert — about
          two inches by three inches per window. Print your grid to that
          size, cut along the windows, and slide it in. A three-window
          insert comfortably holds 12–18 plays (four to six per window),
          which is more than most youth teams should carry anyway.
        </p>

        <h2>5. Match the coach&rsquo;s call sheet to the wristband</h2>
        <p>
          Build a full-page sideline call sheet that uses the{" "}
          <em>same numbers and layout</em> as the wristband, so &ldquo;Red
          24&rdquo; means the same play on both. The coach calls off the
          sheet, the quarterback confirms off the wristband. Mismatched
          numbering is one of the most common ways a call gets busted — keep
          them in sync.
        </p>

        <h2>Build and print it in XO Gridmaker</h2>
        <p>
          You don&rsquo;t have to lay this out by hand. In{" "}
          <Link href="/flag-football-playbook">XO Gridmaker</Link>, you build
          your playbook, group the plays by situation, and print both a
          quarterback wristband insert (sized to the three-window standard)
          and a matching sideline call sheet — numbered and in sync,
          straight from the plays you designed. It&rsquo;s free for solo
          coaches. If you haven&rsquo;t built the playbook yet, start with
          the{" "}
          <Link href="/learn/library/plays/variant/flag-5v5">
            5v5 flag play library
          </Link>{" "}
          and drop in the plays you want.
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
          Print your wristbands and call sheet
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-sm opacity-90">
          Free for solo coaches. Build your playbook, then print a
          quarterback wristband insert and a matching sideline call sheet —
          numbered and in sync.
        </p>
        <Link
          href="/flag-football-playbook"
          className="mt-5 inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-primary transition-colors hover:bg-surface-raised"
        >
          See the playbook builder
          <ArrowRight className="size-4" />
        </Link>
      </section>
    </article>
  );
}
