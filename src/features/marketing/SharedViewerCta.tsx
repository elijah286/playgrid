import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";

/**
 * Two CTAs for anonymous visitors looking at a public-example playbook
 * or play. The top of the page already shows ExamplePreviewBanner /
 * ExamplePreviewEditorBanner ("This is an example, changes won't be
 * saved" + Create your own). These close the loop:
 *
 *   <BuildYourOwnPlaybookCta />   — full card, sits BELOW the playbook
 *                                    content as a "you've seen it,
 *                                    here's how to get one yourself"
 *                                    surface. Mirrors Substack's
 *                                    end-of-post subscribe card.
 *
 *   <MadeWithBadge />             — tiny persistent chip, sits above
 *                                    the global SiteFooter. Mirrors
 *                                    Calendly's "Powered by" / Loom's
 *                                    badge — non-intrusive but always
 *                                    discoverable.
 *
 * Both are server components — no interactivity needed; just links.
 */

export function BuildYourOwnPlaybookCta() {
  return (
    <section
      aria-labelledby="byo-cta-heading"
      className="mx-auto mt-12 max-w-5xl px-6"
    >
      <div className="relative overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-surface-raised to-surface-raised p-8 shadow-sm">
        <div
          className="pointer-events-none absolute -right-16 -top-16 size-64 rounded-full opacity-30 blur-3xl"
          style={{ background: "rgba(23,105,255,0.35)" }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-20 -left-12 size-72 rounded-full opacity-25 blur-3xl"
          style={{ background: "rgba(149,204,31,0.4)" }}
          aria-hidden
        />
        <div className="relative max-w-2xl">
          <p className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary">
            <Sparkles className="size-3.5" aria-hidden /> Build your own
          </p>
          <h2
            id="byo-cta-heading"
            className="mt-4 text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl"
          >
            Like what you see? Build your own playbook.
          </h2>
          <p className="mt-3 text-base leading-relaxed text-muted">
            XO Gridmaker is free to start — design plays on phone, tablet,
            or desktop, run a sideline call sheet from Game Mode, and print
            wristbands when you&apos;re ready. Your team can view shared
            plays without an account.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              href="/login?mode=signup"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 text-base font-bold text-white shadow-md transition-transform hover:-translate-y-0.5 hover:bg-primary-hover"
            >
              Get started — free
              <ArrowRight className="size-4" aria-hidden />
            </Link>
            <Link
              href="/#tour"
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface-raised px-5 py-3 text-base font-semibold text-foreground hover:bg-surface-inset"
            >
              Take the tour
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

export function MadeWithBadge() {
  return (
    <div
      data-made-with-badge=""
      className="mx-auto mt-10 flex max-w-5xl items-center justify-center px-6"
    >
      <Link
        href="/#tour"
        className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-raised px-3.5 py-1.5 text-xs font-medium text-muted shadow-sm transition-colors hover:border-primary/40 hover:text-foreground"
      >
        <span
          className="inline-block size-1.5 rounded-full"
          style={{ background: "#1769FF" }}
          aria-hidden
        />
        <span>
          Made with{" "}
          <span className="font-bold text-foreground">XO Gridmaker</span> —
          make your own free
        </span>
      </Link>
    </div>
  );
}
