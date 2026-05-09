import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getExamplesPageEnabled } from "@/lib/site/examples-config";
import { loadExamplePlaybooks } from "@/lib/site/example-playbooks";
import { ExampleBookTile } from "@/features/dashboard/ExampleBookTile";
import { Card } from "@/components/ui/Card";

const FALLBACK_COLORS = ["#F26522", "#3B82F6", "#22C55E", "#EF4444", "#A855F7", "#EAB308"];

function colorFor(id: string, color: string | null): string {
  if (color) return color;
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return FALLBACK_COLORS[h % FALLBACK_COLORS.length];
}

function initialsFor(name: string): string {
  return (
    name
      .split(/\s+/)
      .slice(0, 2)
      .map((s) => s[0])
      .filter(Boolean)
      .join("")
      .toUpperCase()
      .slice(0, 2) || "PB"
  );
}

export const metadata: Metadata = {
  title: "Example playbooks",
  description:
    "Browse real football playbooks built in XO Gridmaker — plays, formations, and wristband cards for flag, youth tackle, and 7v7 coaches. Create your own free in minutes.",
  alternates: { canonical: "/examples" },
  openGraph: {
    title: "Example football playbooks — built in XO Gridmaker",
    description:
      "Real plays and playbooks coaches have designed with XO Gridmaker. Browse the examples, then create your own free.",
    url: "/examples",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Example football playbooks — built in XO Gridmaker",
    description:
      "Real plays and playbooks coaches have designed with XO Gridmaker.",
  },
};

export default async function ExamplesPage() {
  const enabled = await getExamplesPageEnabled();
  if (!enabled) notFound();
  const playbooks = await loadExamplePlaybooks();

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "/" },
      { "@type": "ListItem", position: 2, name: "Examples", item: "/examples" },
    ],
  };

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-12 sm:py-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />
      <header className="max-w-2xl">
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
          Example playbooks
        </h1>
        <p className="mt-3 text-base leading-relaxed text-muted">
          Real XO Gridmaker playbooks built by coaches — open one to explore the
          plays, formations, and wristband cards. Nothing you do inside
          will be saved; the &quot;Create your playbook&quot; button is
          always one click away.
        </p>
      </header>

      {playbooks.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-border bg-surface-raised p-6 text-sm text-muted">
          No example playbooks are published yet. Check back soon.
        </div>
      ) : (
        <>
          {/* Mobile: simple flat tiles matching the home dashboard style.
              The animated open-book treatment needs hover + horizontal room
              that touch screens don't have, and the cover variant cropped
              its bottom-text inside the 3:4 aspect box on small viewports. */}
          <section className="mt-10 grid grid-cols-2 gap-3 sm:hidden">
            {playbooks.map((pb) => {
              const color = colorFor(pb.id, pb.color);
              const initials = initialsFor(pb.name);
              return (
                <Link key={pb.id} href={`/playbooks/${pb.id}`} className="group">
                  <Card hover className="overflow-hidden p-0">
                    <div className="flex h-full flex-col">
                      <div
                        className="flex h-20 items-center justify-center"
                        style={{ backgroundColor: color }}
                      >
                        {pb.logo_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={pb.logo_url} alt="" className="h-14 w-14 object-contain" />
                        ) : (
                          <span className="text-2xl font-black tracking-tight text-white drop-shadow">
                            {initials}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-1 flex-col gap-0.5 p-2.5">
                        <h3 className="truncate text-sm font-bold text-foreground">{pb.name}</h3>
                        <p className="text-[11px] text-muted">
                          {pb.season ? `${pb.season} · ` : ""}
                          {pb.play_count} play{pb.play_count === 1 ? "" : "s"}
                        </p>
                        {pb.author_label && (
                          <p className="truncate text-[10px] uppercase tracking-wider text-muted">
                            By {pb.author_label}
                          </p>
                        )}
                      </div>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </section>
          {/* Desktop: keep the closed-book → opens-on-hover treatment. */}
          <section className="mt-12 hidden flex-wrap justify-center gap-6 sm:flex">
            {playbooks.map((pb) => (
              <div key={pb.id} className="w-40 sm:w-48 lg:w-56">
                <ExampleBookTile tile={pb} centerOnOpen={playbooks.length === 1} />
              </div>
            ))}
          </section>
        </>
      )}

      <section className="mt-16 flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface-raised px-6 py-8 text-center shadow-sm sm:mt-20">
        <h2 className="text-lg font-extrabold tracking-tight text-foreground sm:text-xl">
          Rather get started with your own playbook?
        </h2>
        <p className="max-w-lg text-sm text-muted">
          Create a free account and build your first playbook in under a
          minute.
        </p>
        <Link
          href="/login?mode=signup"
          className="mt-1 inline-flex items-center rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-hover"
        >
          Start your own playbook
        </Link>
      </section>
    </main>
  );
}
