import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ROUTE_TEMPLATES } from "@/domain/play/routeTemplates";
import { isFootballLibraryAvailable } from "@/lib/learn/access";
import { toLearnSlug } from "@/lib/learn/links";
import { CategoryIndex } from "../_CategoryIndex";

export const metadata: Metadata = {
  title: "Routes · Football library · XO Gridmaker",
  description:
    "Every route template in the XO Gridmaker library — slants, posts, hitches, wheels, corners, and more. The building blocks of every passing play.",
  alternates: { canonical: "/learn/library/routes" },
};

export default async function RoutesIndexPage() {
  if (!(await isFootballLibraryAvailable())) notFound();

  // Routes are variant-agnostic — a Slant is a Slant regardless of
  // game type — so unlike plays / formations / defenses the routes
  // pages don't show the variant pill. The detail page picks a
  // single default variant internally just to anchor the demo
  // render's field dimensions.
  const sorted = [...ROUTE_TEMPLATES].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <CategoryIndex
      category="routes"
      title="Routes"
      description="Receiver route templates — the named patterns coaches call by shorthand. Each route renders a live demo on its detail page and links to the play concepts that use it."
      entities={sorted.map((r) => ({
        name: r.name,
        slug: toLearnSlug(r.name),
        description: r.description ?? `${r.name} — route template.`,
      }))}
      note={`${sorted.length} routes in the catalog.`}
      hideVariantPill
    />
  );
}
