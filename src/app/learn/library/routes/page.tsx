import type { Metadata } from "next";
import { ROUTE_TEMPLATES } from "@/domain/play/routeTemplates";
import { toLearnSlug } from "@/lib/learn/links";
import { CategoryIndex } from "../_CategoryIndex";

export const metadata: Metadata = {
  title: "Routes · Football library · XO Gridmaker",
  description:
    "Every route template in the XO Gridmaker library — slants, posts, hitches, wheels, corners, and more. The building blocks of every passing play.",
  alternates: { canonical: "/learn/library/routes" },
};

export default function RoutesIndexPage() {
  const sorted = [...ROUTE_TEMPLATES].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <CategoryIndex
      category="routes"
      title="Routes"
      description="Receiver route templates — the named patterns coaches call by shorthand. Each route links to its coaching cues, common depth, and the play concepts that use it."
      entities={sorted.map((r) => ({
        name: r.name,
        slug: toLearnSlug(r.name),
        description: r.description ?? `${r.name} — route template.`,
      }))}
      note={`${sorted.length} routes in the catalog. Route diagrams render in an upcoming release.`}
    />
  );
}
