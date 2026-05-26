import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, BookOpen } from "lucide-react";
import {
  DEFENSIVE_ALIGNMENTS,
  alignmentWithAssignments,
  zonesForStrength,
} from "@/domain/play/defensiveAlignments";
import type { DefensiveAlignment } from "@/domain/play/defensiveAlignments";
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
import { DEFAULT_LIBRARY_VARIANT, VariantPill } from "../../VariantPill";

export const dynamicParams = false;
export const revalidate = 3600;

/** Defenses are keyed by (front, coverage, variant) in the catalog,
 *  but the library presents one page per unique (front, coverage)
 *  pair — variant differences become "Available variants" rows. */
function defenseDisplayName(a: DefensiveAlignment): string {
  const front = (a.front ?? "").trim();
  const coverage = (a.coverage ?? "").trim();
  if (!front || front.toLowerCase() === coverage.toLowerCase()) return coverage;
  return `${front} ${coverage}`.trim();
}

type DefenseGroup = {
  name: string;
  slug: string;
  description: string;
  /** Per-variant alignment entries for the group. Keyed by variant id
   *  ("flag_5v5", "tackle_11", etc.). One per supported variant. */
  byVariant: Record<string, DefensiveAlignment>;
  manCoverage: boolean;
};

function groupDefenses(): DefenseGroup[] {
  const bySlug = new Map<string, DefenseGroup>();
  for (const a of DEFENSIVE_ALIGNMENTS) {
    const name = defenseDisplayName(a);
    const slug = toLearnSlug(name);
    const existing = bySlug.get(slug);
    if (existing) {
      existing.byVariant[a.variant] = a;
    } else {
      bySlug.set(slug, {
        name,
        slug,
        description: a.description,
        byVariant: { [a.variant]: a },
        manCoverage: a.manCoverage ?? false,
      });
    }
  }
  return Array.from(bySlug.values());
}

export function generateStaticParams() {
  return groupDefenses().map(({ slug }) => ({ slug }));
}

function findGroupBySlug(slug: string): DefenseGroup | null {
  return groupDefenses().find((g) => g.slug === slug) ?? null;
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params;
  const group = findGroupBySlug(slug);
  if (!group) return { title: "Defense not found · XO Gridmaker" };
  return {
    title: `${group.name} defense · Football Library · XO Gridmaker`,
    description: group.description,
    alternates: { canonical: `/learn/library/defense/${slug}` },
    openGraph: {
      title: `${group.name} — football defensive scheme`,
      description: group.description,
      url: `/learn/library/defense/${slug}`,
      type: "article",
    },
  };
}

/** Suffix duplicate defender ids so every player in the diagram has
 *  a unique key. The DefensiveAlignment catalog has roster-style ids
 *  (DE, DT, CB, OLB) and a single scheme can repeat them (3-4 has
 *  two DEs and two OLBs; 4-3 has two CBs). The coachDiagramConverter
 *  rejects duplicate ids — without this suffix step the conversion
 *  throws and the diagram silently fails to render. Same pattern
 *  compose_defense uses (tools.ts:1999). */
function suffixDuplicateIds<T extends { id: string }>(players: T[]): T[] {
  const seen = new Map<string, number>();
  return players.map((p) => {
    const count = (seen.get(p.id) ?? 0) + 1;
    seen.set(p.id, count);
    const id = count === 1 ? p.id : `${p.id}${count}`;
    return { ...p, id };
  });
}

