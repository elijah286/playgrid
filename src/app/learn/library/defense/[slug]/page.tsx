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
import { VariantPill } from "../../VariantPill";

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

/** Pick which variant to RENDER the defensive alignment in. Honors
 *  the URL `?v=` filter when the defense supports it, falls back to
 *  flag_5v5 then to whatever the catalog has first. */
function pickRenderVariant(
  group: DefenseGroup,
  requested: LibraryVariant | null,
): LibraryVariant | null {
  const supported = Object.keys(group.byVariant).filter((v): v is LibraryVariant =>
    LIBRARY_VARIANTS.includes(v as LibraryVariant),
  );
  if (supported.length === 0) return null;
  if (requested && supported.includes(requested)) return requested;
  if (supported.includes("flag_5v5")) return "flag_5v5";
  return supported[0] ?? null;
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
  const requestedVariant = v ? slugToVariant(v) : null;
  const renderVariant = pickRenderVariant(group, requestedVariant);
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
    const diagram: CoachDiagram = {
      title: group.name,
      variant: renderVariant ?? undefined,
      focus: "D",
      players: defenders.map((p) => ({
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
    } catch {
      defenseDoc = null;
    }
  }
  const playbookSettings = renderVariant
    ? defaultSettingsForVariant(renderVariant)
    : null;

  const related = groupDefenses()
    .filter((g) => g.slug !== group.slug)
    .slice(0, 6);

  const supportedVariants = Object.keys(group.byVariant).filter(
    (vv): vv is LibraryVariant => LIBRARY_VARIANTS.includes(vv as LibraryVariant),
  );

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
          ) : (
            <div className="rounded-2xl border border-border bg-surface-raised p-8 text-center text-sm text-muted">
              No diagram available for this defense
              {renderVariant ? ` in ${VARIANT_LABEL[renderVariant]}` : ""}.
            </div>
          )}
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
