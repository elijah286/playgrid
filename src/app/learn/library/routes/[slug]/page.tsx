import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, BookOpen } from "lucide-react";
import { ROUTE_TEMPLATES } from "@/domain/play/routeTemplates";
import { CONCEPTS } from "@/domain/football-kg/defs/concepts";
import type { RouteTemplate } from "@/domain/play/routeTemplates";
import type { PlaySpec } from "@/domain/play/spec";
import { PLAY_SPEC_SCHEMA_VERSION } from "@/domain/play/spec";
import { playSpecToCoachDiagram } from "@/domain/play/specRenderer";
import { coachDiagramToPlayDocument } from "@/features/coach-ai/coachDiagramConverter";
import { defaultSettingsForVariant } from "@/domain/playbook/settings";
import { PlayEditorClient } from "@/features/editor/PlayEditorClient";
import { isFootballLibraryAvailable } from "@/lib/learn/access";
import { toLearnSlug } from "@/lib/learn/links";
import { withFullContext } from "@/lib/seo/ld-json";
import { DEFAULT_LIBRARY_VARIANT } from "@/lib/learn/variant";

export const dynamicParams = false;
export const revalidate = 3600;

export function generateStaticParams() {
  return ROUTE_TEMPLATES.map((r) => ({ slug: toLearnSlug(r.name) }));
}

function findRouteBySlug(slug: string): RouteTemplate | null {
  return ROUTE_TEMPLATES.find((r) => toLearnSlug(r.name) === slug) ?? null;
}

/** Pick a sensible default depth for this route. Uses the
 *  midpoint of the catalog's depthRange when one exists; falls
 *  back to 8yd for vertical routes (Go/Seam) where depth is
 *  open-ended. This is the depth Cal would pick when composing
 *  the route without a coach-specified depth. */
function defaultDepthFor(route: RouteTemplate): number {
  const range = route.constraints?.depthRangeYds;
  if (range) {
    return Math.round((range.min + range.max) / 2);
  }
  return 8;
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params;
  const route = findRouteBySlug(slug);
  if (!route) return { title: "Route not found · XO Gridmaker" };
  return {
    title: `${route.name} route · Football Library · XO Gridmaker`,
    description: route.description ?? `The ${route.name} route — football route template.`,
    alternates: { canonical: `/learn/library/routes/${slug}` },
    openGraph: {
      title: `${route.name} — football route`,
      description:
        route.description ?? `The ${route.name} route — football route template.`,
      url: `/learn/library/routes/${slug}`,
      type: "article",
    },
  };
}

