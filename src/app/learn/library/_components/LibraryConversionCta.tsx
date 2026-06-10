"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { track } from "@/lib/analytics/track";

/**
 * Conversion CTA for the Football Library hub + category index pages.
 *
 * Why this exists: ~9% of all sessions now enter the site cold via /learn
 * (organic + direct), but those library-entry sessions were bouncing at ~94%
 * with 0% reaching the builder — the index/hub pages were pure navigation
 * with no path into the product. This band gives every library surface a
 * single, obvious next step.
 *
 * Auth-aware (client-side, like InstallButton):
 *   - anonymous → "Start your free playbook" → /login?mode=signup (neutral
 *     signup flow; the ?intent=library tag lets us segment these in funnels)
 *   - signed-in → "Go to your playbooks" → /home (no point showing signup to
 *     someone who already has an account)
 *
 * Defaults to the anonymous variant before auth resolves: library traffic is
 * overwhelmingly cold/anon, it's the SEO-relevant server-rendered content, and
 * it avoids a flash for the dominant case. Fires `library_cta_click` so the
 * next traffic cut can measure library → signup conversion directly.
 */
export function LibraryConversionCta({
  /** Optional concept/category context, recorded on the click event so we can
   *  see which surfaces convert. */
  surface = "library",
}: {
  surface?: string;
} = {}) {
  const [authed, setAuthed] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    createClient()
      .auth.getSession()
      .then(({ data }) => {
        if (!cancelled) setAuthed(!!data.session);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const href = authed ? "/home" : "/login?mode=signup&intent=library";
  const label = authed ? "Go to your playbooks" : "Start your free playbook";
  const heading = authed
    ? "Ready to build? Drop these concepts into your playbook."
    : "Like what you see? Build your own playbook — free.";
  const sub = authed
    ? "Open any concept above and add it to a playbook in a couple taps — or start a new one from scratch."
    : "XO Gridmaker is free to start. Design plays on phone, tablet, or desktop, organize them into a playbook, and print wristbands when you're ready — no credit card.";

  return (
    <section aria-labelledby="library-cta-heading" className="mt-12">
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
            <Sparkles className="size-3.5" aria-hidden />
            {authed ? "Your playbook" : "Build your own"}
          </p>
          <h2
            id="library-cta-heading"
            className="mt-4 text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl"
          >
            {heading}
          </h2>
          <p className="mt-3 text-base leading-relaxed text-muted">{sub}</p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              href={href}
              onClick={() =>
                track({
                  event: "library_cta_click",
                  target: authed ? "authed_playbooks" : "anon_signup",
                  metadata: { surface, authed },
                })
              }
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 text-base font-bold text-white shadow-md transition-transform hover:-translate-y-0.5 hover:bg-primary-hover"
            >
              {label}
              <ArrowRight className="size-4" aria-hidden />
            </Link>
            {!authed ? (
              <Link
                href="/tour"
                onClick={() =>
                  track({
                    event: "library_cta_click",
                    target: "take_the_tour",
                    metadata: { surface, authed },
                  })
                }
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface-raised px-5 py-3 text-base font-semibold text-foreground hover:bg-surface-inset"
              >
                Take the tour
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
