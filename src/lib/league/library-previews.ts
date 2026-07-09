import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { PracticePlanDocument } from "@/domain/practice-plan/types";
import type { Player, Route, Zone } from "@/domain/play/types";
import type {
  LibraryItemPreview,
  LibraryPlanBlock,
  LibraryPlayPreview,
  PlayPreviewData,
} from "@/lib/league/library";

// Preview builders shared by the portfolio Library page (cookie client, RLS)
// and the per-league Playbooks/distribution page (service-role client after
// its capability gate). Both render the SAME diagrams a distribution would
// copy: the play filters mirror distribute.ts exactly, and the jsonb-path
// select mirrors the coach playbook grid (plays.ts) — layer slices only.

/** How many diagrams a card/picker shows per item; the true count rides along. */
export const PREVIEW_PLAY_CAP = 6;

export async function groupPlayPreviews(
  db: SupabaseClient,
  groupIds: string[],
): Promise<Map<string, { plays: LibraryPlayPreview[]; totalPlays: number }>> {
  const result = new Map<string, { plays: LibraryPlayPreview[]; totalPlays: number }>();
  if (groupIds.length === 0) return result;

  const { data: plays } = await db
    .from("plays")
    .select("id, name, group_id, current_version_id")
    .in("group_id", groupIds)
    .eq("is_archived", false)
    .is("deleted_at", null)
    .is("attached_to_play_id", null)
    .order("sort_order", { ascending: true });

  const byGroup = new Map<string, { id: string; name: string; versionId: string | null }[]>();
  for (const p of plays ?? []) {
    const gId = p.group_id as string;
    byGroup.set(gId, [
      ...(byGroup.get(gId) ?? []),
      {
        id: p.id as string,
        name: p.name as string,
        versionId: (p.current_version_id as string | null) ?? null,
      },
    ]);
  }

  const versionIds = [...byGroup.values()]
    .flatMap((list) => list.slice(0, PREVIEW_PLAY_CAP))
    .map((p) => p.versionId)
    .filter((id): id is string => !!id);
  const previewByVersion = new Map<string, PlayPreviewData>();
  if (versionIds.length > 0) {
    const { data: versions } = await db
      .from("play_versions")
      .select(
        "id, players:document->layers->players, routes:document->layers->routes, zones:document->layers->zones, los:document->lineOfScrimmageY",
      )
      .in("id", versionIds);
    for (const v of (versions ?? []) as Array<{
      id: string;
      players: Player[] | null;
      routes: Route[] | null;
      zones: Zone[] | null;
      los: number | null;
    }>) {
      previewByVersion.set(v.id, {
        players: v.players ?? [],
        routes: v.routes ?? [],
        zones: v.zones ?? [],
        lineOfScrimmageY: typeof v.los === "number" ? v.los : 0.4,
      });
    }
  }

  for (const [gId, list] of byGroup) {
    const withPreviews: LibraryPlayPreview[] = [];
    for (const p of list.slice(0, PREVIEW_PLAY_CAP)) {
      const preview = p.versionId ? previewByVersion.get(p.versionId) : undefined;
      if (preview) withPreviews.push({ id: p.id, name: p.name, preview });
    }
    result.set(gId, { plays: withPreviews, totalPlays: list.length });
  }
  return result;
}

export async function planPreviews(
  db: SupabaseClient,
  planIds: string[],
): Promise<
  Map<
    string,
    { totalDurationMinutes: number; blocks: LibraryPlanBlock[]; drills: LibraryPlayPreview[] }
  >
> {
  const result = new Map<
    string,
    { totalDurationMinutes: number; blocks: LibraryPlanBlock[]; drills: LibraryPlayPreview[] }
  >();
  if (planIds.length === 0) return result;

  const { data: plans } = await db
    .from("practice_plans")
    .select("id, current_version_id")
    .in("id", planIds);
  const versionToPlan = new Map<string, string>();
  for (const p of plans ?? []) {
    if (p.current_version_id) versionToPlan.set(p.current_version_id as string, p.id as string);
  }
  if (versionToPlan.size === 0) return result;

  const { data: versions } = await db
    .from("practice_plan_versions")
    .select("id, document")
    .in("id", [...versionToPlan.keys()]);

  for (const v of versions ?? []) {
    const planId = versionToPlan.get(v.id as string);
    if (!planId) continue;
    result.set(planId, planSummaryFromDocument(v.document));
  }
  return result;
}

/** Pure: a practice-plan document → timeline summary + embedded drill
 *  diagrams (capped). Tolerates partial/legacy documents. */
export function planSummaryFromDocument(document: unknown): {
  totalDurationMinutes: number;
  blocks: LibraryPlanBlock[];
  drills: LibraryPlayPreview[];
} {
  const doc = (document ?? {}) as Partial<PracticePlanDocument>;
  const blocks = Array.isArray(doc.blocks) ? doc.blocks : [];
  const drills: LibraryPlayPreview[] = [];
  for (const block of blocks) {
    for (const lane of block.lanes ?? []) {
      if (drills.length >= PREVIEW_PLAY_CAP) break;
      const layers = lane.diagram?.document?.layers;
      if (!layers?.players?.length) continue;
      drills.push({
        id: lane.id,
        name: lane.title || block.title || "Drill",
        preview: {
          players: layers.players ?? [],
          routes: layers.routes ?? [],
          zones: layers.zones ?? [],
          lineOfScrimmageY:
            typeof lane.diagram?.document?.lineOfScrimmageY === "number"
              ? lane.diagram.document.lineOfScrimmageY
              : 0.4,
        },
      });
    }
  }
  return {
    totalDurationMinutes:
      typeof doc.totalDurationMinutes === "number" ? doc.totalDurationMinutes : 0,
    blocks: blocks.map((b) => ({
      title: b.title || "Block",
      durationMinutes: b.durationMinutes ?? 0,
      laneCount: (b.lanes ?? []).length,
    })),
    drills,
  };
}

/** Compose per-item previews for library items (any client, caller gates). */
export async function buildLibraryItemPreviews(
  db: SupabaseClient,
  items: {
    id: string;
    kind: string;
    source_group_id: string | null;
    source_practice_plan_id: string | null;
  }[],
  teamsReachedByItem: Map<string, number>,
): Promise<LibraryItemPreview[]> {
  const groupIds = items
    .map((i) => i.source_group_id)
    .filter((id): id is string => !!id);
  const planIds = items
    .map((i) => i.source_practice_plan_id)
    .filter((id): id is string => !!id);

  const [groups, plans] = await Promise.all([
    groupPlayPreviews(db, groupIds),
    planPreviews(db, planIds),
  ]);

  return items.map((i) => {
    const teamsReached = teamsReachedByItem.get(i.id) ?? 0;
    if (i.kind === "play_group") {
      const gp = i.source_group_id ? groups.get(i.source_group_id) : undefined;
      return {
        itemId: i.id,
        plays: gp?.plays ?? [],
        totalPlays: gp?.totalPlays ?? 0,
        plan: null,
        teamsReached,
      };
    }
    const pp = i.source_practice_plan_id ? plans.get(i.source_practice_plan_id) : undefined;
    return {
      itemId: i.id,
      plays: pp?.drills ?? [],
      totalPlays: pp?.drills.length ?? 0,
      plan: pp ? { totalDurationMinutes: pp.totalDurationMinutes, blocks: pp.blocks } : null,
      teamsReached,
    };
  });
}
