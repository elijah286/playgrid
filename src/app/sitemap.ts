import type { MetadataRoute } from "next";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { getExamplesPageEnabled } from "@/lib/site/examples-config";

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
    { path: "/learn-more", priority: 0.95 },
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

  const dynamicEntries = await loadExamplePlaybookEntries(now);
  return [...staticEntries, ...dynamicEntries];
}
