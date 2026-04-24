import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  BarChart3,
  Check,
  Gamepad2,
  LayoutGrid,
  Printer,
  Share2,
  Users,
} from "lucide-react";
import {
  LaptopFrame,
  PhoneFrame,
  TabletFrame,
  WristBand,
} from "@/features/marketing/DeviceFrames";
import { PlayAnimation } from "@/features/marketing/PlayAnimation";
import { AnimatedGameMode } from "@/features/marketing/AnimatedGameMode";
import { Reveal } from "@/features/marketing/Reveal";
import { ExampleBookTile } from "@/features/dashboard/ExampleBookTile";
import { loadExamplePlaybooks } from "@/lib/site/example-playbooks";

export const metadata: Metadata = {
  title: "Learn more · xogridmaker",
  description:
    "The modern football playbook: design plays, run game mode, and carry your call sheet to the field.",
};

const BRAND_BLUE = "#1769FF";
const BRAND_GREEN = "#95CC1F";
const BRAND_NAVY = "#0F1E3D";
const BRAND_ORANGE = "#F26522";

export default async function LearnMorePage() {
  const examples = (await loadExamplePlaybooks()).slice(0, 3);

  return (
    <div className="bg-surface text-foreground">
      <Hero />
      <FreeForSolo />
      <RealPlaybooks examples={examples} />
      <EveryScreen />
      <FormationsAndTags />
      <PrintoutsAndWristbands />
      <GameModeSection />
      <GameDataSection />
      <SharingSection />
      <BuiltByACoach />
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
            className="inline-block rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider"
            style={{ background: "rgba(23,105,255,0.12)", color: BRAND_BLUE }}
          >
            A tour of xogridmaker
          </p>
          <h1
            className="mt-5 text-5xl font-extrabold leading-[1.02] tracking-tight sm:text-6xl"
            style={{ color: BRAND_NAVY }}
          >
            Everything a coach needs.
            <br />
            <span style={{ color: BRAND_GREEN }}>Nothing they don&apos;t.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
            Design plays, build formations, run game mode from the sideline,
            and print wristband-ready call sheets — all in one place. Built by
            a coach, so it works the way coaches think.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/login?mode=signup"
              className="inline-flex items-center gap-2 rounded-lg px-5 py-3 text-base font-bold text-white shadow-lg transition-transform hover:-translate-y-0.5"
              style={{ background: BRAND_BLUE }}
            >
              Get started — free
              <ArrowRight className="size-5" />
            </Link>
            <Link
              href="/examples"
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface-raised px-5 py-3 text-base font-semibold text-foreground hover:bg-surface-inset"
            >
              See real playbooks
            </Link>
          </div>
        </div>

        <div className="relative">
          <div className="absolute -inset-8 -z-10 rounded-[36px] bg-gradient-to-br from-white/40 to-white/0 blur-2xl" />
          <LaptopFrame>
            <div className="flex h-full w-full items-center justify-center bg-neutral-900 p-2">
              <PlayAnimation className="h-auto w-full" />
            </div>
          </LaptopFrame>
        </div>
      </div>
    </section>
  );
}

/* ---------- Free for solo coaches ---------- */

