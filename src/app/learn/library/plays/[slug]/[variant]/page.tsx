import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, BookOpen, Pencil } from "lucide-react";
import { CONCEPTS } from "@/domain/football-kg/defs/concepts";
import type { ConceptDef } from "@/domain/football-kg/schemas/ConceptDef";
import { generateConceptSkeleton } from "@/domain/play/conceptSkeleton";
import { playSpecToCoachDiagram } from "@/domain/play/specRenderer";
import { coachDiagramToPlayDocument } from "@/features/coach-ai/coachDiagramConverter";
import { defaultSettingsForVariant } from "@/domain/playbook/settings";
import { PlayEditorClient } from "@/features/editor/PlayEditorClient";
import { NotesMarkdown } from "@/features/editor/NotesMarkdown";
import { projectSpecToNotes } from "@/lib/coach-ai/notes-from-spec";
import { isCurrentUserSiteAdmin, isFootballLibraryAvailable } from "@/lib/learn/access";
import { toLearnSlug } from "@/lib/learn/links";
import { withFullContext } from "@/lib/seo/ld-json";
import {
  LIBRARY_VARIANTS,
  VARIANT_LABEL,
  slugToVariant,
  variantToSlug,
  type LibraryVariant,
} from "@/lib/learn/variant";
import { VariantNavPill } from "../../../VariantNavPill";

export const dynamicParams = false;
export const revalidate = 3600;

/** Static params: cartesian product of every concept × every variant
 *  the concept actually supports. Variants the concept DOESN'T support
 *  don't get static pages — those URLs 404 (per Q3 choice). */
export function generateStaticParams() {
  const params: Array<{ slug: string; variant: string }> = [];
  for (const concept of CONCEPTS) {
    const slug = toLearnSlug(concept.name);
    const supported = (concept.variants ?? []).filter(
      (v): v is LibraryVariant =>
        LIBRARY_VARIANTS.includes(v as LibraryVariant),
    );
    for (const v of supported) {
      params.push({ slug, variant: variantToSlug(v) });
    }
  }
  return params;
}

function findConceptBySlug(slug: string): ConceptDef | null {
  return CONCEPTS.find((c) => toLearnSlug(c.name) === slug) ?? null;
}

function supportedLibraryVariants(c: ConceptDef): LibraryVariant[] {
  return (c.variants ?? []).filter((v): v is LibraryVariant =>
    LIBRARY_VARIANTS.includes(v as LibraryVariant),
  );
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string; variant: string }> },
): Promise<Metadata> {
  const { slug, variant: variantSlug } = await params;
  const concept = findConceptBySlug(slug);
  const variant = slugToVariant(variantSlug);
  if (!concept || !variant) return { title: "Concept not found · XO Gridmaker" };
  const variantLabel = VARIANT_LABEL[variant];
  const canonical = `/learn/library/plays/${slug}/${variantSlug}`;
  return {
    title: `${concept.name} (${variantLabel}) · Football Library · XO Gridmaker`,
    description: `${concept.description} Variant-specific coaching breakdown for ${variantLabel}.`,
    alternates: { canonical },
    openGraph: {
      title: `${concept.name} — ${variantLabel}`,
      description: concept.description,
      url: canonical,
      type: "article",
    },
  };
}