export default async function DefensePage(
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
  const group = findGroupBySlug(slug);
  if (!group) notFound();

  // Variant from URL, defaulting to flag_5v5. Always specific now
  // (no "all variants" path — every defense renders in ONE variant
  // at a time).
  const requestedVariant: LibraryVariant =
    (v ? slugToVariant(v) : null) ?? DEFAULT_LIBRARY_VARIANT;

  const supportedVariants = Object.keys(group.byVariant).filter(
    (vv): vv is LibraryVariant => LIBRARY_VARIANTS.includes(vv as LibraryVariant),
  );
  const isSupportedHere = supportedVariants.includes(requestedVariant);

  // When the requested variant doesn't apply to this defense
  // (e.g. 3-4 Cover 1 is tackle-only and the coach has flag_5v5
  // selected), we do NOT silently fall back to a different
  // variant — that's the bug the user surfaced. Instead we show
  // the "not available in this variant" panel below and offer
  // jumps to variants that DO support the scheme.
  const renderVariant: LibraryVariant | null = isSupportedHere
    ? requestedVariant
    : null;
  const alignment = renderVariant ? group.byVariant[renderVariant] : null;

  // Build a defender-only PlayDocument for the alignment render.
  // DefensiveAlignment.players are in yards (strength="right" by
  // default), zones in the same coord system. Wrap as a
  // defense-focused CoachDiagram (focus="D" tints offense players
  // gray) and run through the canonical converter.
  let defenseDoc: ReturnType<typeof coachDiagramToPlayDocument> | null = null;
  if (alignment) {
    const defenders = alignmentWithAssignments(alignment, "right");
    const zones = zonesForStrength(alignment, "right");
    // Suffix duplicate defender ids (DE / DE2, OLB / OLB2, etc.)
    // before handing to the converter — otherwise the dup-id guard
    // throws and the diagram silently fails to render.
    const uniqueDefenders = suffixDuplicateIds(
      defenders.map((p) => ({ id: p.id, x: p.x, y: p.y })),
    );
    const diagram: CoachDiagram = {
      title: group.name,
      variant: renderVariant ?? undefined,
      focus: "D",
      players: uniqueDefenders.map((p) => ({
        id: p.id,
        x: p.x,
        y: p.y,
        team: "D" as const,
      })),
      routes: [],
      zones: zones.map((z) => ({
        kind: z.kind,
        center: z.center,
        size: z.size,
        label: z.label,
      })),
    };
    try {
      defenseDoc = coachDiagramToPlayDocument(diagram);
    } catch (err) {
      // Server-side log so admins notice when a catalog alignment
      // can't render; the user-facing fallback panel below still
      // surfaces a clean message.
      console.warn(
        `[library/defense] conversion failed for ${slug} in ${renderVariant}`,
        err,
      );
      defenseDoc = null;
    }
  }
  const playbookSettings = renderVariant
    ? defaultSettingsForVariant(renderVariant)
    : null;

  const related = groupDefenses()
    .filter((g) => g.slug !== group.slug)
    .slice(0, 6);

  const tags: string[] = [];
  if (group.manCoverage) tags.push("man coverage");
  else tags.push("zone coverage");

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "/" },
      { "@type": "ListItem", position: 2, name: "Football library", item: "/learn/library" },
      { "@type": "ListItem", position: 3, name: "Defenses", item: "/learn/library/defense" },
      { "@type": "ListItem", position: 4, name: group.name, item: `/learn/library/defense/${slug}` },
    ],
  };
  const articleLd = {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: `${group.name} — football defensive scheme`,
    description: group.description,
    articleSection: "Football library",
    keywords: [group.name, ...tags].join(", "),
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
        <Link href="/learn/library/defense" className="hover:text-foreground transition-colors">
          Defenses
        </Link>
        <span>›</span>
        <span className="text-foreground">{group.name}</span>
      </nav>

      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            Football Library · Defenses
          </p>
          <h1 className="mt-1 text-4xl font-extrabold tracking-tight">{group.name}</h1>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full bg-amber-500/10 px-3 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
              Defense
            </span>
            {tags.map((t) => (
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
          href="/learn/library/defense"
          className="inline-flex items-center gap-1 text-xs text-muted hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-3.5" />
          All defenses
        </Link>
      </header>

      <div className="mb-6">
        <VariantPill />
      </div>

      <div className="mb-8 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_280px]">
        <div>
          <p className="mb-6 text-lg leading-relaxed text-foreground">
            {group.description}
          </p>

          {defenseDoc && renderVariant && playbookSettings ? (
            <div className="overflow-hidden rounded-2xl border border-border bg-surface-raised">
              <PlayEditorClient
                playId={`library:defense:${slug}:${renderVariant}`}
                playbookId="library-preview"
                playbookName="Football Library"
                playbookVariant={renderVariant}
                initialDocument={defenseDoc}
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
            // The defense exists in the catalog but doesn't apply
            // to the variant the coach has selected (e.g. 3-4 Cover 1
            // in 5v5 Flag — there's no equivalent because 3-4 needs
            // a real OL to run against). Show alternatives instead
            // of silently rendering a different variant.
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6 text-sm">
              <p className="font-semibold text-foreground">
                {group.name} isn&apos;t run in {VARIANT_LABEL[requestedVariant]}.
              </p>
              <p className="mt-1 text-muted">
                This scheme is defined for{" "}
                {supportedVariants.map((vv) => VARIANT_LABEL[vv]).join(", ")}.
                Switch your variant filter, or jump to a supported one:
              </p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {supportedVariants.map((vv) => (
                  <li key={vv}>
                    <Link
                      href={`/learn/library/defense/${slug}?v=${variantToSlug(vv)}`}
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
              No diagram available for this defense
              {renderVariant ? ` in ${VARIANT_LABEL[renderVariant]}` : ""}.
            </div>
          )}

          {/* Coaching context. Pull from the alignment we just
              rendered (whenToUse + weaknesses live on the scheme
              KG def, projected through legacy DefensiveAlignment).
              Hidden when the scheme has no guidance authored — better
              an empty space than a placeholder. */}
          {alignment?.whenToUse ? (
            <section className="mt-8">
              <h2 className="text-xl font-bold tracking-tight">When to call it</h2>
              <p className="mt-2 text-base leading-relaxed text-muted">
                {alignment.whenToUse}
              </p>
            </section>
          ) : null}

          {alignment?.weaknesses && alignment.weaknesses.length > 0 ? (
            <section className="mt-8">
              <h2 className="text-xl font-bold tracking-tight">Known weaknesses</h2>
              <ul className="mt-2 space-y-1.5 pl-6">
                {alignment.weaknesses.map((w) => (
                  <li key={w} className="list-disc text-base leading-relaxed text-muted">
                    {w}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        <aside className="space-y-4">
          {renderVariant ? (
            <div className="rounded-2xl bg-foreground p-5 text-surface-raised">
              <h3 className="text-sm font-semibold">Add to my playbook</h3>
              <p className="mt-1.5 text-xs text-surface-raised/70">
                Sign in and we&apos;ll save a defensive play with the {group.name}{" "}
                alignment in one of your {VARIANT_LABEL[renderVariant]} playbooks —
                same defenders, same zones as the diagram above.
              </p>
              <Link
                href={`/login?mode=signup&intent=add-defense&defense=${encodeURIComponent(group.name)}&variant=${renderVariant}`}
                className="mt-3 inline-flex w-full items-center justify-center rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white"
              >
                Add to my playbook
              </Link>
            </div>
          ) : null}

          {supportedVariants.length > 0 ? (
            <div className="rounded-2xl border border-border bg-surface-raised p-4">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">
                Available variants
              </h4>
              <ul className="mt-2 space-y-1.5 text-sm">
                {supportedVariants.map((vv) => (
                  <li key={vv}>
                    <Link
                      href={`/learn/library/defense/${slug}?v=${variantToSlug(vv)}`}
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
                Related defenses
              </h4>
              <ul className="mt-2 space-y-1.5">
                {related.map((r) => (
                  <li key={r.slug}>
                    <Link
                      href={`/learn/library/defense/${r.slug}`}
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