function FreeForSolo() {
  const perks = [
    "Unlimited plays for your own playbook",
    "Full editor — routes, formations, tags",
    "Mobile & tablet views included",
    "Print to PDF for wristbands and sheets",
  ];
  return (
    <section
      className="relative py-20"
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
                  Solo coach? You pay <span style={{ color: BRAND_GREEN }}>$0</span>.
                </h2>
                <p className="mt-3 max-w-xl text-muted">
                  Everything you need to run your own playbook is free. Paid
                  tiers unlock collaboration and advanced tools when your
                  program grows.
                </p>
              </div>
              <Link
                href="/pricing"
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

/* ---------- Real playbooks — point to /examples ---------- */

function RealPlaybooks({
  examples,
}: {
  examples: Awaited<ReturnType<typeof loadExamplePlaybooks>>;
}) {
  return (
    <section className="relative py-24">
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

        <Reveal delay={200}>
          <div className="mt-10 flex justify-center">
            <Link
              href="/examples"
              className="inline-flex items-center gap-2 rounded-lg px-5 py-3 text-base font-bold text-white shadow-lg transition-transform hover:-translate-y-0.5"
              style={{ background: BRAND_BLUE }}
            >
              Browse all examples
              <ArrowRight className="size-5" />
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ---------- Every screen (real tablet + phone shots) ---------- */

function EveryScreen() {
  return (
    <section className="relative py-24">
      <div className="mx-auto max-w-6xl px-6">
        <Reveal>
          <div className="max-w-2xl">
            <SectionEyebrow icon={LayoutGrid}>Every screen</SectionEyebrow>
            <h2 className="mt-3 text-4xl font-extrabold tracking-tight md:text-5xl">
              Desktop to draw.
              <br />
              Phone on the field.
            </h2>
            <p className="mt-5 text-lg text-muted">
              Design at home on your laptop. Review on the tablet. Pull up a
              play on your phone between series. Same playbook, every screen.
            </p>
          </div>
        </Reveal>

        <div className="mt-14 flex flex-wrap items-end justify-center gap-10">
          <Reveal delay={0}>
            <TabletFrame>
              <Image
                src="/marketing/screens/tablet-playbook.png"
                alt="Playbook on a tablet"
                width={1024}
                height={768}
                className="h-full w-full object-cover object-top"
              />
            </TabletFrame>
          </Reveal>
          <Reveal delay={150}>
            <PhoneFrame>
              <Image
                src="/marketing/screens/phone-play.png"
                alt="A play open on a phone"
                width={390}
                height={844}
                className="h-full w-full object-cover object-top"
              />
            </PhoneFrame>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* ---------- Formations + tagging ---------- */

function FormationsAndTags() {
  return (
    <section className="relative py-24" style={{ background: "#0F1115" }}>
      <div className="mx-auto grid max-w-6xl gap-16 px-6 md:grid-cols-2 md:items-center">
        <Reveal>
          <div className="order-2 text-white md:order-1">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
              <p className="text-xs font-semibold uppercase tracking-wider text-white/60">
                Formation library
              </p>
              <div className="mt-4 grid grid-cols-3 gap-3">
                {FORMATIONS.map((f) => (
                  <div
                    key={f.name}
                    className="rounded-lg bg-white/5 p-3 ring-1 ring-white/10"
                  >
                    <MiniFormation dots={f.dots} />
                    <p className="mt-2 text-center text-[11px] font-medium text-white/80">
                      {f.name}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
              <p className="text-xs font-semibold uppercase tracking-wider text-white/60">
                Tag + filter
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {[
                  { label: "Red Zone", color: BRAND_ORANGE },
                  { label: "3rd & Long", color: BRAND_BLUE },
                  { label: "Goal Line", color: BRAND_ORANGE },
                  { label: "Empty", color: "#8B5CF6" },
                  { label: "2-Min", color: BRAND_GREEN },
                  { label: "RPO", color: BRAND_BLUE },
                  { label: "Screen", color: "#EAB308" },
                ].map((tag) => (
                  <span
                    key={tag.label}
                    className="rounded-full px-3 py-1 text-xs font-semibold"
                    style={{
                      background: `${tag.color}22`,
                      color: tag.color,
                      boxShadow: `inset 0 0 0 1px ${tag.color}55`,
                    }}
                  >
                    #{tag.label}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </Reveal>

        <Reveal delay={100}>
          <div className="order-1 text-white md:order-2">
            <SectionEyebrow icon={LayoutGrid} light>
              Formations & tags
            </SectionEyebrow>
            <h2 className="mt-3 text-4xl font-extrabold tracking-tight md:text-5xl">
              Build once.
              <br />
              <span className="text-white/60">Find it in a second.</span>
            </h2>
            <p className="mt-5 max-w-lg text-lg text-white/70">
              Save formations and reuse them across plays. Tag by situation,
              personnel, or read so you can pull up every red-zone RPO with a
              single filter.
            </p>
            <ul className="mt-6 space-y-2 text-sm text-white/80">
              <FeatureBullet light>Reusable formations with personnel splits</FeatureBullet>
              <FeatureBullet light>Multi-tag plays — stack as many as you want</FeatureBullet>
              <FeatureBullet light>Filter your whole playbook by tag combos</FeatureBullet>
            </ul>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ---------- Printouts + wristbands ---------- */

function PrintoutsAndWristbands() {
  return (
    <section
      className="relative overflow-hidden py-28"
      style={{
        background:
          "linear-gradient(180deg, rgba(242,101,34,0.06) 0%, transparent 60%)",
      }}
    >
      <div className="mx-auto max-w-6xl px-6">
        <Reveal>
          <div className="max-w-2xl">
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

        <div className="mt-14 grid gap-10 md:grid-cols-2 md:items-center">
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

/* ---------- Game mode ---------- */

function GameModeSection() {
  return (
    <section className="relative py-28" style={{ background: "#0F1115" }}>
      <div className="mx-auto grid max-w-6xl gap-16 px-6 md:grid-cols-2 md:items-center">
        <Reveal>
          <div className="text-white">
            <SectionEyebrow icon={Gamepad2} light color={BRAND_GREEN}>
              Game Mode
            </SectionEyebrow>
            <h2 className="mt-3 text-4xl font-extrabold tracking-tight md:text-5xl">
              Call plays fast.
              <br />
              <span className="text-white/60">Log outcomes faster.</span>
            </h2>
            <p className="mt-5 max-w-lg text-lg text-white/70">
              Purpose-built for the sideline. Pull up the play in one tap, log
              the result in two. No menus, no hunting — the call sheet is
              always one thumb away.
            </p>
            <ul className="mt-6 space-y-2 text-sm text-white/80">
              <FeatureBullet light>One-tap play lookup by number or tag</FeatureBullet>
              <FeatureBullet light>Gain / loss / penalty / score shortcuts</FeatureBullet>
              <FeatureBullet light>Works offline — sync when you&apos;re back on wifi</FeatureBullet>
            </ul>
          </div>
        </Reveal>

        <Reveal delay={100}>
          <div className="flex justify-center">
            <PhoneFrame>
              <AnimatedGameMode />
            </PhoneFrame>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ---------- Game data ---------- */

function GameDataSection() {
  return (
    <section className="relative py-24">
      <div className="mx-auto grid max-w-6xl gap-16 px-6 md:grid-cols-2 md:items-center">
        <Reveal>
          <div className="rounded-2xl border border-border bg-surface-raised p-6 shadow-[var(--shadow-card)]">
            <div className="flex items-baseline justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                By play — last 5 games
              </p>
              <span className="text-xs text-muted">Avg yards</span>
            </div>
            <div className="mt-4 space-y-3">
              {CHART_ROWS.map((row) => (
                <div key={row.name} className="flex items-center gap-3">
                  <span className="w-36 truncate text-sm font-medium">
                    {row.name}
                  </span>
                  <div className="relative h-5 flex-1 overflow-hidden rounded bg-surface-inset">
                    <div
                      className="h-full rounded"
                      style={{
                        width: `${row.pct}%`,
                        background: row.pct > 60 ? BRAND_GREEN : BRAND_BLUE,
                      }}
                    />
                  </div>
                  <span className="w-10 text-right text-sm tabular-nums">
                    {row.yards}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Reveal>

        <Reveal delay={100}>
          <div>
            <SectionEyebrow icon={BarChart3}>Game Data</SectionEyebrow>
            <h2 className="mt-3 text-4xl font-extrabold tracking-tight md:text-5xl">
              Call what works.
              <br />
              <span className="text-muted">Cut what doesn&apos;t.</span>
            </h2>
            <p className="mt-5 max-w-lg text-lg text-muted">
              Every play you log in Game Mode rolls up into per-play and
              per-situation reports. See what&apos;s hitting on 3rd-and-medium
              before you draw up next week&apos;s script.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ---------- Sharing ---------- */

function SharingSection() {
  return (
    <section className="relative py-24" style={{ background: "rgba(23,105,255,0.04)" }}>
      <div className="mx-auto grid max-w-6xl gap-16 px-6 md:grid-cols-2 md:items-center">
        <Reveal>
          <div>
            <SectionEyebrow icon={Share2}>Share & collaborate</SectionEyebrow>
            <h2 className="mt-3 text-4xl font-extrabold tracking-tight md:text-5xl">
              Whole staff.
              <br />
              <span className="text-muted">One source of truth.</span>
            </h2>
            <p className="mt-5 max-w-lg text-lg text-muted">
              Invite co-coaches and coordinators. Share read-only playbooks
              with the team. Roles and approvals keep your starter playbook
              clean while letting assistants iterate.
            </p>
          </div>
        </Reveal>

        <Reveal delay={100}>
          <div className="rounded-2xl border border-border bg-surface-raised p-6 shadow-[var(--shadow-card)]">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">
              Roster
            </p>
            <ul className="mt-4 space-y-3">
              {ROSTER.map((r) => (
                <li
                  key={r.name}
                  className="flex items-center justify-between rounded-lg bg-surface-inset p-3"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="flex size-9 items-center justify-center rounded-full text-sm font-bold text-white"
                      style={{ background: r.color }}
                    >
                      {r.initial}
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{r.name}</p>
                      <p className="text-xs text-muted">{r.email}</p>
                    </div>
                  </div>
                  <span
                    className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                    style={{
                      background:
                        r.role === "Owner"
                          ? "rgba(23,105,255,0.12)"
                          : "rgba(107,114,128,0.12)",
                      color: r.role === "Owner" ? BRAND_BLUE : "#6B7280",
                    }}
                  >
                    {r.role}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ---------- Built by a coach ---------- */

function BuiltByACoach() {
  return (
    <section className="relative py-24">
      <div className="mx-auto max-w-3xl px-6 text-center">
        <Reveal>
          <SectionEyebrow icon={Users} center>
            Built by a coach
          </SectionEyebrow>
          <h2 className="mt-3 text-4xl font-extrabold tracking-tight md:text-5xl">
            Not a SaaS guy
            <br />
            <span className="text-muted">who watched football once.</span>
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

function FinalCta() {
  return (
    <section
      className="relative py-28"
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
   Small building blocks
   ======================================================================== */

function SectionEyebrow({
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

function FeatureBullet({
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

/* ========================================================================
   Mocks — only for features not covered by /examples (wristband print,
   game mode, game data). Everything editor/playbook/play-related points
   to real example playbooks instead.
   ======================================================================== */

function MockWristSheet() {
  return (
    <div className="grid grid-cols-4 gap-1">
      {Array.from({ length: 12 }).map((_, i) => (
        <div
          key={i}
          className="rounded-sm bg-white p-1 ring-1 ring-neutral-300"
        >
          <div className="flex items-center gap-1">
            <span
              className="rounded px-1 text-[7px] font-bold text-white"
              style={{ background: BRAND_ORANGE }}
            >
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="truncate text-[7px] font-semibold">
              {["PA Go", "Mesh", "Slant", "Counter", "Y-Stick", "Bubble"][i % 6]}
            </span>
          </div>
          <div className="mt-1 aspect-[4/3] rounded-sm bg-neutral-900">
            <MiniPlayTile seed={i + 3} />
          </div>
        </div>
      ))}
    </div>
  );
}

function MockCallSheet() {
  return (
    <div>
      <div className="flex items-baseline justify-between border-b border-neutral-300 pb-2">
        <p className="text-sm font-bold">Call Sheet · Wk 4</p>
        <p className="text-[10px] text-neutral-500">vs. Valley</p>
      </div>
      {[
        { title: "1st & 10", plays: ["02 PA Go", "14 Mesh", "21 Counter"] },
        { title: "3rd & Short", plays: ["33 Y-Stick", "07 Slant/Flat"] },
        { title: "Red Zone", plays: ["09 Fade", "02 PA Go", "41 Sneak"] },
      ].map((group) => (
        <div key={group.title} className="mt-3">
          <p
            className="text-[10px] font-bold uppercase tracking-wider"
            style={{ color: BRAND_BLUE }}
          >
            {group.title}
          </p>
          <ul className="mt-1 space-y-0.5 text-[11px]">
            {group.plays.map((p) => (
              <li key={p} className="flex justify-between border-b border-dashed border-neutral-200 py-0.5">
                <span className="font-medium">{p}</span>
                <span className="text-neutral-500">✓</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function MiniFormation({ dots }: { dots: Array<[number, number]> }) {
  return (
    <svg viewBox="0 0 100 70" className="h-auto w-full">
      <rect width="100" height="70" fill="#1B5E30" rx="4" />
      <line x1="5" y1="42" x2="95" y2="42" stroke="rgba(255,255,255,0.5)" strokeDasharray="2 2" />
      {dots.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="3.5" fill="white" />
      ))}
    </svg>
  );
}

function MiniPlayTile({ seed }: { seed: number }) {
  const r = (n: number) => ((seed * 9301 + n * 49297) % 233280) / 233280;
  const routes = Array.from({ length: 4 }).map((_, i) => {
    const x = 20 + r(i) * 60;
    const y2 = 20 + r(i + 10) * 30;
    return { x, y1: 75, y2 };
  });
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full">
      {routes.map((rt, i) => (
        <g key={i}>
          <line
            x1={rt.x}
            y1={rt.y1}
            x2={rt.x + (i % 2 === 0 ? -10 : 10)}
            y2={rt.y2}
            stroke={i === 2 ? BRAND_ORANGE : BRAND_BLUE}
            strokeWidth="1.5"
          />
          <circle cx={rt.x} cy={rt.y1} r="3" fill="white" />
        </g>
      ))}
    </svg>
  );
}

const FORMATIONS = [
  {
    name: "Spread",
    dots: [
      [15, 38],
      [35, 42],
      [50, 42],
      [65, 42],
      [85, 38],
      [50, 55],
      [50, 62],
    ] as Array<[number, number]>,
  },
  {
    name: "I-Form",
    dots: [
      [30, 42],
      [42, 42],
      [50, 42],
      [58, 42],
      [70, 42],
      [50, 52],
      [50, 62],
    ] as Array<[number, number]>,
  },
  {
    name: "Trips",
    dots: [
      [15, 38],
      [20, 42],
      [35, 42],
      [50, 42],
      [70, 38],
      [80, 38],
      [90, 38],
    ] as Array<[number, number]>,
  },
  {
    name: "Empty",
    dots: [
      [10, 38],
      [25, 38],
      [40, 42],
      [50, 42],
      [60, 42],
      [75, 38],
      [90, 38],
    ] as Array<[number, number]>,
  },
  {
    name: "Pistol",
    dots: [
      [30, 42],
      [42, 42],
      [50, 42],
      [58, 42],
      [70, 42],
      [50, 55],
      [50, 58],
    ] as Array<[number, number]>,
  },
  {
    name: "Gun-Trey",
    dots: [
      [20, 38],
      [35, 42],
      [50, 42],
      [65, 42],
      [75, 38],
      [85, 38],
      [40, 55],
    ] as Array<[number, number]>,
  },
];

const CHART_ROWS = [
  { name: "02 · PA Go", yards: 11.2, pct: 92 },
  { name: "14 · Mesh", yards: 7.4, pct: 61 },
  { name: "33 · Y-Stick", yards: 6.8, pct: 56 },
  { name: "21 · Counter", yards: 5.1, pct: 42 },
  { name: "09 · Fade", yards: 4.3, pct: 35 },
  { name: "07 · Slant/Flat", yards: 3.9, pct: 32 },
];

const ROSTER = [
  { name: "Coach Elijah", email: "you@team.com", role: "Owner", initial: "E", color: BRAND_BLUE },
  { name: "Coach Ramirez", email: "ramirez@team.com", role: "Co-coach", initial: "R", color: "#8B5CF6" },
  { name: "Coach Patel", email: "patel@team.com", role: "Assistant", initial: "P", color: BRAND_GREEN },
];
