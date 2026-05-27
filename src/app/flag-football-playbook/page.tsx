// SEO landing page targeting "flag football playbook" / "make flag
// football playbook" / "flag football playbook builder" head-term queries.
// Mirrors the structure of /coach-cal (focused intent, FAQ schema,
// internal links into the library). Copy is intentionally direct —
// refine the marketing voice in a follow-up edit.

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Layers, Printer, Share2, Sparkles, Users } from "lucide-react";
import { CONCEPTS } from "@/domain/football-kg/defs/concepts";
import { toLearnSlug } from "@/lib/learn/links";
import { withFullContext } from "@/lib/seo/ld-json";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.xogridmaker.com";
const PAGE_URL = `${SITE_URL}/flag-football-playbook`;

const PAGE_TITLE =
  "Flag football playbook builder (5v5, 6v6, 7v7)";
const PAGE_DESCRIPTION =
  "Build a flag football playbook in minutes. Design plays, organize them by situation, share with your team, and print game-ready wristbands. Free for solo coaches — 5v5, 6v6, and 7v7.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: "/flag-football-playbook" },
  openGraph: {
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    url: PAGE_URL,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
  },
};

const FEATURES = [
  {
    icon: Sparkles,
    title: "Drag-and-drop play designer",
    body: "Place receivers, draw route trees, set defenders. Built around real football primitives — formations, route templates, defensive coverages — so the diagrams are coach-accurate, not generic shapes.",
  },
  {
    icon: Layers,
    title: "Organize plays into playbooks",
    body: "Group plays by situation: 3rd & long, red zone, two-minute. Re-order, duplicate, version. Your playbook lives online and stays in sync across every device.",
  },
  {
    icon: Share2,
    title: "Share with your team",
    body: "Invite assistants and players to view (or edit) your playbook. Coaches see the install order; players see their assignments. No more emailing PDFs.",
  },
  {
    icon: Printer,
    title: "Wristbands + game-day sheets",
    body: "Print numbered call sheets and wristband inserts straight from the playbook. Sized for the standard 3-window wristband; no manual layout.",
  },
  {
    icon: Users,
    title: "Coach Cal — your AI assistant",
    body: "Ask Coach Cal to draw a 5v5 mesh against Cover 2, build a 6-play install for tonight's practice, or scout the defense you saw last week. Plays land in your playbook with one click.",
  },
];

const FAQ = [
  {
    q: "Is XO Gridmaker free to use?",
    a: "Yes — solo coaches can build playbooks for free. Paid plans unlock team sharing, larger playbooks, and Coach Cal (the AI assistant).",
  },
  {
    q: "Does it work for 5v5, 6v6, and 7v7 flag football?",
    a: "Yes. Every play in the library is tagged by variant (5v5 flag, 6v6 flag, 7v7 flag, 11-on-11 tackle), and the editor enforces the right number of players, eligible receivers, and field size per variant.",
  },
  {
    q: "Can I print wristbands?",
    a: "Yes — pick the plays you want on the wristband, and XO Gridmaker generates a print-ready PDF sized for standard 3-window wristbands. Works on any home printer.",
  },
  {
    q: "Do I need to start from scratch?",
    a: "No. The free Football Library has every common flag concept — Mesh, Smash, Snag, Four Verticals, sweeps, RPOs — already drawn and ready to drop into your playbook.",
  },
  {
    q: "Can my players see the playbook?",
    a: "Yes. Invited team members get a player-view of every play (their assignment, the route, the snap count) on their phone. Coaches see the full install.",
  },
];

// Pull a handful of recognizable flag 5v5 concepts to feature on the
// page. These give the page real, indexable internal links into the
// library (Google rewards the linking; coaches use them to evaluate the
// product).
const FEATURED_SLUGS = [
  "mesh",
  "smash",
  "snag",
  "four-verticals",
  "stick",
  "curl-flat",
  "sweep",
  "bubble-rpo",
];

