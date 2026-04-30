import { createServiceRoleClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import type { PlayDocument, Player, Route, Zone } from "@/domain/play/types";
import type { ExampleBookTileData } from "@/features/dashboard/ExampleBookTile";

const PREVIEWS_PER_BOOK = 12;

/**
 * Shared loader for public example playbooks — used by /examples and
 * the home page so both surfaces show the same tiles.
 */
export async function loadExamplePlaybooks(): Promise<ExampleBookTileData[]> {
  return loadExamplePlaybooksFiltered({});
}

/**
 * Same data shape as loadExamplePlaybooks(), but returns the single
 * playbook flagged is_hero_marketing_example (or null if no hero is
 * set or the flagged book is somehow no longer a public example).
 *
 * Used by the home-page hero shot to swap the static X/O illustration
 * for a real example tile when an admin has picked one.
 */
export async function loadHeroMarketingExample(): Promise<
  ExampleBookTileData | null
> {
  const tiles = await loadExamplePlaybooksFiltered({ heroOnly: true });
  return tiles[0] ?? null;
}

async function loadExamplePlaybooksFiltered({
  heroOnly = false,
}: {
  heroOnly?: boolean;
}): Promise<ExampleBookTileData[]> {
  if (!hasSupabaseEnv()) return [];
  const svc = createServiceRoleClient();
  let q = svc
    .from("playbooks")
    .select(
      "id, name, season, logo_url, color, updated_at, example_author_label, plays(count)",
    )
    .eq("is_public_example", true)
    .eq("is_archived", false);
  if (heroOnly) q = q.eq("is_hero_marketing_example", true);
  const { data: books } = await q.order("updated_at", { ascending: false });

  if (!books || books.length === 0) return [];

  type Row = {
    id: string;
    name: string;
    season: string | null;
    logo_url: string | null;
    color: string | null;
    updated_at: string | null;
    example_author_label: string | null;
    plays: { count: number }[] | { count: number } | null;
  };

  const ids = (books as Row[]).map((b) => b.id);

  const { data: playRows } = await svc
    .from("plays")
    .select("id, playbook_id, current_version_id, updated_at")
    .in("playbook_id", ids)
    .eq("is_archived", false)
    .is("attached_to_play_id", null)
    .eq("play_type", "offense")
    .order("updated_at", { ascending: false });

  const versionIdsByBook = new Map<string, string[]>();
  for (const p of (playRows ?? []) as Array<{
    playbook_id: string;
    current_version_id: string | null;
  }>) {
    if (!p.current_version_id) continue;
    const arr = versionIdsByBook.get(p.playbook_id) ?? [];
    if (arr.length < PREVIEWS_PER_BOOK) {
      arr.push(p.current_version_id);
      versionIdsByBook.set(p.playbook_id, arr);
    }
  }

  const allVersionIds = Array.from(versionIdsByBook.values()).flat();
  const docsByVid = new Map<string, PlayDocument>();
  if (allVersionIds.length > 0) {
    const { data: versions } = await svc
      .from("play_versions")
      .select("id, document")
      .in("id", allVersionIds);
    for (const v of (versions ?? []) as Array<{ id: string; document: PlayDocument | null }>) {
      if (v.document) docsByVid.set(v.id, v.document);
    }
  }

  return (books as Row[]).map((b) => {
    const agg = Array.isArray(b.plays) ? b.plays[0] : b.plays;
    const vids = versionIdsByBook.get(b.id) ?? [];
    const previews = vids
      .map((vid) => docsByVid.get(vid))
      .filter((d): d is PlayDocument => d != null)
      .map((doc) => ({
        players: (doc.layers?.players ?? []) as Player[],
        routes: (doc.layers?.routes ?? []) as Route[],
        zones: (doc.layers?.zones ?? []) as Zone[],
        lineOfScrimmageY:
          typeof doc.lineOfScrimmageY === "number" ? doc.lineOfScrimmageY : 0.4,
      }));
    return {
      id: b.id,
      name: b.name,
      season: b.season,
      logo_url: b.logo_url,
      color: b.color,
      play_count: agg?.count ?? 0,
      author_label: b.example_author_label,
      previews,
    } satisfies ExampleBookTileData;
  });
}
