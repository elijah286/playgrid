import type { Metadata } from "next";
import Link from "next/link";
import { getFreeMaxPlaysPerPlaybook } from "@/lib/site/free-plays-config";
import { getCoachAiEvalDays } from "@/lib/site/coach-ai-eval-config";
import {
  SEAT_PRICE_USD_PER_MONTH,
  MESSAGE_PACK_PRICE_USD_PER_MONTH,
  MESSAGE_PACK_SIZE,
} from "@/lib/billing/seats-config";
import { getSeatDefaults } from "@/lib/site/seat-defaults-config";

export const metadata: Metadata = {
  title: "FAQ — XO Gridmaker & Coach Cal",
  description:
    "Answers about XO Gridmaker — what it costs, who it's for, how sharing works — plus a dedicated section on Coach Cal, the AI coaching partner that helps you build plays, plan practices, and review your playbook.",
  alternates: { canonical: "/faq" },
  openGraph: {
    title: "XO Gridmaker FAQ — including Coach Cal AI",
    description:
      "What XO Gridmaker is, who it's for, how sharing works, and what Coach Cal can do for you.",
    url: "/faq",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "XO Gridmaker FAQ",
    description:
      "Answers from coaches — about the playbook tool and about Coach Cal AI.",
  },
};

type Faq = { q: string; a: string };
type Section = { id: string; title: string; intro?: string; faqs: Faq[] };