export default async function RoutePage(
  { params }: { params: Promise<{ slug: string }> },
) {
  if (!(await isFootballLibraryAvailable())) notFound();
  const { slug } = await params;
  const route = findRouteBySlug(slug);
  if (!route) notFound();

  // Routes are variant-agnostic — a Slant is a Slant regardless of
  // game type — so the route pages don't show the variant pill the
  // way play/formation/defense pages do. The render still needs a
  // variant internally (for the field width + roster the synthesizer
  // produces), so we use the library default (5v5 Flag) as the
  // demo's backdrop.
  const variant = DEFAULT_LIBRARY_VARIANT;

  // Synthesize a minimal play that runs THIS route on the strong-
  // side outside WR (@Z), with the rest of the formation idle. The
  // canonical renderer (playSpecToCoachDiagram) places the receiver
  // and draws the route from the catalog template at the chosen
  // depth. Result is the same render path the in-app builder uses
  // (Rule 14: one render path).
  const depth = defaultDepthFor(route);
  const spec: PlaySpec = {
    schemaVersion: PLAY_SPEC_SCHEMA_VERSION,
    variant,
    title: `${route.name} demo`,
    playType: "offense",
    formation: { name: "Spread Doubles", strength: "right" },
    assignments: [
      {
        player: "Z",
        confidence: "high",
        action: { kind: "route", family: route.name, depthYds: depth },
      },
    ],
  };
  let routeDoc: ReturnType<typeof coachDiagramToPlayDocument> | null = null;
  try {
    const { diagram } = playSpecToCoachDiagram(spec);
    routeDoc = coachDiagramToPlayDocument(diagram);
  } catch (err) {
    console.warn(
      `[library/routes] render failed for ${slug} in ${variant}`,
      err,
    );
  }
  const playbookSettings = defaultSettingsForVariant(variant);

  // Concepts that use this route family — shown as a "used by" rail.
  const usedBy = CONCEPTS.filter((c) =>
    c.pattern.some((p) => p.family.toLowerCase() === route.name.toLowerCase()),
  ).map((c) => c.name);
  const usedByLine =
    usedBy.length > 0
      ? `${usedBy.slice(0, 6).join(", ")}${usedBy.length > 6 ? `, +${usedBy.length - 6} more` : ""}`
      : null;

  // Related routes: same family fingerprint by complexity for now.
  // Cheap heuristic; once we have route tags we'll do proper overlap.
  const related = ROUTE_TEMPLATES.filter((r) => r.name !== route.name)
    .slice(0, 6)
    .map((r) => ({ name: r.name, slug: toLearnSlug(r.name) }));

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "/" },
      { "@type": "ListItem", position: 2, name: "Football library", item: "/learn/library" },
      { "@type": "ListItem", position: 3, name: "Routes", item: "/learn/library/routes" },
      { "@type": "ListItem", position: 4, name: route.name, item: `/learn/library/routes/${slug}` },
    ],
  };
  const articleLd = {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: `${route.name} — football route`,
    description: route.description ?? `${route.name} — route template.`,
    articleSection: "Football library",
    keywords: [route.name, ...(route.aliases ?? [])].join(", "),
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
        <Link href="/learn/library/routes" className="hover:text-foreground transition-colors">
          Routes
        </Link>
        <span>›</span>
        <span className="text-foreground">{route.name}</span>
      </nav>

      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            Football Library · Routes
          </p>
          <h1 className="mt-1 text-4xl font-extrabold tracking-tight">{route.name}</h1>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full bg-primary-light px-3 py-0.5 text-xs font-semibold text-primary">
              Route
            </span>
            {route.constraints?.depthRangeYds ? (
              <span className="rounded-full bg-surface-inset px-3 py-0.5 text-xs font-medium text-muted">
                {route.constraints.depthRangeYds.min}-{route.constraints.depthRangeYds.max} yd
              </span>
            ) : null}
            {(route.aliases ?? []).slice(0, 2).map((a) => (
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
          href="/learn/library/routes"
          className="inline-flex items-center gap-1 text-xs text-muted hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-3.5" />
          All routes
        </Link>
      </header>

      <div className="mb-8 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_280px]">
        <div>
          <p className="mb-6 text-lg leading-relaxed text-foreground">
            {route.description ?? `${route.name} — route template.`}
          </p>

          {routeDoc ? (
            <div className="overflow-hidden rounded-2xl border border-border bg-surface-raised">
              <PlayEditorClient
                playId={`library:routes:${slug}:${variant}`}
                playbookId="library-preview"
                playbookName="Football Library"
                playbookVariant={variant}
                initialDocument={routeDoc}
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
              No diagram available for the {route.name} route.
            </div>
          )}

          <p className="mt-4 text-xs text-muted">
            Demo rendered on @Z (strong-side outside WR) at {depth}yd depth — the
            catalog default. The same route family scales to any depth a play
            calls for; concepts that use this route may set a different depth.
          </p>

          {usedByLine ? (
            <p className="mt-6 rounded-xl border border-border bg-surface-raised px-4 py-3 text-sm text-muted">
              <strong className="font-semibold text-foreground">Concepts that use this route: </strong>
              {usedByLine}
            </p>
          ) : null}
        </div>

        <aside className="space-y-4">
          {related.length > 0 ? (
            <div className="rounded-2xl border border-border bg-surface-raised p-4">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">
                <BookOpen className="mr-1 inline size-3.5" />
                Related routes
              </h4>
              <ul className="mt-2 space-y-1.5">
                {related.map((r) => (
                  <li key={r.slug}>
                    <Link
                      href={`/learn/library/routes/${r.slug}`}
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
