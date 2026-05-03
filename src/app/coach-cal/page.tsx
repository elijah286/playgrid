import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Brain,
  CalendarCheck,
  ClipboardList,
  Layers,
  Lock,
  MessageSquare,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  Wand2,
} from "lucide-react";
import { CoachAiIcon } from "@/features/coach-ai/CoachAiIcon";
import {
  MESSAGE_PACK_PRICE_USD_PER_MONTH,
  MESSAGE_PACK_SIZE,
} from "@/lib/billing/seats-config";

/* -------------------------------------------------------------------------
   SEO. Target keywords (in order of intent strength):
     - "AI football coach" / "football AI assistant"
     - "AI football playbook generator"
     - "youth football AI"
     - "Coach Cal" (brand term)
   The page is a dedicated landing surface so we can rank for those
   queries; /faq still has the answers, /#tour has the product walkthrough.
   ------------------------------------------------------------------------- */

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.xogridmaker.com";
const PAGE_URL = `${SITE_URL}/coach-cal`;
const OG_IMAGE = `${SITE_URL}/marketing/screens/hero-poster.png`;

const PAGE_TITLE = "Coach Cal — AI Football Coach for Plays & Playbooks";
const PAGE_DESCRIPTION =
  "Coach Cal is an AI football coaching partner that generates plays and full playbooks, game-plans offense and defense, reviews last week's game, schedules your season, builds situational call sheets, and writes QB reads — built for youth, flag, 7v7, and tackle. Free for 7 days.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  keywords: [
    "Coach Cal",
    "AI football coach",
    "football AI assistant",
    "AI football playbook generator",
    "AI play generator",
    "youth football AI",
    "flag football AI",
    "7v7 AI",
    "football coaching app AI",
    "AI practice plan",
    "playbook review AI",
    "AI defensive coordinator",
    "AI football defensive playbook",
    "AI game review football",
    "AI football schedule generator",
    "red zone playbook AI",
    "AI QB reads",
    "AI football coaching notes",
  ],
  alternates: { canonical: PAGE_URL },
  openGraph: {
    type: "website",
    url: PAGE_URL,
    siteName: "XO Gridmaker",
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    images: [
      {
        url: OG_IMAGE,
        width: 1440,
        height: 900,
        alt: "Coach Cal — AI football coaching partner inside XO Gridmaker",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    images: [OG_IMAGE],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

/* JSON-LD: SoftwareApplication entity for Coach Cal specifically (so
   Google can associate the URL with the AI feature) + a Service entity
   for category targeting + BreadcrumbList. */
const STRUCTURED_DATA = [
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Coach Cal",
    alternateName: "Coach Cal AI — football coaching partner",
    applicationCategory: "SportsApplication",
    applicationSubCategory: "AI Coaching Assistant",
    operatingSystem: "Web (any modern browser), iOS, Android",
    url: PAGE_URL,
    description: PAGE_DESCRIPTION,
    image: OG_IMAGE,
    isPartOf: {
      "@type": "SoftwareApplication",
      name: "XO Gridmaker",
      url: SITE_URL,
    },
    offers: {
      "@type": "Offer",
      price: "25",
      priceCurrency: "USD",
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        price: "25",
        priceCurrency: "USD",
        unitText: "MONTH",
      },
      availability: "https://schema.org/InStock",
      eligibleCustomerType: "https://schema.org/Enduser",
    },
    featureList: [
      "AI play generation",
      "AI full-playbook generation",
      "Offensive game-planning vs. specific defenses",
      "Defensive game-planning vs. specific offenses",
      "Post-game review and weekly playbook adjustments",
      "Season-wide schedule generation (practices, games, RSVPs)",
      "Playbook review for skill level and league fit",
      "Situational play recommendations (red zone, 3rd-and-short, opening drive)",
      "QB read and per-position coaching note generation",
      "Practice plan generation",
      "Age-tier-aware coaching answers (8u flag through high school)",
      "Variant-aware (5v5 flag, 7v7, 11-man tackle)",
    ],
    publisher: {
      "@type": "Organization",
      name: "XO Gridmaker",
      url: SITE_URL,
      logo: `${SITE_URL}/brand/xogridmaker_icon.svg`,
    },
  },
  {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "XO Gridmaker", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Coach Cal", item: PAGE_URL },
    ],
  },
];

