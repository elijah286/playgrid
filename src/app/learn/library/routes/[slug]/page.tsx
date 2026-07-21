import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { ROUTE_TEMPLATES } from "@/domain/play/routeTemplates";
import { CONCEPTS } from "@/domain/football-kg/defs/concepts";
import type { RouteTemplate } from "@/domain/play/routeTemplates";
import type { PlaySpec } from "@/domain/play/spec";
import { PLAY_SPEC_SCHEMA_VERSION } from "@/domain/play/spec";
import { playSpecToCoachDiagram } from "@/domain/play/specRenderer";
import { coachDiagramToPlayDocument } from "@/features/coach-ai/coachDiagramConverter";
import { defaultSettingsForVariant } from "@/domain/playbook/settings";
import { PlayEditorClient } from "@/features/editor/PlayEditorClient";
import { isCurrentUserSiteAdmin, isFootballLibraryAvailable } from "@/lib/learn/access";
import { loadLibraryOverride } from "@/lib/learn/overrides";
import { toLearnSlug } from "@/lib/learn/links";
import { routeCoachingCues } from "@/lib/coach-ai/notes-from-spec";
import { withFullContext } from "@/lib/seo/ld-json";
import {
  DEFAULT_LIBRARY_VARIANT,
  defaultVariantForConceptDef,
  variantToSlug,
} from "@/lib/learn/variant";
import { RouteGrid, type RouteGridItem } from "./RouteGrid";

export const dynamicParams = false;
export const revalidate = 3600;

export function generateStaticParams() {
  return ROUTE_TEMPLATES.map((r) => ({ slug: toLearnSlug(r.name) }));
}

function findRouteBySlug(slug: string): RouteTemplate | null {
  return ROUTE_TEMPLATES.find((r) => toLearnSlug(r.name) === slug) ?? null;
}

