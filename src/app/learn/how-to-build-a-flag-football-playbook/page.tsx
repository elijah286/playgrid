// Editorial how-to article — targets informational intent for the query
// "make / build a flag football playbook" (which is mostly "how do I
// make a flag football playbook" in Google's eyes). Pairs with the
// product landing at /flag-football-playbook, which targets the
// transactional half of the same search.
//
// Lives at the /learn root (NOT under /learn/library) because the
// library is reference-catalog content with a single render path per
// Rule 14, while this is editorial prose. Mixing them muddies both
// surfaces.
//
// Copy is intentionally substantive (~1,800 words) so it can compete
// with the NFL FLAG article that currently owns this query. Edit for
// voice without changing structure — the H2 outline and internal-link
// anchor text are doing real SEO work.

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ListChecks } from "lucide-react";
import { withFullContext } from "@/lib/seo/ld-json";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.xogridmaker.com";
const PAGE_PATH = "/learn/how-to-build-a-flag-football-playbook";
const PAGE_URL = `${SITE_URL}${PAGE_PATH}`;

const PAGE_TITLE = "How to build a flag football playbook (step-by-step guide)";
const PAGE_DESCRIPTION =
  "A coach's guide to building a flag football playbook from scratch — how many plays to install, how to pick formations, how to organize by situation, and how to print wristbands. Works for 5v5, 6v6, and 7v7.";

// Use a fixed date so the article doesn't appear constantly "republished"
// (which Google demotes as low-quality signal). Bump when the article
// gets a real content revision.
const PUBLISHED_ISO = "2026-05-26";
const MODIFIED_ISO = "2026-05-26";

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

const FAQ = [
  {
    q: "How many plays should be in a flag football playbook?",
    a: "Eight to twelve for most teams. Younger players (8U–10U) do best with six to eight. Older and more experienced teams (12U+, adult rec, 7v7 travel) can carry twelve to sixteen. The bottleneck is never the coach — it's how many plays your quarterback can call cleanly and your receivers can run without a hitch.",
  },
  {
    q: "How long does it take to install a flag football playbook?",
    a: "Two practices to install eight plays, three to four practices to install twelve, if you treat installs as the first 15–20 minutes of practice and rep each play three to five times. The plays don't have to be perfect after install — they have to be recognizable. Polish happens in weeks two through four.",
  },
  {
    q: "What's the ideal first play to install?",
    a: "A quick-game pass that beats man and zone the same way — usually slant-flat, stick, or snag. These take pressure off the quarterback (short throws, easy reads) and give every receiver a defined job on every snap. Save deep concepts (Mesh, Four Verticals) for after your team can execute the basics.",
  },
  {
    q: "Should you script every play call?",
    a: "Script your first two to three plays of each half, then call live the rest of the way. Scripting your opener guarantees you start on something you've repped to death; live-calling after that lets you respond to what the defense actually shows. Don't script the whole half — coaches who do that get out-adjusted by halftime.",
  },
  {
    q: "Do flag football playbooks need a separate defense?",
    a: "Yes, but it's simpler than offense. Most flag teams run one base coverage (Cover 2 or Cover 3 in 7v7; man-everywhere in 5v5) plus one change-up (a blitz or a Cover 0). That's two defensive calls total. Anything more and your defenders start covering the wrong receiver.",
  },
];

