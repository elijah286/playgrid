import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import {
  CoachCalTeaser,
  EveryScreen,
  FinalCta,
  PrintoutsAndWristbands,
} from "@/features/marketing/HomeSections";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.xogridmaker.com";
const PAGE_URL = `${SITE_URL}/tour`;

const BRAND_BLUE = "#1769FF";
const BRAND_NAVY = "#0F1E3D";

export const metadata: Metadata = {
  title: "Product tour — XO Gridmaker",
  description:
    "Take the tour. See the play editor, Coach Cal, and the print-to-wristband flow that ships every weekend.",
  alternates: { canonical: PAGE_URL },
  openGraph: {
    title: "Product tour — XO Gridmaker",
    description:
      "See the play editor, Coach Cal, and the print-to-wristband flow.",
    url: PAGE_URL,
    type: "website",
  },
};

// Dedicated tour route. The homepage's hero CTA scrolls in-page to the
// #tour anchor for marketing visitors, but the footer / FAQ / Coach Cal
// page link here so signed-in users (who are redirected away from `/`)
// can still see the tour. Hash fragments don't survive a server redirect,
// so a separate route is the only reliable destination.
export default function TourPage() {
  return (
    <div className="bg-surface text-foreground">
      <section className="relative overflow-hidden">
        <div className="mx-auto max-w-6xl px-6 py-12 md:py-16">
          <p
            className="text-xs font-semibold uppercase tracking-wider"
            style={{ color: BRAND_BLUE }}
          >
            Product tour
          </p>
          <h1
            className="mt-3 text-4xl font-extrabold tracking-tight md:text-5xl"
            style={{ color: BRAND_NAVY }}
          >
            See XO Gridmaker in action.
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-muted">
            A look at the editor, Coach Cal, and the print-to-wristband flow
            coaches use every weekend.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              href="/login?mode=signup"
              className="inline-flex items-center gap-2 rounded-lg px-5 py-3 text-base font-bold text-white shadow-lg transition-transform hover:-translate-y-0.5"
              style={{ background: BRAND_BLUE }}
            >
              Get started — free
              <ArrowRight className="size-4" />
            </Link>
            <Link
              href="/home"
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface-raised px-5 py-3 text-base font-semibold text-foreground hover:bg-surface-inset"
            >
              Back to my playbooks
            </Link>
          </div>
        </div>
      </section>

      <EveryScreen />
      <CoachCalTeaser />
      <PrintoutsAndWristbands />
      <FinalCta />
    </div>
  );
}
