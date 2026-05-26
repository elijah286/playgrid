import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, BookOpen } from "lucide-react";
import { CONCEPTS } from "@/domain/football-kg/defs/concepts";
import type { ConceptDef } from "@/domain/football-kg/schemas/ConceptDef";
import { generateConceptSkeleton } from "@/domain/play/conceptSkeleton";
import { playSpecToCoachDiagram } from "@/domain/play/specRenderer";
import { coachDiagramToPlayDocument } from "@/features/coach-ai/coachDiagramConverter";
import { defaultSettingsForVariant } from "@/domain/playbook/settings";
import type { SportVariant } from "@/domain/play/types";
import { PlayEditorClient } from "@/features/editor/PlayEditorClient";
import { toLearnSlug } from "@/lib/learn/links";
import { withFullContext } from "@/lib/seo/ld-json";

export const dynamicParams = false;
export const revalidate = 3600;

/** All concept slugs known to the catalog. Drives Next's static
 *  generation + 404s anything unknown (`dynamicParams = false`). */
export function generateStaticParams() {
  return CONCEPTS.map((c) => ({ slug: toLearnSlug(c.name) }));
}

function findConceptBySlug(slug: string): ConceptDef | null {
  return CONCEPTS.find((c) => toLearnSlug(c.name) === slug) ?? null;
}

const VARIANT_LABEL: Record<SportVariant, string> = {
  flag_4v4: "4v4 Flag",
  flag_5v5: "5v5 Flag",
  flag_6v6: "6v6 Flag",
  flag_7v7: "7v7 Flag",
  touch_7v7: "7v7 Touch",
  tackle_11: "11v11 Tackle",
  other: "Other",
};

/** Pick the variant we'll render the canonical diagram in. Flag 5v5
 *  first (the most common search target), then flag 7v7, then tackle. */
function pickPrimaryVariant(c: ConceptDef): SportVariant {
  const supported = (c.variants ?? []) as readonly SportVariant[];
  const ranked: SportVariant[] = ["flag_5v5", "flag_7v7", "flag_6v6", "tackle_11", "flag_4v4"];
  for (const v of ranked) if (supported.includes(v)) return v;
  return (supported[0] ?? "flag_5v5") as SportVariant;
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params;
  const concept = findConceptBySlug(slug);
  if (!concept) return { title: "Concept not found · XO Gridmaker" };
  const variant = pickPrimaryVariant(concept);
  const variantLabel = VARIANT_LABEL[variant];
  return {
    title: `${concept.name} (${variantLabel}) · Football Library · XO Gridmaker`,
    description: concept.description,
    alternates: { canonical: `/learn/library/plays/${slug}` },
    openGraph: {
      title: `${concept.name} — ${variantLabel}`,
      description: concept.description,
      url: `/learn/library/plays/${slug}`,
      type: "article",
    },
  };
}

