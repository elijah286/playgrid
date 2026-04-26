"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { recordPlaybookVersion } from "@/lib/versions/playbook-version-writer";

const TRASH_RETENTION_DAYS = 30;

export type TrashItem =
  | {
      kind: "play";
      id: string;
      name: string;
      deletedAt: string;
      groupName: string | null;
    }
  | {
      kind: "group";
      id: string;
      name: string;
      deletedAt: string;
    };

export async function listTrashAction(playbookId: string): Promise<
  | { ok: true; items: TrashItem[] }
  | { ok: false; error: string }
> {
  if (!hasSupabaseEnv()) return { ok: false, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const [playsRes, groupsRes] = await Promise.all([
    supabase
      .from("plays")
      .select("id, name, deleted_at, group_id")
      .eq("playbook_id", playbookId)
      .not("deleted_at", "is", null)
      .gte("deleted_at", cutoff)
      .order("deleted_at", { ascending: false }),
    supabase
      .from("playbook_groups")
      .select("id, name, deleted_at")
      .eq("playbook_id", playbookId)
      .not("deleted_at", "is", null)
      .gte("deleted_at", cutoff)
      .order("deleted_at", { ascending: false }),
  ]);

  if (playsRes.error) return { ok: false, error: playsRes.error.message };
  if (groupsRes.error) return { ok: false, error: groupsRes.error.message };

  // Resolve group names for plays — include both live and trashed groups so the
  // user can tell where a deleted play came from.
  const groupIds = Array.from(
    new Set(
      (playsRes.data ?? [])
        .map((p) => p.group_id as string | null)
        .filter((g): g is string => typeof g === "string"),
    ),
  );
  const nameByGroup = new Map<string, string>();
  if (groupIds.length > 0) {
    const { data: groupNames } = await supabase
      .from("playbook_groups")
      .select("id, name")
      .in("id", groupIds);
    for (const g of groupNames ?? []) {
      nameByGroup.set(g.id as string, (g.name as string) ?? "");
    }
  }

  const items: TrashItem[] = [
    ...(playsRes.data ?? []).map((p) => ({
      kind: "play" as const,
      id: p.id as string,
      name: (p.name as string) || "Untitled play",
      deletedAt: p.deleted_at as string,
      groupName:
        p.group_id ? nameByGroup.get(p.group_id as string) ?? null : null,
    })),
    ...(groupsRes.data ?? []).map((g) => ({
      kind: "group" as const,
      id: g.id as string,
      name: (g.name as string) || "Group",
      deletedAt: g.deleted_at as string,
    })),
  ];
  items.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));

  return { ok: true, items };
}

export async function restorePlayAction(playId: string) {
  if (!hasSupabaseEnv()) return { ok: false as const, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const { data: row } = await supabase
    .from("plays")
    .select("playbook_id, name")
    .eq("id", playId)
    .maybeSingle();
  if (!row) return { ok: false as const, error: "Play not found." };

  const { error } = await supabase
    .from("plays")
    .update({ deleted_at: null })
    .eq("id", playId);
  if (error) return { ok: false as const, error: error.message };

  if (row.playbook_id) {
    await recordPlaybookVersion({
      supabase,
      playbookId: row.playbook_id as string,
      userId: user.id,
      kind: "restore",
      diffSummary: `Restored play "${row.name ?? ""}" from trash`,
    });
    revalidatePath(`/playbooks/${row.playbook_id as string}`);
  }
  return { ok: true as const };
}

export async function restoreGroupAction(groupId: string) {
  if (!hasSupabaseEnv()) return { ok: false as const, error: "Supabase is not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const { data: row } = await supabase
    .from("playbook_groups")
    .select("playbook_id, name")
    .eq("id", groupId)
    .maybeSingle();
  if (!row) return { ok: false as const, error: "Group not found." };

  const { error } = await supabase
    .from("playbook_groups")
    .update({ deleted_at: null })
    .eq("id", groupId);
  if (error) return { ok: false as const, error: error.message };

  if (row.playbook_id) {
    await recordPlaybookVersion({
      supabase,
      playbookId: row.playbook_id as string,
      userId: user.id,
      kind: "restore",
      diffSummary: `Restored group "${row.name ?? ""}" from trash`,
    });
    revalidatePath(`/playbooks/${row.playbook_id as string}`);
  }
  return { ok: true as const };
}

// Hard-delete sweep. Runs via an admin/cron path; uses service role to bypass
// RLS and works across all playbooks in one pass.
export async function purgeExpiredTrashAction() {
  if (!hasSupabaseEnv()) return { ok: false as const, error: "Supabase is not configured." };
  const admin = createServiceRoleClient();
  const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const [playsRes, groupsRes] = await Promise.all([
    admin.from("plays").delete().lt("deleted_at", cutoff).select("id"),
    admin.from("playbook_groups").delete().lt("deleted_at", cutoff).select("id"),
  ]);

  if (playsRes.error) return { ok: false as const, error: playsRes.error.message };
  if (groupsRes.error) return { ok: false as const, error: groupsRes.error.message };

  return {
    ok: true as const,
    purgedPlays: playsRes.data?.length ?? 0,
    purgedGroups: groupsRes.data?.length ?? 0,
  };
}