export default async function PlayConceptVariantPage(
  { params }: { params: Promise<{ slug: string; variant: string }> },
) {
  if (!(await isFootballLibraryAvailable())) notFound();
  const { slug, variant: variantSlug } = await params;
  const concept = findConceptBySlug(slug);
  if (!concept) notFound();
  const variant = slugToVariant(variantSlug);
  if (!variant) notFound();

  // Concept doesn't support this variant → 404 with a hint pointing at
  // a supported variant.
  const supported = supportedLibraryVariants(concept);
  if (!supported.includes(variant)) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16 text-foreground">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          Not available in {VARIANT_LABEL[variant]}
        </p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight">
          {concept.name} isn&apos;t played in {VARIANT_LABEL[variant]}
        </h1>
        <p className="mt-3 text-base text-muted">
          This concept is defined for{" "}
          {supported.map((v) => VARIANT_LABEL[v]).join(", ")}. Pick a variant
          below to see the diagram and coaching breakdown.
        </p>
        <ul className="mt-6 space-y-2">
          {supported.map((v) => (
            <li key={v}>
              <Link
                href={`/learn/library/plays/${slug}/${variantToSlug(v)}`}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface-raised px-4 py-2 text-sm font-semibold text-foreground hover:border-primary"
              >
                {concept.name} in {VARIANT_LABEL[v]}
                <ArrowRight className="size-4" />
              </Link>
            </li>
          ))}
        </ul>
        <Link
          href="/learn/library/plays"
          className="mt-6 inline-flex items-center gap-1 text-xs text-muted hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          All plays
        </Link>
      </main>
    );
  }

  const skeleton = generateConceptSkeleton(concept.name, { variant, strength: "right" });
  if (!skeleton.ok) {
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
  // Spec-derived coaching notes. Same projector Cal uses to generate
  // per-play prose, fed the same skeleton the diagram is rendered from
  // — so the bullets and the diagram cannot drift apart (a concept
  // version is one PlaySpec, projected two ways: visual + text). The
  // `@LABEL` mentions in the output match player labels on `doc`, so
  // `NotesMarkdown` renders them as inline `PlayerChip`s, the same
  // widget used in the in-app editor.
  const coachingNotes = projectSpecToNotes(skeleton.spec);
  // Admins see an "Edit" link in the header that lets them open this
  // diagram in the full editor. The override-persistence layer is
  // Phase 2b-2; for now the link points at a draft-mode URL that lets
  // an admin walk the diagram in the full editor (read-only) to verify
  // correctness — the round-trip back into the library override is
  // wired up in the follow-up.
  const isAdmin = await isCurrentUserSiteAdmin();

  const canonical = `/learn/library/plays/${slug}/${variantSlug}`;
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "/" },
      { "@type": "ListItem", position: 2, name: "Football library", item: "/learn/library" },
      { "@type": "ListItem", position: 3, name: "Plays", item: "/learn/library/plays" },
      { "@type": "ListItem", position: 4, name: concept.name, item: `/learn/library/plays/${slug}` },
      { "@type": "ListItem", position: 5, name: VARIANT_LABEL[variant], item: canonical },
    ],
  };
  const articleLd = {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: `${concept.name} (${VARIANT_LABEL[variant]}) — football concept`,
    description: concept.description,
    articleSection: "Football library",
    keywords: [
      concept.name,
      ...(concept.aliases ?? []),
      VARIANT_LABEL[variant],
      `${VARIANT_LABEL[variant]} ${concept.name}`,
    ].join(", "),
  };

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
        <Link href={`/learn/library/plays/${slug}`} className="hover:text-foreground transition-colors">
          {concept.name}
        </Link>
        <span>›</span>
        <span className="text-foreground">{VARIANT_LABEL[variant]}</span>
      </nav>

      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            Football Library · Plays
          </p>
          <h1 className="mt-1 text-4xl font-extrabold tracking-tight">
            {concept.name}
            <span className="ml-3 text-2xl font-semibold text-muted">
              · {VARIANT_LABEL[variant]}
            </span>
          </h1>
          <div className="mt-3 flex flex-wrap gap-2">
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

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <VariantNavPill
          category="plays"
          conceptSlug={slug}
          currentVariant={variant}
          supportedVariants={supported}
        />
        {/* Admin-only "Edit this play" affordance. Lives next to the
            variant pill (subtle text link, not a button) so it's
            invisible to anonymous visitors but reachable for admins
            walking the catalog spot-checking diagrams. Routes through
            the admin override-edit page (Phase 2b-2) which opens the
            diagram in the full editor; edits save to the
            library_concept_overrides table that the library page
            reads on top of the catalog. */}
        {isAdmin && (
          <Link
            href={`/learn/library/admin/plays/${slug}/${variantSlug}/edit`}
            className="inline-flex items-center gap-1 text-xs font-medium text-muted underline decoration-dotted underline-offset-4 hover:text-primary"
            aria-label={`Edit ${concept.name} (${VARIANT_LABEL[variant]}) in the play editor`}
          >
            <Pencil className="size-3" />
            Edit this play
          </Link>
        )}
      </div>

      <div className="mb-8 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_280px]">
        <div>
          <p className="mb-6 text-lg leading-relaxed text-foreground">
            {concept.body ?? concept.description}
          </p>

          <div className="overflow-hidden rounded-2xl border border-border bg-surface-raised">
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

          {/* Per-player coaching breakdown. Generated from the same
              PlaySpec the diagram is rendered from, using the exact
              projector that emits Cal's chat-time play notes — so the
              `@LABEL` mentions resolve to the players actually on the
              field, the QB read order matches the diagram, and the
              concept's tactical opener lines up with the catalog's
              `description`. Players appear as `PlayerChip`s, matching
              the in-app editor's notes display.
              Hidden when the projector returns an empty string (no
              recognized concept + no assignments — shouldn't happen
              for catalog plays, but we keep the guard so the section
              doesn't render an empty card). */}
          {coachingNotes.trim().length > 0 && (
            <section className="mt-6 rounded-2xl border border-border bg-surface-raised p-5">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
                Coaching breakdown
              </h2>
              <NotesMarkdown value={coachingNotes} players={doc.layers.players} />
            </section>
          )}

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
              Sign in and we&apos;ll drop {concept.name} into one of your{" "}
              {VARIANT_LABEL[variant]} playbooks. The diagram you&apos;ll see
              in the editor is the same one rendered above.
            </p>
            <Link
              href={`/login?mode=signup&intent=add-concept&concept=${encodeURIComponent(concept.name)}&variant=${variant}`}
              className="mt-3 inline-flex w-full items-center justify-center rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white"
            >
              Add to my playbook
            </Link>
          </div>

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