export default function HowToBuildFlagFootballPlaybookPage() {
  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        "@id": `${PAGE_URL}#article`,
        headline: PAGE_TITLE,
        description: PAGE_DESCRIPTION,
        url: PAGE_URL,
        datePublished: PUBLISHED_ISO,
        dateModified: MODIFIED_ISO,
        author: {
          "@type": "Organization",
          name: "XO Gridmaker",
          url: SITE_URL,
        },
        publisher: {
          "@type": "Organization",
          name: "XO Gridmaker",
          url: SITE_URL,
        },
        mainEntityOfPage: { "@type": "WebPage", "@id": PAGE_URL },
        about: [
          { "@type": "Thing", name: "Flag football" },
          { "@type": "Thing", name: "Football playbook" },
          { "@type": "Thing", name: "Coaching" },
        ],
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: "/" },
          {
            "@type": "ListItem",
            position: 2,
            name: "Learning Center",
            item: "/learn/library",
          },
          {
            "@type": "ListItem",
            position: 3,
            name: "How to build a flag football playbook",
            item: PAGE_PATH,
          },
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
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(withFullContext(ld)),
        }}
      />

      <header className="mb-10">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">
          Coaching guide · Flag football
        </p>
        <h1 className="mt-3 text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
          How to build a flag football playbook
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-muted">
          A step-by-step guide for coaches who want a playbook their team
          can actually run — sized for 5v5, 6v6, or 7v7, and finished
          before your next practice.
        </p>
      </header>

      <section className="prose prose-lg max-w-none text-foreground prose-headings:text-foreground prose-p:text-muted prose-li:text-muted prose-strong:text-foreground prose-a:text-primary">
        <p>
          The biggest mistake new flag football coaches make is building
          too many plays. A playbook with thirty concepts feels impressive
          on paper and falls apart on a Saturday morning, because your
          quarterback can&rsquo;t remember the calls, your receivers
          can&rsquo;t remember their assignments, and the whole offense
          stalls into the same broken scramble every snap. A playbook with
          eight plays — installed cleanly, repped relentlessly, and
          organized by situation — wins more games than one with thirty.
        </p>
        <p>
          This guide walks through how to build that playbook, in the
          order a coach actually needs to make decisions: how many plays,
          which formations, which concepts, how to organize, and how to
          get it into your players&rsquo; hands before kickoff. It works
          for 5v5, 6v6, and 7v7 flag — the principles don&rsquo;t change,
          only the numbers do.
        </p>

        <div className="my-8 rounded-2xl border border-border bg-surface-raised p-5 not-prose">
          <h2 className="m-0 mb-3 flex items-center gap-2 text-base font-semibold">
            <ListChecks className="size-4 text-primary" />
            What you&rsquo;ll end up with
          </h2>
          <ul className="m-0 space-y-1 text-sm text-muted">
            <li>An 8–12 play install sized for your team and variant</li>
            <li>A primary formation everything runs from</li>
            <li>
              Plays grouped by situation (early downs, 3rd & long, red
              zone, two-minute)
            </li>
            <li>A simple defensive call sheet</li>
            <li>Printed wristbands or a sideline call sheet</li>
          </ul>
        </div>

        <h2>1. Decide how many plays to install</h2>
        <p>
          Eight to twelve plays is the sweet spot for most teams. Younger
          divisions (8U–10U) work best with six to eight; older and more
          experienced teams (12U+, adult rec, 7v7 travel) can carry twelve
          to sixteen without losing execution. The right number is the
          number your quarterback can call cleanly under pressure and your
          receivers can run without thinking twice.
        </p>
        <p>
          If you&rsquo;re unsure, install fewer than you think you need.
          You can always add plays in week three once the base is sticky.
          You can&rsquo;t un-install a play that&rsquo;s already
          confusing your team.
        </p>
        <p>
          A useful starting split:
        </p>
        <ul>
          <li>
            <strong>Four pass concepts</strong> (quick game + one shot
            play)
          </li>
          <li>
            <strong>Two run concepts</strong> (one to each side, or one
            run + one RPO)
          </li>
          <li>
            <strong>One screen or trick play</strong> (changes the
            picture, buys time when you need a quick six)
          </li>
          <li>
            <strong>One blank slot</strong> for the play your team
            invents in practice that you couldn&rsquo;t plan for
          </li>
        </ul>

        <h2>2. Pick one primary formation</h2>
        <p>
          Run every play out of the same formation if you can. Coaches
          who jump between four formations to look multi-dimensional end
          up with a quarterback who can&rsquo;t remember which formation
          a play is called from, and receivers who line up in the wrong
          spot half the time. One formation, eight plays out of it, is
          stronger than four formations and twenty plays.
        </p>
        <p>
          For most flag football teams, the right primary formation is a
          balanced spread:
        </p>
        <ul>
          <li>
            <strong>5v5:</strong> 2x2 with the center and quarterback in
            the middle. Both outside receivers and both slots are eligible;
            in most rule sets the center is too — check yours.
          </li>
          <li>
            <strong>6v6 / 7v7:</strong> Trips one side, single receiver
            backside (3x1). Forces defenses to declare strength and gives
            your best receiver isolation on the backside.
          </li>
        </ul>
        <p>
          Once your team has that formation cold, add one secondary look
          (often a bunch or empty set) for plays that need it. Browse{" "}
          <Link href="/learn/library/formations?v=flag-5v5">
            every flag football formation in the library
          </Link>{" "}
          to see what each one buys you and which plays naturally fit it.
        </p>

        <h2>3. Install the right four pass concepts first</h2>
        <p>
          The fastest path to a competent passing game is four concepts
          that, together, beat both man and zone coverage from your
          primary formation. Coaches who pick four random plays they
          &ldquo;saw on YouTube&rdquo; end up with four plays that all
          beat the same coverage and nothing for the look they actually
          see most weeks.
        </p>
        <p>Here&rsquo;s a starting set:</p>
        <ul>
          <li>
            <strong>
              <Link href="/learn/library/plays/snag/flag-5v5">Snag</Link>
              :
            </strong>{" "}
            quick-game triangle that gives the quarterback a one-read
            answer against any coverage. Best first play to install.
          </li>
          <li>
            <strong>
              <Link href="/learn/library/plays/mesh/flag-5v5">Mesh</Link>
              :
            </strong>{" "}
            two crossing routes that hunt zone holes and rub man
            defenders. Easy install, hard to defend, scales from 5v5 up
            to 11-on-11 unchanged.
          </li>
          <li>
            <strong>
              <Link href="/learn/library/plays/stick/flag-5v5">Stick</Link>
              :
            </strong>{" "}
            a 5-yard read that punishes flat defenders who jump quick
            outs and corners that bail too early.
          </li>
          <li>
            <strong>
              <Link href="/learn/library/plays/four-verticals/flag-5v5">
                Four Verticals
              </Link>
              :
            </strong>{" "}
            your shot play. Once a week, when the safety creeps up or
            the corners are pressing, you take a deep one.
          </li>
        </ul>
        <p>
          Each of those concepts has a coaching breakdown — what to teach
          the quarterback, the most common receiver mistake, how to call
          it against different coverages — on its{" "}
          <Link href="/learn/library">library page</Link>. Read those
          first, then run the play in practice; you&rsquo;ll catch
          problems in install instead of week three.
        </p>

        <h2>4. Add the run game (yes, even in flag)</h2>
        <p>
          Flag football is not just pass-pass-pass. Teams that can hand
          the ball off or run the quarterback force defenses to play
          honest, and a defense that&rsquo;s honest is a defense your
          pass game eats alive. Two run concepts is plenty:
        </p>
        <ul>
          <li>
            <strong>
              <Link href="/learn/library/plays/sweep/flag-5v5">Sweep</Link>
              :
            </strong>{" "}
            a back or motion receiver takes a pitch and attacks the edge.
            Beats defenses that crowd the middle.
          </li>
          <li>
            <strong>
              <Link href="/learn/library/plays/qb-draw/flag-5v5">
                QB Draw
              </Link>
              :
            </strong>{" "}
            the quarterback sells pass for a beat, then runs through the
            soft middle of a deep coverage. The best 3rd-and-medium play
            in flag football, full stop.
          </li>
        </ul>

        <h2>5. Have one trick play in your back pocket</h2>
        <p>
          A trick play does two things: it scores a touchdown when you
          need one, and it makes the defense second-guess every snap for
          the rest of the game. Pick one, install it, save it for the
          right moment:
        </p>
        <ul>
          <li>
            <strong>
              <Link href="/learn/library/plays/flea-flicker/flag-5v5">
                Flea-flicker:
              </Link>
            </strong>{" "}
            handoff, pitch back to quarterback, deep shot. Works when the
            defense has bitten on your run game two weeks in a row.
          </li>
          <li>
            <strong>
              <Link href="/learn/library/plays/jet-reverse/flag-5v5">
                Jet Reverse:
              </Link>
            </strong>{" "}
            motion one way, hand off the other. Confuses defenses that
            chase motion.
          </li>
        </ul>

        <h2>6. Organize the playbook by situation, not by formation</h2>
        <p>
          When you put your playbook on a wristband or sideline sheet,
          the layout matters more than the plays. A coach who&rsquo;s
          looking for a 3rd-and-8 call has ten seconds to find one.
          Sorting plays by formation forces them to scan the whole sheet.
          Sorting plays by situation lets them look at one row.
        </p>
        <p>Group your plays into these buckets:</p>
        <ul>
          <li>
            <strong>Early downs (1st and 2nd):</strong> your bread-and-
            butter — Snag, Mesh, Sweep. Three to four plays.
          </li>
          <li>
            <strong>3rd &amp; short (1–4 yards):</strong> high-percentage
            quick game. Snag, Stick, QB Draw.
          </li>
          <li>
            <strong>3rd &amp; long (5+ yards):</strong> needs a deeper
            concept — Mesh going through the sticks, Four Verticals if you
            need it now.
          </li>
          <li>
            <strong>Red zone (inside the 10):</strong> compressed-field
            concepts. Stick and Snag still work; add a fade-flat for the
            corner of the end zone.
          </li>
          <li>
            <strong>Two-minute / quick score:</strong> Four Verticals,
            your shot play, plus a check-down so you&rsquo;re never
            stuck.
          </li>
          <li>
            <strong>Goal line:</strong> one or two specific plays —
            usually a QB Draw and a fade.
          </li>
        </ul>

        <h2>7. Add a (very small) defensive playbook</h2>
        <p>
          Defense is simpler than offense in flag football, and it should
          be. The right number of defensive calls is two: one base
          coverage and one change-up.
        </p>
        <ul>
          <li>
            <strong>5v5 / 6v6:</strong> man-everywhere as the base
            (rushers blitz the quarterback; everyone else takes a
            receiver). Cover 0 (zero deep safety) as the change-up when
            you need a sack.
          </li>
          <li>
            <strong>7v7:</strong> Cover 2 or Cover 3 as the base (split
            the field into deep zones); a single-receiver blitz as the
            change-up. Avoid Cover 4 in 7v7 unless your safeties are
            cerebral — it&rsquo;s easy to get out of position.
          </li>
        </ul>
        <p>
          Browse the{" "}
          <Link href="/learn/library/defense">defensive scheme library</Link>{" "}
          to see how each call works and which fronts pair with which
          coverages.
        </p>

        <h2>8. Print wristbands or a sideline call sheet</h2>
        <p>
          Your playbook needs to leave your laptop and get into your
          team&rsquo;s hands. Two options:
        </p>
        <ul>
          <li>
            <strong>Wristbands</strong> — number each play, print
            three-window wristband inserts, slip them into standard
            quarterback wristbands. The quarterback calls plays by
            number (&ldquo;Red 14&rdquo;), the wristband translates.
            Fastest huddle in the game.
          </li>
          <li>
            <strong>Sideline call sheet</strong> — single sheet of paper
            organized by the situation buckets above. The coach calls,
            the quarterback acknowledges, the team runs it.
          </li>
        </ul>
        <p>
          Most teams use both: the coach has the call sheet, the
          quarterback has the wristband.
        </p>

        <h2>9. Test the install in week one, adjust in week two</h2>
        <p>
          Every coach&rsquo;s first playbook has a play that just
          doesn&rsquo;t work for their team. Maybe your receivers
          can&rsquo;t time Mesh, maybe Stick falls apart when the corner
          presses. Cut the play and replace it with one that fits your
          personnel. Better to drop a play in week two than to call it
          every week for a season and lose the same game six times.
        </p>

        <h2>10. Build it in XO Gridmaker</h2>
        <p>
          Everything in this guide — the formation picker, the play
          library with diagrams already drawn, the wristband printer,
          the per-situation organization, the defensive call sheet —
          lives in{" "}
          <Link href="/flag-football-playbook">XO Gridmaker</Link>,
          which is free for solo coaches.
        </p>
        <p>
          The fastest path: open the{" "}
          <Link href="/learn/library/plays/variant/flag-5v5">
            5v5 flag play library
          </Link>{" "}
          (or{" "}
          <Link href="/learn/library/plays/variant/flag-7v7">7v7</Link>
          ), click the eight plays above to drop them into your
          playbook, set your formation, group them by situation, print
          your wristbands. Twenty minutes, end to end. Your first
          practice gets a real install instead of an improvised one.
        </p>

        <h2>Frequently asked questions</h2>
        <dl className="mt-6 space-y-6 not-prose">
          {FAQ.map((item) => (
            <div key={item.q}>
              <dt className="text-base font-semibold">{item.q}</dt>
              <dd className="mt-1 text-sm leading-relaxed text-muted">
                {item.a}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-12 rounded-2xl bg-primary px-6 py-10 text-center text-white">
        <h2 className="text-2xl font-bold tracking-tight">
          Build your playbook in XO Gridmaker
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-sm opacity-90">
          Free for solo coaches. No credit card. Drop in the plays from
          this guide; XO Gridmaker handles diagrams, wristbands, and
          team sharing.
        </p>
        <Link
          href="/flag-football-playbook"
          className="mt-5 inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-primary transition-colors hover:bg-surface-raised"
        >
          See the flag football playbook builder
          <ArrowRight className="size-4" />
        </Link>
      </section>
    </article>
  );
}
