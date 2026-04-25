import type { Metadata } from "next";
import Link from "next/link";
import { getFreeMaxPlaysPerPlaybook } from "@/lib/site/free-plays-config";
import { DEFAULT_INCLUDED_SEATS, SEAT_PRICE_USD_PER_MONTH } from "@/lib/billing/seats";

export const metadata: Metadata = {
  title: "FAQ",
  description:
    "Answers to common questions about xogridmaker — what it costs, who it's for, how sharing works, and what formations and play types it supports.",
  alternates: { canonical: "/faq" },
  openGraph: {
    title: "xogridmaker FAQ — questions from coaches, answered",
    description:
      "What xogridmaker is, who it's for, how sharing works, and what you can draw with it.",
    url: "/faq",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "xogridmaker FAQ",
    description:
      "Answers to common questions from coaches about xogridmaker.",
  },
};

type Faq = { q: string; a: string };

function buildFaqs(freeMaxPlays: number): Faq[] {
  return [
  {
    q: "What is xogridmaker?",
    a: "xogridmaker is a football play designer for coaches. You draw plays on a field, organize them into playbooks, and share them with your team — on phones, tablets, or printed wristband cards.",
  },
  {
    q: "Who is it for?",
    a: "Flag football, youth tackle, middle school, and 7v7 coaches — plus anyone who coaches their own kids at the kitchen table. It was built by a coach for coaches who want a faster alternative to PowerPoint, whiteboards, and napkin sketches.",
  },
  {
    q: "Is xogridmaker free?",
    a: `Yes, there's a free tier that gives you one playbook with up to ${freeMaxPlays} plays — enough to design a small playbook without paying. Paid plans scale with how much you use it: unlimited plays, more playbooks, team invites, and wristbands. See the pricing page for current plan details.`,
  },
  {
    q: "What formations and play types does it support?",
    a: "Both offense and defense, across 5v5 flag, 7v7, and 11-man formations. You can draw routes, blocks, motions, and zones. Formations and route semantics are preserved as structured data, not just lines on a canvas.",
  },
  {
    q: "Can I share plays with players and parents?",
    a: "Yes. Every play and playbook can be shared by link. Players and parents don't need an account to view — they open the link on any device and see a clean, animated view of the play.",
  },
  {
    q: "Can I print wristband-sized play cards?",
    a: "Yes. Playbooks have a print view designed for wristband cards and sideline sheets. Plays scale cleanly so the drawings stay readable at small sizes.",
  },
  {
    q: "Does it work on the sideline?",
    a: "It runs in the browser on phones and tablets, so you can pull up your playbook during a game without installing anything. Most coaches design on a laptop and reference on a phone at the field.",
  },
  {
    q: "Can my whole staff use one Team Coach plan?",
    a: `Team Coach includes ${DEFAULT_INCLUDED_SEATS} collaborator seats — enough for a small staff. Beyond that, extra seats are $${SEAT_PRICE_USD_PER_MONTH}/seat/month, billed to the head coach. If an assistant already has their own Team Coach plan, they don't count against your seats — they ride on their own subscription.`,
  },
  {
    q: "What is Game Mode?",
    a: "Game Mode is a sideline-first view included with Team Coach. Open a play full-screen, tap the field to run motion and the snap, then tag the outcome with a thumbs-up or thumbs-down. When the game ends, save the session with score and notes — your call log becomes data you can use to see what's working and refine your playbook between games.",
  },
  {
    q: "How is this different from drawing plays in PowerPoint or Keynote?",
    a: "xogridmaker understands football. Players have positions, routes are route trees, formations are formations — not just shapes. That means the app can animate plays, keep them legible at any size, and share them as live pages instead of static images.",
  },
  {
    q: "Can I export my plays?",
    a: "Yes — you can print playbooks and export the page to PDF from your browser. Individual plays can be shared as links that render cleanly on any device.",
  },
  {
    q: "How do I get started?",
    a: "Browse the example playbooks to see what's possible, then create a free account and start a playbook. Most coaches have their first play drawn within a couple of minutes.",
  },
  ];
}

export default async function FaqPage() {
  const freeMaxPlays = await getFreeMaxPlaysPerPlaybook();
  const faqs = buildFaqs(freeMaxPlays);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map(({ q, a }) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: a },
    })),
  };

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
        Quick answers for coaches kicking the tires on xogridmaker.
      </p>

      <dl className="mt-10 space-y-8">
        {faqs.map(({ q, a }) => (
          <div key={q}>
            <dt className="text-lg font-semibold text-foreground">{q}</dt>
            <dd className="mt-2 text-base leading-relaxed text-muted">{a}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-12 rounded-lg border border-border bg-surface-inset p-5 text-sm text-muted">
        <p>
          Still have a question?{" "}
          <Link href="/contact" className="font-medium text-foreground hover:underline">
            Get in touch
          </Link>{" "}
          — or{" "}
          <Link href="/examples" className="font-medium text-foreground hover:underline">
            browse example playbooks
          </Link>{" "}
          to see xogridmaker in action.
        </p>
      </div>
    </article>
  );
}