export default function FlagFootballPlaybookPage() {
  const featured = FEATURED_SLUGS.map((slug) => {
    const concept = CONCEPTS.find(
      (c) =>
        toLearnSlug(c.name) === slug &&
        (c.variants ?? []).includes("flag_5v5"),
    );
    return concept ? { slug, concept } : null;
  }).filter((x): x is NonNullable<typeof x> => x !== null);

  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebApplication",
        "@id": `${PAGE_URL}#app`,
        name: "XO Gridmaker",
        applicationCategory: "SportsApplication",
        operatingSystem: "Web, iOS, Android",
        description: PAGE_DESCRIPTION,
        url: SITE_URL,
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "USD",
          description: "Free for solo coaches",
        },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: "/" },
          {
            "@type": "ListItem",
            position: 2,
            name: "Flag football playbook",
            item: "/flag-football-playbook",
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
    <div className="mx-auto max-w-5xl px-6 py-12 text-foreground">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(withFullContext(ld)),
        }}
      />

      <header className="mb-12 text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">
          Flag football · Free playbook builder
        </p>
        <h1 className="mt-3 text-4xl font-extrabold tracking-tight sm:text-5xl">
          Build a flag football playbook
          <br />
          <span className="text-primary">in minutes, not weeks.</span>
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-base text-muted">
          XO Gridmaker is a free flag football playbook builder for 5v5, 6v6,
          and 7v7 coaches. Design plays in a real football editor, organize
          them by situation, share with your team, and print wristbands —
          all in one tool.
        </p>
        <p className="mx-auto mt-3 max-w-2xl text-sm text-muted">
          New to playbook design? Start with the{" "}
          <Link
            href="/learn/how-to-build-a-flag-football-playbook"
            className="text-primary hover:underline"
          >
            step-by-step guide to building a flag football playbook
          </Link>
          .
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link
            href="/login"
            className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-dark"
          >
            Start your free playbook
            <ArrowRight className="size-4" />
          </Link>
          <Link
            href="/learn/library/plays/variant/flag-5v5"
            className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-raised px-6 py-3 text-sm font-semibold text-foreground transition-colors hover:border-primary-light"
          >
            Browse 5v5 flag plays
          </Link>
        </div>
      </header>

      <section className="mb-12">
        <h2 className="mb-6 text-2xl font-bold tracking-tight">
          Everything you need to run a flag football team
        </h2>
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {FEATURES.map((f) => {
            const Icon = f.icon;
            return (
              <li
                key={f.title}
                className="rounded-2xl border border-border bg-surface-raised p-5"
              >
                <Icon className="mb-3 size-6 text-primary" />
                <h3 className="text-lg font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  {f.body}
                </p>
              </li>
            );
          })}
        </ul>
      </section>

      {featured.length > 0 ? (
        <section className="mb-12">
          <h2 className="mb-2 text-2xl font-bold tracking-tight">
            Start with proven 5v5 flag plays
          </h2>
          <p className="mb-6 text-sm text-muted">
            Every concept below is in the free{" "}
            <Link
              href="/learn/library"
              className="text-primary hover:underline"
            >
              Football Library
            </Link>{" "}
            — open any one to see the diagram and add it to your playbook.
          </p>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {featured.map(({ slug, concept }) => (
              <li key={slug}>
                <Link
                  href={`/learn/library/plays/${slug}/flag-5v5`}
                  className="group block rounded-xl border border-border bg-surface-raised p-4 transition-colors hover:border-primary-light"
                >
                  <span className="block text-sm font-semibold text-foreground transition-colors group-hover:text-primary">
                    {concept.name}
                  </span>
                  <span className="mt-1 block text-xs text-muted">
                    {concept.complexity}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-6 flex flex-wrap gap-4 text-sm">
            <Link
              href="/learn/library/plays/variant/flag-5v5"
              className="text-primary hover:underline"
            >
              All 5v5 flag plays →
            </Link>
            <Link
              href="/learn/library/plays/variant/flag-6v6"
              className="text-primary hover:underline"
            >
              All 6v6 flag plays →
            </Link>
            <Link
              href="/learn/library/plays/variant/flag-7v7"
              className="text-primary hover:underline"
            >
              All 7v7 flag plays →
            </Link>
          </div>
        </section>
      ) : null}

      <section className="mb-12 rounded-2xl border border-border bg-surface-raised p-6">
        <h2 className="mb-4 text-2xl font-bold tracking-tight">
          Why coaches pick XO Gridmaker
        </h2>
        <ul className="space-y-3 text-sm">
          {[
            "Real football engine — Cal and the editor share the same play model, so a 5v5 mesh looks like 5v5 mesh, not a generic shape.",
            "Variant-aware — eligibility, field size, and player counts adjust per 5v5 / 6v6 / 7v7 / tackle automatically.",
            "Free tier covers what most solo coaches need; paid unlocks team sharing and Coach Cal.",
            "Works on phone, tablet, and laptop — design at the kitchen table, share to the sideline.",
          ].map((line) => (
            <li key={line} className="flex gap-2">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
              <span className="text-muted">{line}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mb-12">
        <h2 className="mb-6 text-2xl font-bold tracking-tight">
          Frequently asked questions
        </h2>
        <dl className="space-y-5">
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

      <section className="rounded-2xl bg-primary px-6 py-10 text-center text-white">
        <h2 className="text-2xl font-bold tracking-tight">
          Ready to build your flag football playbook?
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-sm opacity-90">
          Free for solo coaches. No credit card. Drop in the plays you
          already run; let XO Gridmaker handle the diagrams and wristbands.
        </p>
        <Link
          href="/login"
          className="mt-5 inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-primary transition-colors hover:bg-surface-raised"
        >
          Start your free playbook
          <ArrowRight className="size-4" />
        </Link>
      </section>
    </div>
  );
}
