import type { MetadataRoute } from "next";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { getExamplesPageEnabled } from "@/lib/site/examples-config";
import { CONCEPTS } from "@/domain/football-kg/defs/concepts";
import { FORMATIONS } from "@/domain/football-kg/defs/formations";
import { ROUTE_TEMPLATES } from "@/domain/play/routeTemplates";
import { DEFENSIVE_ALIGNMENTS } from "@/domain/play/defensiveAlignments";
import { toLearnSlug } from "@/lib/learn/links";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.xogridmaker.com";

type Entry = {
  url: string;
  lastModified: Date;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
  priority: number;
};

async function loadExamplePlaybookEntries(now: Date): Promise<Entry[]> {
  if (!hasSupabaseEnv()) return [];
  try {
    const enabled = await getExamplesPageEnabled();
    if (!enabled) return [];
    const svc = createServiceRoleClient();
    const { data, error } = await svc
      .from("playbooks")
      .select("id, updated_at")
      .eq("is_public_example", true)
      .eq("is_archived", false);
    if (error || !data) return [];
    return data.map((b) => ({
      url: `${SITE_URL}/playbooks/${b.id}`,
      lastModified: b.updated_at ? new Date(b.updated_at as string) : now,
      changeFrequency: "weekly",
      priority: 0.7,
    }));
  } catch {
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const staticRoutes: Array<{ path: string; priority: number }> = [
    { path: "/", priority: 1 },
    { path: "/coach-cal", priority: 0.95 },
    { path: "/learn/library", priority: 0.95 },
    { path: "/learn/using-xo", priority: 0.85 },
    { path: "/examples", priority: 0.9 },
    { path: "/pricing", priority: 0.8 },
    { path: "/faq", priority: 0.8 },
    { path: "/about", priority: 0.7 },
    { path: "/contact", priority: 0.6 },
    { path: "/privacy", priority: 0.4 },
    { path: "/terms", priority: 0.4 },
    { path: "/login", priority: 0.5 },
  ];

  const staticEntries: Entry[] = staticRoutes.map(({ path, priority }) => ({
    url: `${SITE_URL}${path}`,
    lastModified: now,
    changeFrequency: "monthly",
    priority,
  }));

  // Category index pages.
  const libraryCategories: Entry[] = [
    { path: "/learn/library/plays", priority: 0.85 },
    { path: "/learn/library/formations", priority: 0.8 },
    { path: "/learn/library/routes", priority: 0.8 },
    { path: "/learn/library/defense", priority: 0.8 },
  ].map(({ path, priority }) => ({
    url: `${SITE_URL}${path}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority,
  }));

  // Every concept / formation / route / defense gets a page.
  const conceptEntries: Entry[] = CONCEPTS.map((c) => ({
    url: `${SITE_URL}/learn/library/plays/${toLearnSlug(c.name)}`,
    lastModified: now,
    changeFrequency: "monthly",
    priority: 0.75,
  }));
  const formationEntries: Entry[] = FORMATIONS.map((f) => ({
    url: `${SITE_URL}/learn/library/formations/${toLearnSlug(f.name)}`,
    lastModified: now,
    changeFrequency: "monthly",
    priority: 0.7,
  }));
  const routeEntries: Entry[] = ROUTE_TEMPLATES.map((r) => ({
    url: `${SITE_URL}/learn/library/routes/${toLearnSlug(r.name)}`,
    lastModified: now,
    changeFrequency: "monthly",
    priority: 0.7,
  }));
  // Defense pages dedupe by (front, coverage) — the slug page groups
  // variants under one URL, so the sitemap must too.
  const defenseSlugs = new Set<string>();
  for (const a of DEFENSIVE_ALIGNMENTS) {
    const front = (a.front ?? "").trim();
    const coverage = (a.coverage ?? "").trim();
    const name =
      !front || front.toLowerCase() === coverage.toLowerCase()
        ? coverage
        : `${front} ${coverage}`.trim();
    defenseSlugs.add(toLearnSlug(name));
  }
  const defenseEntries: Entry[] = Array.from(defenseSlugs).map((slug) => ({
    url: `${SITE_URL}/learn/library/defense/${slug}`,
    lastModified: now,
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  const dynamicEntries = await loadExamplePlaybookEntries(now);
  return [
    ...staticEntries,
    ...libraryCategories,
    ...conceptEntries,
    ...formationEntries,
    ...routeEntries,
    ...defenseEntries,
    ...dynamicEntries,
  ];
}