const BRAND_BLUE = "#1769FF";
const BRAND_GREEN = "#95CC1F";
const BRAND_NAVY = "#0F1E3D";
const BRAND_ORANGE = "#F26522";

export default function CoachCalPage() {
  return (
    <div className="bg-surface text-foreground">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }}
      />
      <Hero />
      <Capabilities />
      <KnowsYourTeam />
      <BuiltForLevel />
      <Privacy />
      <Pricing />
      <FaqShortcut />
      <FinalCta />
    </div>
  );
}

/* ---------- Hero ---------- */

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-80"
        style={{
          background:
            "radial-gradient(60% 55% at 15% 10%, rgba(23,105,255,0.16), transparent), radial-gradient(45% 50% at 95% 20%, rgba(149,204,31,0.18), transparent)",
        }}
      />
      <div className="mx-auto grid max-w-6xl gap-12 px-6 py-20 md:grid-cols-[1.1fr_1fr] md:items-center md:py-28">
        <div>
          <p
            className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider"
            style={{ background: "#E5EDFF", color: BRAND_BLUE }}
          >
            <Sparkles className="size-3.5" /> AI coaching partner
          </p>
          <h1
            className="mt-5 text-4xl font-extrabold leading-[1.05] tracking-tight md:text-5xl lg:text-6xl"
            style={{ color: BRAND_NAVY }}
          >
            Meet{" "}
            <span style={{ color: BRAND_BLUE }}>Coach Cal</span>
            <span style={{ color: BRAND_GREEN }}>.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg text-foreground/80">
            The AI coaching partner that game-plans your offense{" "}
            <em>and</em> defense, generates plays and full playbooks, reviews
            last week&rsquo;s game, schedules your season, and writes the QB
            reads you don&rsquo;t have time to. Built for youth, flag, 7v7,
            and tackle — free to try for 7 days.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/login?mode=signup"
              className="inline-flex items-center gap-2 rounded-lg px-5 py-3 text-base font-bold text-white shadow-lg transition-transform hover:-translate-y-0.5"
              style={{ background: BRAND_BLUE }}
            >
              Start 7-day free trial
              <ArrowRight className="size-4" />
            </Link>
            <Link
              href="/#tour"
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface-raised px-5 py-3 text-base font-semibold text-foreground hover:bg-surface-inset"
            >
              Take the tour
            </Link>
          </div>
        </div>

        {/* Right column: a stylized "chat" card showing what a Coach Cal
            exchange looks like. No screenshot needed — this scales
            cleanly and renders identically across themes. */}
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
                text="Three plays in your book are vulnerable here — Slant-Flat, Stick, and Y-Stick all stay short on the third level. Want me to add a Smash and a Deep Over to attack the seam?"
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

/* ---------- Capabilities grid ---------- */

