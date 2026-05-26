import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, BookOpen } from "lucide-react";
import { FORMATIONS } from "@/domain/football-kg/defs/formations";
import { CONCEPTS } from "@/domain/football-kg/defs/concepts";
import type { FormationDef } from "@/domain/football-kg/schemas/FormationDef";
import { synthesizeOffense } from "@/domain/play/offensiveSynthesize";
import { coachDiagramToPlayDocument, type CoachDiagram } from "@/features/coach-ai/coachDiagramConverter";
import { defaultSettingsForVariant } from "@/domain/playbook/settings";
import { PlayEditorClient } from "@/features/editor/PlayEditorClient";
import { isFootballLibraryAvailable } from "@/lib/learn/access";
import { toLearnSlug } from "@/lib/learn/links";
import { withFullContext } from "@/lib/seo/ld-json";
import {
  LIBRARY_VARIANTS,
  VARIANT_LABEL,
  slugToVariant,
  variantToSlug,
  type LibraryVariant,
} from "@/lib/learn/variant";
import { DEFAULT_LIBRARY_VARIANT } from "@/lib/learn/variant";
import { getLibraryVariantCookie } from "@/lib/learn/variant-preference";
import { VariantPill } from "../../VariantPill";
import { InstallFormationButton } from "./InstallFormationButton";

export const dynamicParams = false;
export const revalidate = 3600;

export function generateStaticParams() {
  return FORMATIONS.map((f) => ({ slug: toLearnSlug(f.name) }));
}

function findFormationBySlug(slug: string): FormationDef | null {
  return FORMATIONS.find((f) => toLearnSlug(f.name) === slug) ?? null;
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params;
  const formation = findFormationBySlug(slug);
  if (!formation) return { title: "Formation not found · XO Gridmaker" };
  return {
    title: `${formation.name} formation · Football Library · XO Gridmaker`,
    description: formation.description,
    alternates: { canonical: `/learn/library/formations/${slug}` },
    openGraph: {
      title: `${formation.name} — football formation`,
      description: formation.description,
      url: `/learn/library/formations/${slug}`,
      type: "article",
    },
  };
}


