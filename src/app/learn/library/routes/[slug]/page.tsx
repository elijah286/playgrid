import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ROUTE_TEMPLATES } from "@/domain/play/routeTemplates";
import { CONCEPTS } from "@/domain/football-kg/defs/concepts";
import type { RouteTemplate } from "@/domain/play/routeTemplates";
import { toLearnSlug } from "@/lib/learn/links";
import { LibraryEntityPage } from "../../_LibraryEntityPage";

export const dynamicParams = false;
export const revalidate = 3600;

export function generateStaticParams() {
  return ROUTE_TEMPLATES.map((r) => ({ slug: toLearnSlug(r.name) }));
}

function findRouteBySlug(slug: string): RouteTemplate | null {
  return ROUTE_TEMPLATES.find((r) => toLearnSlug(r.name) === slug) ?? null;
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
  const { slug } = await params;
  const route = findRouteBySlug(slug);
  if (!route) notFound();

  // Concepts that use this route family.
  const usedBy = CONCEPTS.filter((c) =>
    c.pattern.some((p) => p.family.toLowerCase() === route.name.toLowerCase()),
  ).map((c) => c.name);
  const usedByLine =
    usedBy.length > 0
      ? `${usedBy.slice(0, 6).join(", ")}${usedBy.length > 6 ? `, +${usedBy.length - 6} more` : ""}`
      : undefined;

  // Related routes: just the 5 nearest other templates alphabetically.
  // Cheap heuristic; once we have route tags we'll do proper overlap.
  const related = ROUTE_TEMPLATES.filter((r) => r.name !== route.name)
    .slice(0, 6)
    .map((r) => ({ name: r.name, slug: toLearnSlug(r.name) }));

  return (
    <LibraryEntityPage
      category="routes"
      categoryLabel="Route"
      name={route.name}
      slug={slug}
      aliases={route.aliases ?? []}
      description={route.description ?? `${route.name} — route template.`}
      related={related}
      usedByLine={usedByLine}
    />
  );
}