export default async function PlayConceptPage(
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const concept = findConceptBySlug(slug);
  if (!concept) notFound();

  const variant = pickPrimaryVariant(concept);
  const skeleton = generateConceptSkeleton(concept.name, { variant, strength: "right" });
  if (!skeleton.ok) {
    // Catalog says the concept exists but no skeleton builder — should be
    // impossible per Rule 3 (catalog updates lockstep), but render a
    // graceful fallback rather than crash the page.
    return (
      <main className="mx-auto max-w-3xl px-6 py-10 text-foreground">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          Football Library · Plays
        </p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight">{concept.name}</h1>
        <p className="mt-3 text-base text-muted">{concept.body ?? concept.description}</p>
      </main>
    );
  }

  const { diagram } = playSpecToCoachDiagram(skeleton.spec);
  const doc = coachDiagramToPlayDocument(diagram);
  const playbookSettings = defaultSettingsForVariant(variant);

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "/" },
      { "@type": "ListItem", position: 2, name: "Learn", item: "/learn/library" },
      { "@type": "ListItem", position: 3, name: "Football library", item: "/learn/library" },
      { "@type": "ListItem", position: 4, name: "Plays", item: "/learn/library/plays" },
      { "@type": "ListItem", position: 5, name: concept.name, item: `/learn/library/plays/${slug}` },
    ],
  };

  const articleLd = {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: `${concept.name} — football concept`,
    description: concept.description,
    articleSection: "Football library",
    keywords: [concept.name, ...(concept.aliases ?? []), VARIANT_LABEL[variant]].join(", "),
  };

  // Other variants this concept supports — used for the "Also works in"
  // panel so coaches scanning for variant-specific copy can confirm.
  const otherVariants = (concept.variants ?? [])
    .filter((v): v is SportVariant => v !== variant)
    .map((v) => ({ id: v, label: VARIANT_LABEL[v as SportVariant] ?? v }));

  return (
    <article className="mx-auto max-w-6xl px-6 py-10 text-foreground">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(withFullContext(breadcrumbLd)) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(withFullContext(articleLd)) }}
      />

      <nav className="mb-6 flex items-center gap-1 text-xs text-muted">
        <Link href="/learn/library" className="hover:text-foreground transition-colors">
          Football library
        </Link>
        <span>›</span>
        <Link href="/learn/library/plays" className="hover:text-foreground transition-colors">
          Plays
        </Link>
        <span>›</span>
        <span className="text-foreground">{concept.name}</span>
      </nav>

      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            Football Library · Plays
          </p>
          <h1 className="mt-1 text-4xl font-extrabold tracking-tight">{concept.name}</h1>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full bg-primary-light px-3 py-0.5 text-xs font-semibold text-primary">
              {VARIANT_LABEL[variant]}
            </span>
            {concept.complexity ? (
              <span className="rounded-full bg-surface-inset px-3 py-0.5 text-xs font-medium text-muted capitalize">
                {concept.complexity}
              </span>
            ) : null}
            {(concept.aliases ?? []).slice(0, 2).map((a) => (
              <span
                key={a}
                className="rounded-full bg-surface-inset px-3 py-0.5 text-xs font-medium text-muted"
              >
                aka {a}
              </span>
            ))}
          </div>
        </div>
        <Link
          href="/learn/library/plays"
          className="inline-flex items-center gap-1 text-xs text-muted hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-3.5" />
          All plays
        </Link>
      </header>

      <div className="mb-8 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_280px]">
        <div>
          <p className="mb-6 text-lg leading-relaxed text-foreground">
            {concept.body ?? concept.description}
          </p>

          <div className="overflow-hidden rounded-2xl border border-border bg-surface-raised">
            <div className="border-b border-border-light px-4 py-2 text-xs text-muted">
              Rendered by the canonical play editor · Read-only · Click players
              to see their assignments
            </div>
            <PlayEditorClient
              playId={`library:plays:${slug}:${variant}`}
              playbookId="library-preview"
              playbookName="Football Library"
              playbookVariant={variant}
              initialDocument={doc}
              initialNav={[]}
              initialGroups={[]}
              allFormations={[]}
              opponentFormations={[]}
              playbookSettings={playbookSettings}
              canEdit={false}
              libraryMode={true}
            />
          </div>

          {concept.whenToUse ? (
            <section className="mt-8">
              <h2 className="text-xl font-bold tracking-tight">When to call it</h2>
              <p className="mt-2 text-base leading-relaxed text-muted">
                {concept.whenToUse}
              </p>
            </section>
          ) : null}

          {(concept.commonMistakes ?? []).length > 0 ? (
            <section className="mt-8">
              <h2 className="text-xl font-bold tracking-tight">Common mistakes</h2>
              <ul className="mt-2 space-y-1.5 pl-6">
                {(concept.commonMistakes ?? []).map((m) => (
                  <li key={m} className="list-disc text-base leading-relaxed text-muted">
                    {m}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {(concept.reads ?? []).length > 0 ? (
            <section className="mt-8">
              <h2 className="text-xl font-bold tracking-tight">QB read progression</h2>
              <ol className="mt-2 space-y-1.5 pl-6">
                {(concept.reads ?? [])
                  .slice()
                  .sort((a, b) => a.progression - b.progression)
                  .map((r) => (
                    <li
                      key={`${r.progression}-${r.player}`}
                      className="list-decimal text-base leading-relaxed text-muted"
                    >
                      <span className="font-semibold text-foreground">{r.player}</span>
                      {r.window ? ` — ${r.window}` : ""}
                      {r.coverage ? ` (${r.coverage})` : ""}
                    </li>
                  ))}
              </ol>
            </section>
          ) : null}
        </div>

        <aside className="space-y-4">
          <div className="rounded-2xl bg-foreground p-5 text-surface-raised">
            <h3 className="text-sm font-semibold">Use this play</h3>
            <p className="mt-1.5 text-xs text-surface-raised/70">
              Sign in and we&apos;ll drop {concept.name} into one of your
              playbooks. The diagram you&apos;ll see in the editor is the same
              one rendered above.
            </p>
            <Link
              href={`/login?mode=signup&intent=add-concept&concept=${encodeURIComponent(concept.name)}&variant=${variant}`}
              className="mt-3 inline-flex w-full items-center justify-center rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white"
            >
              Add to my playbook
            </Link>
            <Link
              href="/examples"
              className="mt-2 inline-flex w-full items-center justify-center rounded-lg border border-surface-raised/20 px-3 py-2 text-sm font-medium text-surface-raised"
            >
              Try in builder
            </Link>
          </div>

          {otherVariants.length > 0 ? (
            <div className="rounded-2xl border border-border bg-surface-raised p-4">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">
                Also works in
              </h4>
              <ul className="mt-2 space-y-1.5 text-sm">
                {otherVariants.map((v) => (
                  <li key={v.id} className="flex items-center justify-between">
                    <span>{v.label}</span>
                    <span className="text-xs text-emerald-500">✓</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="rounded-2xl border border-border bg-surface-raised p-4">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">
              <BookOpen className="mr-1 inline size-3.5" />
              Browse more
            </h4>
            <Link
              href="/learn/library/plays"
              className="mt-2 flex items-center justify-between text-sm hover:text-primary"
            >
              <span>All plays</span>
              <ArrowRight className="size-3.5 text-muted" />
            </Link>
            <Link
              href="/learn/library/formations"
              className="mt-2 flex items-center justify-between text-sm hover:text-primary"
            >
              <span>Formations</span>
              <ArrowRight className="size-3.5 text-muted" />
            </Link>
            <Link
              href="/learn/library/routes"
              className="mt-2 flex items-center justify-between text-sm hover:text-primary"
            >
              <span>Routes</span>
              <ArrowRight className="size-3.5 text-muted" />
            </Link>
          </div>
        </aside>
      </div>
    </article>
  );
}
