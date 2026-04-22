import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getUserEntitlement } from "@/lib/billing/entitlement";
import {
  FREE_MAX_PLAYBOOKS_OWNED,
  tierAtLeast,
} from "@/lib/billing/features";
import { getFreeMaxPlaysPerPlaybook } from "@/lib/site/free-tier-config";

/**
 * When a Coach+ user downgrades to Free, they may own more than
 * FREE_MAX_PLAYBOOKS_OWNED playbooks and individual playbooks may contain more
 * than the admin-configured per-playbook play cap. We never delete their
 * content — we keep it read-only ("locked") until they upgrade again. The
 * rule is oldest-first wins: the first playbook they created stays editable,
 * and the first N plays inside each playbook stay editable, where N is the
 * current site setting.
 */

export type DowngradeLocks = {
  /** Playbook IDs that the user owns but are beyond the free cap. */
  lockedPlaybookIds: Set<string>;
  /** Play IDs that are beyond the per-playbook free cap, keyed by playbookId. */
  lockedPlayIdsByBook: Map<string, Set<string>>;
};

export const EMPTY_LOCKS: DowngradeLocks = {
  lockedPlaybookIds: new Set<string>(),
  lockedPlayIdsByBook: new Map<string, Set<string>>(),
};

/**
 * Compute the set of playbooks and plays that should be locked for the given
 * user. When the owner is on Coach+, no locks apply.
 */
export async function computeDowngradeLocks(userId: string): Promise<DowngradeLocks> {
  const entitlement = await getUserEntitlement(userId);
  if (tierAtLeast(entitlement, "coach")) return EMPTY_LOCKS;

  const admin = createServiceRoleClient();

  const { data: ownedMembers } = await admin
    .from("playbook_members")
    .select("playbook_id, playbooks!inner(id, is_archived, is_default, created_at)")
    .eq("user_id", userId)
    .eq("role", "owner")
    .eq("status", "active");

  type Joined = {
    playbook_id: string;
    playbooks:
      | { id: string; is_archived: boolean; is_default: boolean; created_at: string }
      | { id: string; is_archived: boolean; is_default: boolean; created_at: string }[]
      | null;
  };
  const owned: Array<{ id: string; createdAt: string }> = [];
  for (const row of (ownedMembers ?? []) as unknown as Joined[]) {
    const b = Array.isArray(row.playbooks) ? row.playbooks[0] : row.playbooks;
    if (!b || b.is_default) continue;
    owned.push({ id: b.id, createdAt: b.created_at });
  }
  owned.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const unlockedPlaybookIds = new Set(
    owned.slice(0, FREE_MAX_PLAYBOOKS_OWNED).map((b) => b.id),
  );
  const lockedPlaybookIds = new Set(
    owned.slice(FREE_MAX_PLAYBOOKS_OWNED).map((b) => b.id),
  );

  const lockedPlayIdsByBook = new Map<string, Set<string>>();
  if (unlockedPlaybookIds.size > 0) {
    const freeMaxPlays = await getFreeMaxPlaysPerPlaybook();
    const { data: plays } = await admin
      .from("plays")
      .select("id, playbook_id, created_at, is_archived")
      .in("playbook_id", Array.from(unlockedPlaybookIds))
      .eq("is_archived", false);

    const byBook = new Map<string, Array<{ id: string; createdAt: string }>>();
    for (const p of plays ?? []) {
      const bookId = p.playbook_id as string;
      if (!byBook.has(bookId)) byBook.set(bookId, []);
      byBook.get(bookId)!.push({
        id: p.id as string,
        createdAt: (p.created_at as string) ?? "",
      });
    }
    for (const [bookId, list] of byBook) {
      list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      const locked = list.slice(freeMaxPlays).map((p) => p.id);
      if (locked.length > 0) {
        lockedPlayIdsByBook.set(bookId, new Set(locked));
      }
    }
  }

  return { lockedPlaybookIds, lockedPlayIdsByBook };
}

/**
 * Assert helper for server actions: rejects if the given playbook or play is
 * locked for the owner's current tier. Returns `{ ok: true }` when edits are
 * allowed.
 */
export async function assertNotLocked(input: {
  ownerId: string;
  playbookId?: string;
  playId?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const locks = await computeDowngradeLocks(input.ownerId);
  if (input.playbookId && locks.lockedPlaybookIds.has(input.playbookId)) {
    return {
      ok: false,
      error:
        "This playbook is locked because your plan was downgraded. Upgrade to Coach to unlock it.",
    };
  }
  if (input.playId && input.playbookId) {
    const plays = locks.lockedPlayIdsByBook.get(input.playbookId);
    if (plays?.has(input.playId)) {
      return {
        ok: false,
        error:
          "This play is locked because your plan was downgraded. Upgrade to Coach to unlock it.",
      };
    }
  }
  return { ok: true };
}