function buildSections(
  freeMaxPlays: number,
  coachSeats: number,
  evalDays: number,
): Section[] {
  const evalLabel = `${evalDays}-day`;
  const evalLabelPlural = `${evalDays} day${evalDays === 1 ? "" : "s"}`;
  return [
    {
      id: "general",
      title: "About XO Gridmaker",
      faqs: [
        {
          q: "What is XO Gridmaker?",
          a: "XO Gridmaker is a football play designer for coaches. You draw plays on a field, organize them into playbooks, and share them with your team — on phones, tablets, or printed wristband cards.",
        },
        {
          q: "Who is it for?",
          a: "Flag football, youth tackle, middle school, and 7v7 coaches — plus anyone who coaches their own kids at the kitchen table. It was built by a coach for coaches who want a faster alternative to PowerPoint, whiteboards, and napkin sketches.",
        },
        {
          q: "How is this different from drawing plays in PowerPoint or Keynote?",
          a: "XO Gridmaker understands football. Players have positions, routes are route trees, formations are formations — not just shapes. That means the app can animate plays, keep them legible at any size, share them as live pages instead of static images, and feed structured data to Coach Cal so its suggestions are grounded in real X's and O's.",
        },
      ],
    },
    {
      id: "pricing",
      title: "Pricing & plans",
      faqs: [
        {
          q: "Is XO Gridmaker free?",
          a: `Yes, there's a free tier that gives you one playbook with up to ${freeMaxPlays} plays — enough to design a small playbook without paying. Paid plans scale with how much you use it: unlimited plays, more playbooks, team invites, wristbands, and Coach Cal AI on Coach Pro. See the pricing page for current plan details.`,
        },
        {
          q: "Can my whole staff use one Team Coach plan?",
          a: `Team Coach includes ${coachSeats} collaborator seat${coachSeats === 1 ? "" : "s"} — enough for a small staff. Beyond that, extra seats are $${SEAT_PRICE_USD_PER_MONTH}/seat/month, billed to the head coach. If an assistant already has their own Team Coach or Coach Pro plan, they don't count against your seats — they ride on their own subscription.`,
        },
        {
          q: "What's the difference between Team Coach and Coach Pro?",
          a: `Team Coach is the full collaboration suite — unlimited playbooks, Game Mode, team invites, printing. Coach Pro is everything in Team Coach plus Coach Cal, the AI coaching partner: 200 messages/month, AI play and playbook generation, strategy feedback vs. specific defenses, and bulk formation edits. Coach Pro starts with a ${evalLabel} free trial.`,
        },
      ],
    },
    {
      id: "plays",
      title: "Plays, formations & print",
      faqs: [
        {
          q: "What formations and play types does it support?",
          a: "Both offense and defense, across 5v5 flag, 7v7, and 11-man formations. You can draw routes, blocks, motions, and zones. Formations and route semantics are preserved as structured data, not just lines on a canvas.",
        },
        {
          q: "Can I print wristband-sized play cards?",
          a: "Yes. Playbooks have a print view designed for wristband cards and sideline sheets. Plays scale cleanly so the drawings stay readable at small sizes.",
        },
        {
          q: "Can I export my plays?",
          a: "Yes — you can print playbooks and export the page to PDF from your browser. Individual plays can be shared as links that render cleanly on any device.",
        },
        {
          q: "Does it work on the sideline?",
          a: "It runs in the browser on phones and tablets, so you can pull up your playbook during a game without installing anything. Most coaches design on a laptop and reference on a phone at the field.",
        },
        {
          q: "Is there a mobile app?",
          a: "We're actively building native iOS and Android apps and aim to have them in the App Store and Google Play before the summer season. In the meantime, every feature works in any mobile browser — open xogridmaker.com on your phone or tablet and you'll get the full editor, Game Mode, sharing, and printable wristband sheets without installing anything. Coaches who add the site to their home screen get a near-app experience today.",
        },
      ],
    },
    {
      id: "sharing",
      title: "Sharing & team",
      faqs: [
        {
          q: "Can I share plays with players and parents?",
          a: "Yes. Every play and playbook can be shared by link. Players and parents don't need an account to view — they open the link on any device and see a clean, animated view of the play.",
        },
        {
          q: "What is Game Mode?",
          a: "Game Mode is a sideline-first view included with Team Coach. Open a play full-screen, tap the field to run motion and the snap, then tag the outcome with a thumbs-up or thumbs-down. When the game ends, save the session with score and notes — your call log becomes data you can use to see what's working and refine your playbook between games.",
        },
      ],
    },
    {
      id: "coach-cal",
      title: "Coach Cal — your AI coaching partner",
      intro:
        "Coach Cal is the AI assistant included with Coach Pro. It knows football, knows your playbook, and can do real work — generate plays, review your playbook, plan practice, and answer the questions you'd otherwise text another coach about.",
      faqs: [
        {
          q: "What is Coach Cal?",
          a: "Coach Cal is the AI coaching partner included with Coach Pro. You chat with Coach Cal in the app — about a specific play, about your whole playbook, or about coaching in general — and it answers using a curated football knowledge base plus the actual contents of your playbook (when you give it permission).",
        },
        {
          q: "What can Coach Cal actually do?",
          a: "Coach Cal can: generate full plays from a description, draft a whole starter playbook for a variant (5v5 flag, 7v7, etc.), review your existing playbook and call out gaps or weaknesses, suggest counters to a specific defense, propose practice plans built around the plays you already have, adjust your playbook to your team's skill level, and answer coaching questions grounded in age-appropriate fundamentals.",
        },
        {
          q: "Can Coach Cal really create plays for me, or just give advice?",
          a: "Both. Coach Cal can write plays directly into your playbook — formations, routes, motions, tags — that you can then edit by hand in the same editor you'd use yourself. It's not a chatbot wrapper around screenshots; it speaks the same structured-play format that the editor uses, so generated plays animate, print, and share like any other play.",
        },
        {
          q: "Does Coach Cal know about my playbook?",
          a: "Coach Cal can be scoped to a specific playbook so it sees the formations, plays, tags, and notes you've created. By default the chat is general-purpose; when you open it from a playbook page or toggle the playbook scope, it pulls in that playbook's contents so suggestions are grounded in what your team actually runs.",
        },
        {
          q: "Does Coach Cal work for my age level and football variant?",
          a: "Yes. The knowledge base has age-tier-aware content (8u flag through middle school and high school) and is segmented by variant (5v5 flag, 7v7, 11-man tackle). When Coach Cal answers, it weights advice toward what's appropriate for your level — practice templates, drill suggestions, and play complexity all adjust.",
        },
        {
          q: "How much does Coach Cal cost?",
          a: `Coach Cal is included with Coach Pro at $25/month (or $250/year). New Coach Pro users get a ${evalLabel} free trial — no credit card required to try the chat. After the trial, the plan includes 200 messages per month.`,
        },
        {
          q: "What happens if I use up my 200 messages?",
          a: `Two options: wait for the next monthly cycle (the cap resets automatically), or add a message pack — ${MESSAGE_PACK_SIZE} additional messages for $${MESSAGE_PACK_PRICE_USD_PER_MONTH}/month. Packs stack on top of your monthly allowance, so heavy users can add multiple. You'll see a meter inside the chat showing where you are.`,
        },
        {
          q: "Can Coach Cal help me plan practice?",
          a: "Yes — practice planning is a first-class capability. Coach Cal can build practice plans with timed blocks, parallel activities (Skill / Line / Specialists), drill suggestions tied to the plays in your playbook, and equipment requirements. You can save the result as a Practice Plan inside the playbook.",
        },
        {
          q: "Can Coach Cal review my playbook for weaknesses?",
          a: "Yes. Ask Coach Cal to audit your playbook and it'll surface things like: \"you don't have a counter to Cover 3,\" \"your two short-yardage plays both attack the same gap,\" or \"you're missing an underneath option from this formation.\" It can then propose specific plays to fill the gaps.",
        },
        {
          q: "Are my conversations private? Is my data used to train an AI model?",
          a: "Your chats are tied to your account and only visible to you. Coach Cal sends your messages to OpenAI or Anthropic (whichever the site administrator has configured) to generate responses; both providers' API terms forbid training on customer data by default. We don't share your conversations with anyone, and you can delete a thread from inside the chat. See the Privacy policy for the full list of sub-processors.",
        },
        {
          q: "Which AI model is Coach Cal built on?",
          a: "Coach Cal runs on top of large language models from OpenAI and Anthropic (Claude). The active provider is selected by XO Gridmaker — we choose whichever model we've found to give the best football answers at any given time. The football-specific knowledge base (KB chunks for fundamentals, formations, drills, game management, practice templates) is XO Gridmaker's own, layered on top of the underlying LLM.",
        },
      ],
    },
    {
      id: "getting-started",
      title: "Getting started",
      faqs: [
        {
          q: "How do I get started?",
          a: `Browse the example playbooks to see what's possible, then create a free account and start a playbook. Most coaches have their first play drawn within a couple of minutes. To try Coach Cal, upgrade to Coach Pro — the first ${evalLabelPlural} are free.`,
        },
      ],
    },
  ];
}

