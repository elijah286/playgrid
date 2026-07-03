"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { leagueOpsEnabled } from "@/lib/league/access";
import type {
  LibraryDefault,
  LibraryItem,
  LibraryItemKind,
  LibrarySourcePlaybook,
} from "@/lib/league/library";

// The library is the OPERATOR'S own registry (owner-scoped RLS): every query
// here runs on the cookie client as the signed-in user, so RLS enforces both
// library ownership and that sources are playbooks they're actually a member
// of. No service role anywhere in Phase 1. Delegate access (manage_curriculum)
// can come later.

async function gate() {
  if (!leagueOpsEnabled() || !hasSupabaseEnv()) {
    return { ok: false as const, error: "Not available." };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };
  return { ok: true as const, supabase, userId: user.id };
}

function rowToItem(r: Record<string, unknown>): LibraryItem {
  return {
    id: r.id as string,
    kind: r.kind as LibraryItemKind,
    sourcePlaybookId: r.source_playbook_id as string,
    sourceGroupId: (r.source_group_id as string | null) ?? null,
    sourcePracticePlanId: (r.source_practice_plan_id as string | null) ?? null,
    title: r.title as string,
    sport: r.sport as string,
    variant: r.variant as string,
    tags: (r.tags as string[]) ?? [],
    createdAt: r.created_at as string,
  };
}

export async function listLibraryAction() {
  const g = await gate();
  if (!g.ok) return { ok: false as const, error: g.error, items: [] as LibraryItem[], defaults: [] as LibraryDefault[] };
  const [{ data: items }, { data: defaults }] = await Promise.all([
    g.supabase.from("league_library_items").select("*").order("created_at", { ascending: false }),
    g.supabase.from("league_library_defaults").select("id, item_id, league_id"),
  ]);
  return {
    ok: true as const,
    items: (items ?? []).map(rowToItem),
    defaults: (defaults ?? []).map((r) => ({
      id: r.id as string,
      itemId: r.item_id as string,
      leagueId: (r.league_id as string | null) ?? null,
    })),
  };
}

/** The operator's playbooks with their named play groups (+ play counts) and
 *  practice plans — the candidates "Add to library" registers from. */
export async function listLibrarySourcesAction() {
  const g = await gate();
  if (!g.ok) return { ok: false as const, error: g.error, playbooks: [] as LibrarySourcePlaybook[] };
  const { supabase, userId } = g;

  const { data: memberships } = await supabase
    .from("playbook_members")
    .select("playbook_id")
    .eq("user_id", userId)
    .eq("role", "owner")
    .eq("status", "active");
  const pbIds = (memberships ?? []).map((m) => m.playbook_id as string);
  if (pbIds.length === 0) return { ok: true as const, playbooks: [] };

  const [{ data: pbs }, { data: groups }, { data: plans }, { data: plays }] = await Promise.all([
    supabase.from("playbooks").select("id, name, sport_variant").in("id", pbIds).eq("is_archived", false),
    supabase.from("playbook_groups").select("id, name, playbook_id").in("playbook_id", pbIds),
    supabase.from("practice_plans").select("id, title, playbook_id").in("playbook_id", pbIds).is("deleted_at", null),
    supabase.from("plays").select("id, group_id").in("playbook_id", pbIds).eq("is_archived", false),
  ]);

  const playCount = new Map<string, number>();
  for (const p of plays ?? []) {
    const gId = p.group_id as string | null;
    if (gId) playCount.set(gId, (playCount.get(gId) ?? 0) + 1);
  }

  const result: LibrarySourcePlaybook[] = (pbs ?? []).map((pb) => ({
    playbookId: pb.id as string,
    playbookName: pb.name as string,
    variant: (pb.sport_variant as string) ?? "flag_7v7",
    groups: (groups ?? [])
      .filter((gr) => gr.playbook_id === pb.id)
      .map((gr) => ({
        id: gr.id as string,
        name: gr.name as string,
        playCount: playCount.get(gr.id as string) ?? 0,
      })),
    practicePlans: (plans ?? [])
      .filter((pl) => pl.playbook_id === pb.id)
      .map((pl) => ({ id: pl.id as string, title: (pl.title as string) ?? "Practice plan" })),
  }));
  return { ok: true as const, playbooks: result };
}

export async function registerLibraryItemAction(input: {
  kind: LibraryItemKind;
  sourcePlaybookId: string;
  sourceId: string;
  title: string;
  tags: string[];
}) {
  const g = await gate();
  if (!g.ok) return { ok: false as const, error: g.error };
  const title = input.title.trim().slice(0, 120);
  if (!title) return { ok: false as const, error: "Give it a title." };

  // Derive the variant from the source playbook (RLS proves membership).
  const { data: pb } = await g.supabase
    .from("playbooks")
    .select("id, sport_variant")
    .eq("id", input.sourcePlaybookId)
    .maybeSingle();
  if (!pb) return { ok: false as const, error: "That playbook isn't yours." };

  const { error } = await g.supabase.from("league_library_items").insert({
    owner_id: g.userId,
    kind: input.kind,
    source_playbook_id: input.sourcePlaybookId,
    source_group_id: input.kind === "play_group" ? input.sourceId : null,
    source_practice_plan_id: input.kind === "practice_plan" ? input.sourceId : null,
    title,
    sport: "football",
    variant: (pb.sport_variant as string) ?? "flag_7v7",
    tags: input.tags.map((t) => t.trim()).filter(Boolean).slice(0, 12),
  });
  if (error) {
    return {
      ok: false as const,
      error: error.code === "23505" ? "That group/plan is already in your library." : error.message,
    };
  }
  revalidatePath("/league/library");
  return { ok: true as const };
}

export async function removeLibraryItemAction(itemId: string) {
  const g = await gate();
  if (!g.ok) return { ok: false as const, error: g.error };
  const { error } = await g.supabase.from("league_library_items").delete().eq("id", itemId);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/league/library");
  return { ok: true as const };
}

/** Toggle a default. leagueId null = org-wide ("every new team of this
 *  item's game type"). */
export async function setLibraryDefaultAction(itemId: string, leagueId: string | null, on: boolean) {
  const g = await gate();
  if (!g.ok) return { ok: false as const, error: g.error };
  if (on) {
    const { error } = await g.supabase
      .from("league_library_defaults")
      .insert({ owner_id: g.userId, item_id: itemId, league_id: leagueId });
    if (error && error.code !== "23505") return { ok: false as const, error: error.message };
  } else {
    let q = g.supabase.from("league_library_defaults").delete().eq("item_id", itemId);
    q = leagueId === null ? q.is("league_id", null) : q.eq("league_id", leagueId);
    const { error } = await q;
    if (error) return { ok: false as const, error: error.message };
  }
  revalidatePath("/league/library");
  return { ok: true as const };
}