function Capabilities() {
  const items = [
    {
      icon: Wand2,
      color: BRAND_BLUE,
      title: "Generate plays from a description",
      body: "“Build me a screen pass that beats blitz pressure.” Coach Cal writes the formation, routes, blocks, and motions straight into the editor — fully editable like any play you'd draw yourself.",
    },
    {
      icon: ClipboardList,
      color: BRAND_ORANGE,
      title: "Build a complete playbook",
      body: "Tell Coach Cal your variant, age tier, and scheme philosophy. It builds a complete playbook — concepts, formations, tags — that you can refine instead of starting from a blank page.",
    },
    {
      icon: Target,
      color: BRAND_BLUE,
      title: "Beat any defense",
      body: "Tell Cal what front you're seeing — Cover 2, 5-2, Tampa-2 — and it proposes plays from your playbook with reads, motions, and adjustments. Drops in counters when your book is missing one.",
    },
    {
      icon: ShieldCheck,
      color: BRAND_GREEN,
      title: "Defend any offense",
      body: "Heavy-run team? Spread with a mobile QB? Coach Cal recommends a coverage shell, blitz package, and run fits — and explains the why so you can teach it on Tuesday.",
    },
    {
      icon: Search,
      color: BRAND_GREEN,
      title: "Post-game review",
      body: "Tell Cal what happened. It surfaces which plays bled yards, suggests playbook changes targeted at what beat you, and queues the new install in next practice.",
    },
    {
      icon: CalendarCheck,
      color: BRAND_ORANGE,
      title: "Season scheduling in one prompt",
      body: "“Two practices a week, Saturday games starting Sept 6.” Coach Cal builds the whole schedule, sends RSVPs, and reminds the roster — no per-event clicking.",
    },
    {
      icon: Brain,
      color: BRAND_BLUE,
      title: "Playbook review for your level",
      body: "Coach Cal reads every play and tells you what's too advanced for 8u, what's missing for a Cover-3 league, and which concept to install first so the rest build on it.",
    },
    {
      icon: Layers,
      color: BRAND_ORANGE,
      title: "Situational call sheets",
      body: "Red zone? 3rd-and-short? Opening drive? Coach Cal builds the call sheet — concept, formation, and a backup if the look on the field changes.",
    },
    {
      icon: BookOpen,
      color: BRAND_GREEN,
      title: "QB reads & coaching notes",
      body: "On any play, ask Coach Cal to write the QB progression, hot read, and per-position coaching points. Saves an hour of typing per playbook — and your wristbands print with the notes baked in.",
    },
  ];
  return (
    <section className="bg-surface-inset py-20">
      <div className="mx-auto max-w-6xl px-6">
        <p
          className="text-xs font-semibold uppercase tracking-wider"
          style={{ color: BRAND_BLUE }}
        >
          What Coach Cal does
        </p>
        <h2 className="mt-2 text-3xl font-extrabold tracking-tight md:text-4xl">
          Real coaching work.
        </h2>
        <p className="mt-3 max-w-2xl text-base text-muted">
          Coach Cal speaks the same structured-play format the editor uses, so
          generated plays animate, print, and share like anything you'd draw
          by hand.
        </p>
        <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {items.map(({ icon: Icon, color, title, body }) => (
            <div
              key={title}
              className="rounded-xl border border-border bg-surface-raised p-5 shadow-sm"
            >
              <div
                className="inline-flex size-10 items-center justify-center rounded-lg"
                style={{ background: `${color}1A`, color }}
              >
                <Icon className="size-5" />
              </div>
              <h3 className="mt-4 text-lg font-bold text-foreground">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- Knows your team ---------- */

function KnowsYourTeam() {
  return (
    <section className="py-20">
      <div className="mx-auto grid max-w-6xl gap-12 px-6 md:grid-cols-[1fr_1.2fr] md:items-center">
        <div className="order-2 md:order-1">
          <div className="rounded-2xl border border-border bg-surface-raised p-6 shadow-md">
            <div className="flex items-center gap-2">
              <BookOpen className="size-5" style={{ color: BRAND_BLUE }} />
              <p className="text-sm font-bold text-foreground">
                Scoped to: <span style={{ color: BRAND_BLUE }}>Flag Football</span>
              </p>
            </div>
            <ul className="mt-4 space-y-2 text-sm text-muted">
              <li className="flex gap-2">
                <span className="text-foreground">•</span> 7 formations, 26 plays
              </li>
              <li className="flex gap-2">
                <span className="text-foreground">•</span> Tags: Shotgun, Trips, Bunch, Empty
              </li>
              <li className="flex gap-2">
                <span className="text-foreground">•</span> 4 practice plans · 6 game logs
              </li>
            </ul>
            <p className="mt-5 text-xs text-muted">
              Coach Cal pulls in your playbook contents when you scope a chat
              to it — so suggestions reference the formations, plays, tags,
              and notes you've already created.
            </p>
          </div>
        </div>
        <div className="order-1 md:order-2">
          <p
            className="text-xs font-semibold uppercase tracking-wider"
            style={{ color: BRAND_GREEN }}
          >
            Knows your playbook
          </p>
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight md:text-4xl">
            Grounded in <em>your</em> X's and O's.
          </h2>
          <p className="mt-4 text-base text-muted">
            By default Coach Cal is a general-purpose coaching chat. Open it
            from a playbook page or toggle the playbook scope and it pulls
            in that playbook's plays, formations, tags, and notes.
            Suggestions are concrete — “add a Sail off your existing Trips
            Right” — not generic. Add a play, audit the gaps, propose
            counters: it's all anchored to what your team actually runs.
          </p>
          <p className="mt-4 text-base text-muted">
            Switch playbooks and the context switches with you. Need to keep
            something private? Don't scope a chat to that playbook — Coach
            Cal won't see it.
          </p>
        </div>
      </div>
    </section>
  );
}

/* ---------- Built for level ---------- */

function BuiltForLevel() {
  const tiers = [
    { label: "5v5 Flag", body: "8u, 10u, 12u — concept-first, motion-friendly." },
    { label: "7v7", body: "Skill-position passing concepts and route trees." },
    { label: "11-man tackle", body: "Full-line schemes, run game, special teams." },
  ];
  return (
    <section className="bg-surface-inset py-20">
      <div className="mx-auto max-w-6xl px-6">
        <p
          className="text-xs font-semibold uppercase tracking-wider"
          style={{ color: BRAND_ORANGE }}
        >
          Right answer for your level
        </p>
        <h2 className="mt-2 text-3xl font-extrabold tracking-tight md:text-4xl">
          Age-tier and variant aware.
        </h2>
        <p className="mt-3 max-w-2xl text-base text-muted">
          Coach Cal's knowledge base is segmented by age tier (8u flag through
          high school) and football variant. Practice templates, drill
          suggestions, and play complexity all adjust so you're not getting
          high-school-level concepts for a 3rd-grade flag team.
        </p>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {tiers.map(({ label, body }) => (
            <div
              key={label}
              className="rounded-xl border border-border bg-surface-raised p-6 shadow-sm"
            >
              <div className="flex items-center gap-2">
                <Brain className="size-5" style={{ color: BRAND_BLUE }} />
                <p className="text-base font-bold text-foreground">{label}</p>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- Privacy ---------- */

function Privacy() {
  return (
    <section className="py-20">
      <div className="mx-auto max-w-6xl px-6">
        <div className="grid gap-8 rounded-2xl border border-border bg-surface-raised p-8 shadow-sm md:grid-cols-[auto_1fr] md:items-start">
          <div
            className="inline-flex size-12 items-center justify-center rounded-xl"
            style={{ background: "#1769FF1A", color: BRAND_BLUE }}
          >
            <ShieldCheck className="size-6" />
          </div>
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight">
              Your conversations stay yours.
            </h2>
            <p className="mt-3 text-base text-muted">
              Coach Cal sends your messages to OpenAI or Anthropic (whichever
              we've configured as the active provider) to generate
              responses. Both providers' API terms forbid training on
              customer data by default. We don't share your conversations
              with anyone, and you can delete a thread from inside the chat.
              See the{" "}
              <Link
                href="/privacy"
                className="font-semibold text-foreground hover:underline"
              >
                Privacy policy
              </Link>{" "}
              for the full sub-processor list.
            </p>
            <ul className="mt-5 grid gap-2 text-sm text-muted sm:grid-cols-2">
              <li className="flex items-start gap-2">
                <Lock className="mt-0.5 size-4 shrink-0" />
                Tied to your account — no cross-coach leakage.
              </li>
              <li className="flex items-start gap-2">
                <Lock className="mt-0.5 size-4 shrink-0" />
                Threads deletable from the chat UI.
              </li>
              <li className="flex items-start gap-2">
                <Lock className="mt-0.5 size-4 shrink-0" />
                No training on your data per provider API terms.
              </li>
              <li className="flex items-start gap-2">
                <Lock className="mt-0.5 size-4 shrink-0" />
                Playbook scope is opt-in, per chat.
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- Pricing ---------- */

function Pricing() {
  return (
    <section className="bg-surface-inset py-20">
      <div className="mx-auto max-w-3xl px-6 text-center">
        <p
          className="text-xs font-semibold uppercase tracking-wider"
          style={{ color: BRAND_BLUE }}
        >
          Pricing
        </p>
        <h2 className="mt-2 text-3xl font-extrabold tracking-tight md:text-4xl">
          One plan, free to try.
        </h2>
        <div className="mt-8 rounded-2xl border-2 border-primary/40 bg-surface-raised p-7 text-left shadow-lg">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-muted">Coach Pro</p>
              <p className="mt-1 text-3xl font-extrabold tracking-tight">
                $25<span className="text-base font-medium text-muted">/month</span>
              </p>
              <p className="mt-1 text-xs text-muted">or $250/year</p>
            </div>
            <span
              className="rounded-full px-3 py-1 text-xs font-semibold"
              style={{ background: `${BRAND_GREEN}22`, color: "#5d8d12" }}
            >
              7-day free trial
            </span>
          </div>
          <ul className="mt-6 space-y-2 text-sm text-foreground">
            <li className="flex gap-2">
              <Sparkles
                className="mt-0.5 size-4 shrink-0"
                style={{ color: BRAND_BLUE }}
              />
              Coach Cal AI — ask anything, get instant answers
            </li>
            <li className="flex gap-2">
              <MessageSquare
                className="mt-0.5 size-4 shrink-0"
                style={{ color: BRAND_BLUE }}
              />
              200 Coach Cal messages per month included
            </li>
            <li className="flex gap-2">
              <Wand2
                className="mt-0.5 size-4 shrink-0"
                style={{ color: BRAND_BLUE }}
              />
              Generate plays and full playbooks
            </li>
            <li className="flex gap-2">
              <Target
                className="mt-0.5 size-4 shrink-0"
                style={{ color: BRAND_BLUE }}
              />
              Offensive <em>and</em> defensive game-planning vs. any scheme
            </li>
            <li className="flex gap-2">
              <Search
                className="mt-0.5 size-4 shrink-0"
                style={{ color: BRAND_BLUE }}
              />
              Post-game review and weekly playbook adjustments
            </li>
            <li className="flex gap-2">
              <CalendarCheck
                className="mt-0.5 size-4 shrink-0"
                style={{ color: BRAND_BLUE }}
              />
              Season scheduling — practices, games, RSVPs
            </li>
            <li className="flex gap-2">
              <Layers
                className="mt-0.5 size-4 shrink-0"
                style={{ color: BRAND_BLUE }}
              />
              Situational call sheets (red zone, 3rd-and-short, opening drive)
            </li>
            <li className="flex gap-2">
              <BookOpen
                className="mt-0.5 size-4 shrink-0"
                style={{ color: BRAND_BLUE }}
              />
              QB reads and per-position coaching notes written for you
            </li>
          </ul>
          <p className="mt-5 text-xs text-muted">
            Need more? Add a {MESSAGE_PACK_SIZE}-message pack for $
            {MESSAGE_PACK_PRICE_USD_PER_MONTH}/month — packs stack on top of
            your monthly allowance.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link
              href="/login?mode=signup"
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-5 py-3 text-base font-bold text-white shadow-md transition-transform hover:-translate-y-0.5"
              style={{ background: BRAND_BLUE }}
            >
              Start 7-day free trial
              <ArrowRight className="size-4" />
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface-inset px-5 py-3 text-base font-semibold text-foreground hover:bg-surface"
            >
              Compare plans
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- FAQ shortcut ---------- */

function FaqShortcut() {
  return (
    <section className="py-16">
      <div className="mx-auto max-w-3xl rounded-2xl border border-border bg-surface-raised p-8 shadow-sm">
        <p
          className="text-xs font-semibold uppercase tracking-wider"
          style={{ color: BRAND_GREEN }}
        >
          Common questions
        </p>
        <h2 className="mt-2 text-2xl font-extrabold tracking-tight">
          More about how Coach Cal works.
        </h2>
        <p className="mt-3 text-base text-muted">
          The FAQ has 11 dedicated Coach Cal questions — what it can do,
          how scoping works, message limits, the underlying AI model, and
          our privacy posture.
        </p>
        <Link
          href="/faq#coach-cal"
          className="mt-5 inline-flex items-center gap-2 text-base font-semibold hover:underline"
          style={{ color: BRAND_BLUE }}
        >
          Read the Coach Cal FAQ <ArrowRight className="size-4" />
        </Link>
      </div>
    </section>
  );
}

/* ---------- Final CTA ---------- */

function FinalCta() {
  return (
    <section className="py-20">
      <div className="mx-auto max-w-4xl px-6 text-center">
        <h2 className="text-3xl font-extrabold tracking-tight md:text-4xl">
          Try Coach Cal free for 7 days.
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-base text-muted">
          No credit card to start. Build your first playbook on the free
          plan, then turn Coach Cal on when you're ready for AI plays,
          playbook reviews, and practice plans.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/login?mode=signup"
            className="inline-flex items-center gap-2 rounded-lg px-6 py-3.5 text-base font-bold text-white shadow-lg transition-transform hover:-translate-y-0.5"
            style={{ background: BRAND_BLUE }}
          >
            Start free trial <ArrowRight className="size-5" />
          </Link>
          <Link
            href="/#tour"
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface-raised px-6 py-3.5 text-base font-semibold text-foreground hover:bg-surface-inset"
          >
            Take the tour
          </Link>
        </div>
      </div>
    </section>
  );
}