/** "cover 0" → "Cover 0", "tampa 2" → "Tampa 2", "man" → "Man". */
function coverageLabel(key: string): string {
  return key.replace(/\b\w/g, (c) => c.toUpperCase());
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
  if (!route) return { title: "Route not found" };
  const { cue, byCoverage } = routeCoachingCues(route.name);
  const description = cue
    ? `${route.name} route — ${cue}.${byCoverage.length ? " Plus how to read it by coverage." : ""}`
    : route.description ?? `The ${route.name} route — football route template.`;
  return {
    title: `${route.name} route · Football Library`,
    description,
    alternates: { canonical: `/learn/library/routes/${slug}` },
    openGraph: {
      title: `${route.name} — football route`,
      description,
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

  // Synthesize a minimal play that runs THIS route on the outside
  // weak-side WR (@X), with the rest of the formation idle. We use
  // X (not Z) because X renders in red — easier to spot against the
  // green field than Z's blue — and a coach reading a route page
  // only cares about ONE receiver running THE route. The canonical
  // renderer (playSpecToCoachDiagram) places the receiver and draws
  // the route from the catalog template at the chosen depth. Same
  // render path the in-app builder uses (Rule 14: one render path).
  const depth = defaultDepthFor(route);
  const spec: PlaySpec = {
    schemaVersion: PLAY_SPEC_SCHEMA_VERSION,
    variant,
    title: `${route.name} demo`,
    playType: "offense",
    formation: { name: "Spread Doubles", strength: "right" },
    assignments: [
      {
        player: "X",
        confidence: "high",
        action: { kind: "route", family: route.name, depthYds: depth },
      },
    ],
  };
  let routeDoc: ReturnType<typeof coachDiagramToPlayDocument> | null = null;
  try {
    const { diagram } = playSpecToCoachDiagram(spec);
    // Keep only the route runner and QB — the other receivers crowd the
    // diagram without adding teaching value. Filtering on the rendered
    // diagram (not the spec) lets the renderer place X at its real
    // formation position, so the route geometry is accurate.
    const KEEP = new Set(["QB", "X"]);
    const slimDiagram = {
      ...diagram,
      players: diagram.players.filter((p) => KEEP.has(p.id)),
      routes: (diagram.routes ?? []).filter((r) => KEEP.has(r.from)),
    };
    const baseDoc = coachDiagramToPlayDocument(slimDiagram);
    // Clean demo field: white background, LOS shown for reference,
    // no grid noise or no-run zone bands (those are 5v5-specific).
    routeDoc = {
      ...baseDoc,
      fieldBackground: "white",
      showHashMarks: false,
      showYardNumbers: false,
      showYardLines: true,
      showNoRunZones: false,
      lineOfScrimmage: "line",
    };
  } catch (err) {
    console.warn(
      `[library/routes] render failed for ${slug} in ${variant}`,
      err,
    );
  }
  const playbookSettings = defaultSettingsForVariant(variant);

  // Apply admin override on top of the route demo. Routes are
  // variant-agnostic, so the override row is keyed by `(slug, variant)`
  // using the demo variant (flag_5v5). When a site admin has edited
  // the route via the admin editor, this PlayDocument replaces the
  // demo geometry — but we FORCE the library's clean display settings
  // (white background, no hash marks / numbers / no-run zones) on top
  // so the route always reads the same in the library regardless of
  // what field-display options the admin happened to have toggled on
  // when they saved. Reading the override calls Supabase (cookie auth),
  // so the page renders per-request and updates the second an admin
  // saves.
  const override = await loadLibraryOverride(slug, variant);
  if (override) {
    routeDoc = {
      ...override.document,
      fieldBackground: "white",
      showHashMarks: false,
      showYardNumbers: false,
      showYardLines: true,
      showNoRunZones: false,
      lineOfScrimmage: "line",
    };
  }
  const isAdmin = await isCurrentUserSiteAdmin();

  // Concepts that use this route family — shown as a "used by"
  // rail. Each name links to the concept's library page so a coach
  // reading the Corner route can jump straight to Smash / Snag /
  // Flood without going back through the concept index. Variant
  // comes from the concept's default (routes are variant-agnostic
  // but concept pages aren't).
  const usedBy = CONCEPTS.filter((c) =>
    c.pattern.some((p) => p.family.toLowerCase() === route.name.toLowerCase()),
  ).map((c) => {
    const conceptSlug = toLearnSlug(c.name);
    const defaultV = defaultVariantForConceptDef(c);
    const href = defaultV
      ? `/learn/library/plays/${conceptSlug}/${variantToSlug(defaultV)}`
      : `/learn/library/plays/${conceptSlug}`;
    return { name: c.name, href };
  });
  const usedByVisible = usedBy.slice(0, 6);
  const usedByOverflow = usedBy.length - usedByVisible.length;
  const cues = routeCoachingCues(route.name);

  const allRoutes: RouteGridItem[] = ROUTE_TEMPLATES.map((r) => ({
    name: r.name,
    slug: toLearnSlug(r.name),
    points: r.points,
    shapes: r.shapes,
  }));

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
        <div className="flex flex-col items-end gap-2">
          <Link
            href="/learn/library/routes"
            className="inline-flex items-center gap-1 text-xs text-muted hover:text-foreground transition-colors"
          >
            <ArrowLeft className="size-3.5" />
            All routes
          </Link>
          {/* Admin-only edit affordance. Opens the canonical play
              editor on the route's demo diagram; edits autosave to
              library_concept_overrides keyed by (slug, flag_5v5). */}
          {isAdmin && (
            <Link
              href={`/learn/library/admin/routes/${slug}/edit`}
              className="inline-flex items-center gap-1 text-xs font-medium text-muted underline decoration-dotted underline-offset-4 hover:text-primary"
              aria-label={`Edit ${route.name} route in the play editor`}
            >
              <Pencil className="size-3" />
              {override ? "Edit override" : "Edit this route"}
            </Link>
          )}
        </div>
      </header>

      <div className="mb-8 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_280px]">
        <div>
          <p className="mb-6 max-w-2xl text-lg leading-relaxed text-foreground">
            {route.description ?? `${route.name} — route template.`}
          </p>

          {routeDoc ? (
            // Route demos use only one receiver + QB on a field designed
            // for 10. Constrain the visual to a centered 480px column so
            // the route doesn't drown in a sea of empty field width.
            // Plays/defenses/formations DON'T get this constraint —
            // they use the full field width legitimately.
            <div className="mx-auto max-w-[480px] overflow-hidden rounded-2xl border border-border bg-surface-raised">
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

          <p className="mt-4 max-w-2xl text-xs text-muted">
            Demo rendered on @X (outside WR) at {depth}yd depth. Only the
            route runner and the QB are shown so the break stays the focus;
            the same route family scales to any depth a play calls for, and
            concepts that use this route may set a different depth.
          </p>

          {cues.cue ? (
            <section className="mt-8">
              <h2 className="text-xl font-bold tracking-tight">How to run it</h2>
              <p className="mt-2 text-base leading-relaxed text-muted">{cues.cue}.</p>
            </section>
          ) : null}

          {cues.byCoverage.length > 0 ? (
            <section className="mt-8">
              <h2 className="text-xl font-bold tracking-tight">Reading it by coverage</h2>
              <p className="mt-1 text-sm text-muted">
                How to run the {route.name.toLowerCase()} against what the
                defense shows.
              </p>
              <dl className="mt-3 space-y-2">
                {cues.byCoverage.map(({ coverage, cue }) => (
                  <div key={coverage} className="text-base leading-relaxed">
                    <dt className="inline font-semibold text-foreground">
                      {coverageLabel(coverage)}:{" "}
                    </dt>
                    <dd className="inline text-muted">{cue}.</dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}

          {usedBy.length > 0 ? (
            <p className="mt-8 rounded-xl border border-border bg-surface-raised px-4 py-3 text-sm text-muted">
              <strong className="font-semibold text-foreground">Concepts that use this route: </strong>
              {usedByVisible.map((c, i) => (
                <span key={c.name}>
                  <Link
                    href={c.href}
                    className="text-primary hover:underline"
                  >
                    {c.name}
                  </Link>
                  {i < usedByVisible.length - 1 ? ", " : ""}
                </span>
              ))}
              {usedByOverflow > 0 ? `, +${usedByOverflow} more` : ""}
            </p>
          ) : null}
        </div>

        <aside>
          <RouteGrid routes={allRoutes} currentSlug={slug} />
        </aside>
      </div>
    </article>
  );
}