export default async function FaqPage() {
  const [freeMaxPlays, seatDefaults, evalDays] = await Promise.all([
    getFreeMaxPlaysPerPlaybook(),
    getSeatDefaults(),
    getCoachAiEvalDays(),
  ]);
  const sections = buildSections(freeMaxPlays, seatDefaults.coach, evalDays);
  const allFaqs = sections.flatMap((s) => s.faqs);

  // Single FAQPage entity covering every Q&A in the page — Google
  // shows rich-result snippets from this regardless of how the visible
  // markup is grouped on screen.
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: allFaqs.map(({ q, a }) => ({
        "@type": "Question",
        name: q,
        acceptedAnswer: { "@type": "Answer", text: a },
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: "/" },
        { "@type": "ListItem", position: 2, name: "FAQ", item: "/faq" },
      ],
    },
  ];

  return (
    <article className="mx-auto max-w-2xl px-6 py-16 text-foreground">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <h1 className="text-3xl font-extrabold tracking-tight">
        Frequently asked questions
      </h1>
      <p className="mt-3 text-base text-muted">
        Quick answers for coaches kicking the tires on XO Gridmaker — plus
        a dedicated section on{" "}
        <a href="#coach-cal" className="font-medium text-foreground hover:underline">
          Coach Cal
        </a>
        , the AI coaching partner.
      </p>

      {/* Jump-link table of contents — gives Google a clear anchor map
          and lets users (especially anyone arriving from a "Coach Cal"
          search) skip straight to the right section. */}
      <nav
        aria-label="On this page"
        className="mt-8 rounded-lg border border-border bg-surface-inset p-4 text-sm"
      >
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">
          On this page
        </p>
        <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
          {sections.map((s) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                className="font-medium text-foreground hover:underline"
              >
                {s.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-12 space-y-14">
        {sections.map((section) => (
          <section key={section.id} id={section.id} className="scroll-mt-24">
            <h2 className="text-2xl font-bold tracking-tight">
              {section.title}
            </h2>
            {section.intro && (
              <p className="mt-2 text-base text-muted">{section.intro}</p>
            )}
            <dl className="mt-6 space-y-7">
              {section.faqs.map(({ q, a }) => (
                <div key={q}>
                  <dt className="text-lg font-semibold text-foreground">{q}</dt>
                  <dd className="mt-2 text-base leading-relaxed text-muted">
                    {a}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>

      <div className="mt-14 rounded-lg border border-border bg-surface-inset p-5 text-sm text-muted">
        <p>
          Still have a question?{" "}
          <Link
            href="/contact"
            className="font-medium text-foreground hover:underline"
          >
            Get in touch
          </Link>{" "}
          — or{" "}
          <Link
            href="/#tour"
            className="font-medium text-foreground hover:underline"
          >
            take the tour
          </Link>{" "}
          to see XO Gridmaker in action.
        </p>
      </div>
    </article>
  );
}