export default async function FormationPage(
  {
    params,
    searchParams,
  }: {
    params: Promise<{ slug: string }>;
    searchParams: Promise<{ v?: string }>;
  },
) {
  if (!(await isFootballLibraryAvailable())) notFound();
  const { slug } = await params;
  const { v } = await searchParams;
  const formation = findFormationBySlug(slug);
  if (!formation) notFound();
  // Variant from URL, defaulting to flag_5v5. Always specific (no
  // "all variants" path — every formation has a variant-specific
  // player layout). When the requested variant isn't supported by
  // this formation (e.g. Pro I is tackle-only and the coach has
  // 5v5 Flag selected), we surface a "not available" panel with
  // links to the variants the formation DOES support — no silent
  // fallback to a different variant.
  const variantFromCookie = await getLibraryVariantCookie();
  const requestedVariant: LibraryVariant =
    (v ? slugToVariant(v) : null) ?? variantFromCookie ?? DEFAULT_LIBRARY_VARIANT;
  const supportedLibraryVariants = (formation.variants ?? []).filter(
    (vv): vv is LibraryVariant => LIBRARY_VARIANTS.includes(vv as LibraryVariant),
  );
  const isSupportedHere = supportedLibraryVariants.includes(requestedVariant);
  const renderVariant: LibraryVariant | null = isSupportedHere
    ? requestedVariant
    : null;

  // Cross-reference: which concepts use this formation as their default?
  const usedBy = CONCEPTS.filter((c) => c.defaultFormation.id === formation.id).map(
    (c) => c.name,
  );
  const usedByLine =
    usedBy.length > 0
      ? `${usedBy.slice(0, 6).join(", ")}${usedBy.length > 6 ? `, +${usedBy.length - 6} more` : ""}`
      : null;

  // Related formations: same tag overlap.
  const myTags = new Set(formation.tags ?? []);
  const related = FORMATIONS.filter(
    (f) => f.id !== formation.id && (f.tags ?? []).some((t) => myTags.has(t)),
  )
    .slice(0, 6)
    .map((f) => ({ name: f.name, slug: toLearnSlug(f.name) }));

  // Build a player-only PlayDocument for the formation render. The
  // synthesizer produces SynthOffensePlayer[] in yards; we wrap as a
  // CoachDiagram with empty routes and run through the canonical
  // converter so the player coords end up in the same normalized
  // [0, 1] space the editor expects.
  let formationDoc: ReturnType<typeof coachDiagramToPlayDocument> | null = null;
  if (renderVariant) {
    const synth = synthesizeOffense(renderVariant, formation.name);
    if (synth) {
      const diagram: CoachDiagram = {
        title: formation.name,
        variant: renderVariant,
        focus: "O",
        players: synth.players.map((p) => ({
          id: p.id,
          x: p.x,
          y: p.y,
          team: "O",
        })),
        routes: [],
        zones: [],
      };
      try {
        formationDoc = coachDiagramToPlayDocument(diagram);
      } catch {
        formationDoc = null;
      }
    }
  }
  const playbookSettings = renderVariant
    ? defaultSettingsForVariant(renderVariant)
    : null;

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "/" },
      { "@type": "ListItem", position: 2, name: "Football library", item: "/learn/library" },
      { "@type": "ListItem", position: 3, name: "Formations", item: "/learn/library/formations" },
      { "@type": "ListItem", position: 4, name: formation.name, item: `/learn/library/formations/${slug}` },
    ],
  };
  const articleLd = {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: `${formation.name} — football formation`,
    description: formation.description,
    articleSection: "Football library",
    keywords: [formation.name, ...(formation.aliases ?? [])].join(", "),
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
        <Link href="/learn/library/formations" className="hover:text-foreground transition-colors">
          Formations
        </Link>
        <span>›</span>
        <span className="text-foreground">{formation.name}</span>
      </nav>

      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            Football Library · Formations
          </p>
          <h1 className="mt-1 text-4xl font-extrabold tracking-tight">{formation.name}</h1>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full bg-emerald-500/10 px-3 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
              Formation
            </span>
            {formation.complexity ? (
              <span className="rounded-full bg-surface-inset px-3 py-0.5 text-xs font-medium text-muted capitalize">
                {formation.complexity}
              </span>
            ) : null}
            {(formation.tags ?? []).slice(0, 4).map((t) => (
              <span
                key={t}
                className="rounded-full bg-surface-inset px-3 py-0.5 text-xs font-medium text-muted"
              >
                {t}
              </span>
            ))}
          </div>
        </div>
        <Link
          href="/learn/library/formations"
          className="inline-flex items-center gap-1 text-xs text-muted hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-3.5" />
          All formations
        </Link>
      </header>

      {/* Variant filter scoped to THIS formation's supported variants
          — tackle-only formations like Pro I hide the flag options
          entirely instead of showing them and 404'ing. When the coach
          picks a variant here, the diagram below re-renders in that
          variant (different player count for 5v5 vs 7v7 vs tackle). */}
      <div className="mb-6">
        <VariantPill supportedVariants={supportedLibraryVariants} />
      </div>

      <div className="mb-8 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_280px]">
        <div>
          <p className="mb-6 text-lg leading-relaxed text-foreground">
            {formation.body ?? formation.description}
          </p>

          {formationDoc && renderVariant && playbookSettings ? (
            <div className="overflow-hidden rounded-2xl border border-border bg-surface-raised">
              <PlayEditorClient
                playId={`library:formations:${slug}:${renderVariant}`}
                playbookId="library-preview"
                playbookName="Football Library"
                playbookVariant={renderVariant}
                initialDocument={formationDoc}
                initialNav={[]}
                initialGroups={[]}
                allFormations={[]}
                opponentFormations={[]}
                playbookSettings={playbookSettings}
                canEdit={false}
                libraryMode={true}
              />
            </div>
          ) : !isSupportedHere ? (
            // Formation doesn't apply to the variant the coach has
            // selected (e.g. Pro I is tackle-only and the coach has
            // 5v5 Flag selected). Show alternatives instead of
            // silently rendering a different variant.
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6 text-sm">
              <p className="font-semibold text-foreground">
                {formation.name} isn&apos;t run in {VARIANT_LABEL[requestedVariant]}.
              </p>
              <p className="mt-1 text-muted">
                This formation is defined for{" "}
                {supportedLibraryVariants.map((vv) => VARIANT_LABEL[vv]).join(", ")}.
                Switch your variant filter, or jump to a supported one:
              </p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {supportedLibraryVariants.map((vv) => (
                  <li key={vv}>
                    <Link
                      href={`/learn/library/formations/${slug}?v=${variantToSlug(vv)}`}
                      className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-raised px-3 py-1 text-xs font-medium text-foreground hover:border-primary hover:text-primary"
                    >
                      View in {VARIANT_LABEL[vv]}
                      <ArrowRight className="size-3" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="rounded-2xl border border-border bg-surface-raised p-8 text-center text-sm text-muted">
              No diagram available for this formation
              {renderVariant ? ` in ${VARIANT_LABEL[renderVariant]}` : ""}.
            </div>
          )}

          {usedByLine ? (
            <p className="mt-6 rounded-xl border border-border bg-surface-raised px-4 py-3 text-sm text-muted">
              <strong className="font-semibold text-foreground">Concepts that use this formation: </strong>
              {usedByLine}
            </p>
          ) : null}
        </div>

        <aside className="space-y-4">
          {renderVariant ? (
            <div className="rounded-2xl bg-foreground p-5 text-surface-raised">
              <h3 className="text-sm font-semibold">Add to your playbook</h3>
              <p className="mt-1.5 text-xs text-surface-raised/70">
                The diagram you&apos;ll see in the editor is the same one
                rendered above.
              </p>
              <InstallFormationButton
                formationName={formation.name}
                variant={renderVariant}
                loginHref={`/login?mode=signup&intent=add-formation&formation=${encodeURIComponent(formation.name)}&variant=${renderVariant}`}
              />
            </div>
          ) : null}

          {supportedLibraryVariants.length > 0 ? (
            <div className="rounded-2xl border border-border bg-surface-raised p-4">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">
                Available variants
              </h4>
              <ul className="mt-2 space-y-1.5 text-sm">
                {supportedLibraryVariants.map((vv) => (
                  <li key={vv}>
                    <Link
                      href={`/learn/library/formations/${slug}?v=${variantToSlug(vv)}`}
                      className={`flex items-center justify-between hover:text-primary ${
                        renderVariant === vv ? "font-semibold text-foreground" : "text-muted"
                      }`}
                    >
                      <span>{VARIANT_LABEL[vv]}</span>
                      <span className="text-xs text-emerald-500">✓</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {related.length > 0 ? (
            <div className="rounded-2xl border border-border bg-surface-raised p-4">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">
                <BookOpen className="mr-1 inline size-3.5" />
                Related formations
              </h4>
              <ul className="mt-2 space-y-1.5">
                {related.map((r) => (
                  <li key={r.slug}>
                    <Link
                      href={`/learn/library/formations/${r.slug}`}
                      className="flex items-center justify-between text-sm hover:text-primary"
                    >
                      <span>{r.name}</span>
                      <ArrowRight className="size-3.5 text-muted" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </aside>
      </div>
    </article>
  );
}
