"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { sendPushToUsers } from "@/lib/notifications/push";
import {
  MAX_MESSAGE_LENGTH,
  MESSAGE_PAGE_SIZE,
  type PlaybookMessageAuthor,
  type PlaybookMessageRow,
} from "@/domain/messages/types";

type ActionResult<T = Record<string, never>> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

function notConfigured() {
  return { ok: false as const, error: "Supabase is not configured." };
}

async function authedUserId(): Promise<string | null> {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  return user?.id ?? null;
}

type RawRow = {
  id: string;
  playbook_id: string;
  author_id: string;
  body: string;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
};

function rowToMessage(
  row: RawRow,
  authors: Map<string, PlaybookMessageAuthor>,
): PlaybookMessageRow {
  return {
    id: row.id,
    playbookId: row.playbook_id,
    authorId: row.author_id,
    body: row.body,
    createdAt: row.created_at,
    editedAt: row.edited_at,
    deletedAt: row.deleted_at,
    deletedBy: row.deleted_by,
    author: authors.get(row.author_id) ?? null,
  };
}

async function hydrateAuthors(
  sb: Awaited<ReturnType<typeof createClient>>,
  authorIds: string[],
): Promise<Map<string, PlaybookMessageAuthor>> {
  const out = new Map<string, PlaybookMessageAuthor>();
  if (authorIds.length === 0) return out;
  const unique = Array.from(new Set(authorIds));
  const { data } = await sb
    .from("profiles")
    .select("id, display_name, avatar_url")
    .in("id", unique);
  for (const p of data ?? []) {
    out.set(p.id as string, {
      id: p.id as string,
      displayName: (p.display_name as string | null) ?? null,
      avatarUrl: (p.avatar_url as string | null) ?? null,
    });
  }
  return out;
}

/**
 * List messages newest-first, capped at MESSAGE_PAGE_SIZE. The caller flips
 * the array when rendering so older messages render at the top — this
 * avoids a server-side reverse and keeps cursor pagination simple
 * (next page is "rows older than the oldest createdAt we have").
 */
export async function listPlaybookMessagesAction(
  playbookId: string,
  opts?: { beforeCreatedAt?: string; limit?: number },
): Promise<
  ActionResult<{
    messages: PlaybookMessageRow[];
    hasMore: boolean;
    messagingEnabled: boolean;
  }>
> {
  if (!hasSupabaseEnv()) return notConfigured();
  const sb = await createClient();

  // messaging_enabled lives on playbooks; surfacing it here lets the UI
  // render the "messaging disabled" placeholder without a second round trip.
  const { data: book, error: bookErr } = await sb
    .from("playbooks")
    .select("messaging_enabled")
    .eq("id", playbookId)
    .maybeSingle();
  if (bookErr) return { ok: false, error: bookErr.message };
  if (!book) return { ok: false, error: "Playbook not found." };
  const messagingEnabled = (book.messaging_enabled as boolean | null) !== false;

  const limit = Math.min(Math.max(opts?.limit ?? MESSAGE_PAGE_SIZE, 1), 200);
  let query = sb
    .from("playbook_messages")
    .select("id, playbook_id, author_id, body, created_at, edited_at, deleted_at, deleted_by")
    .eq("playbook_id", playbookId)
    .order("created_at", { ascending: false })
    .limit(limit + 1);
  if (opts?.beforeCreatedAt) {
    query = query.lt("created_at", opts.beforeCreatedAt);
  }
  const { data, error } = await query;
  if (error) return { ok: false, error: error.message };

  const rows = (data ?? []) as RawRow[];
  const hasMore = rows.length > limit;
  const trimmed = hasMore ? rows.slice(0, limit) : rows;
  const authors = await hydrateAuthors(
    sb,
    trimmed.map((r) => r.author_id),
  );
  const messages = trimmed.map((r) => rowToMessage(r, authors)).reverse();
  return { ok: true, messages, hasMore, messagingEnabled };
}

export async function postPlaybookMessageAction(
  playbookId: string,
  body: string,
): Promise<ActionResult<{ message: PlaybookMessageRow }>> {
  if (!hasSupabaseEnv()) return notConfigured();
  const userId = await authedUserId();
  if (!userId) return { ok: false, error: "Not signed in." };

  const trimmed = body.trim();
  if (!trimmed) return { ok: false, error: "Message can't be empty." };
  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    return { ok: false, error: `Message is over ${MAX_MESSAGE_LENGTH} characters.` };
  }

  const sb = await createClient();
  const { data, error } = await sb
    .from("playbook_messages")
    .insert({
      playbook_id: playbookId,
      author_id: userId,
      body: trimmed,
    })
    .select("id, playbook_id, author_id, body, created_at, edited_at, deleted_at, deleted_by")
    .single();
  if (error || !data) {
    return {
      ok: false,
      error: error?.message ?? "Failed to post message.",
    };
  }
  const authors = await hydrateAuthors(sb, [(data as RawRow).author_id]);
  const row = data as RawRow;

  // Native push fan-out to the rest of the team — best-effort. Messages
  // otherwise rely on realtime + unread badges, which native users miss
  // when the app is backgrounded.
  void notifyTeamMessagePush({
    playbookId,
    authorId: userId,
    authorName: authors.get(userId)?.displayName ?? null,
    body: trimmed,
  });

  return { ok: true, message: rowToMessage(row, authors) };
}

/**
 * Push the new message to every active member except the author. Uses the
 * service-role client (push needs to read device_tokens across users).
 */
async function notifyTeamMessagePush(input: {
  playbookId: string;
  authorId: string;
  authorName: string | null;
  body: string;
}): Promise<void> {
  try {
    const admin = createServiceRoleClient();
    const { data: members } = await admin
      .from("playbook_members")
      .select("user_id")
      .eq("playbook_id", input.playbookId)
      .eq("status", "active");
    const recipientIds = (members ?? [])
      .map((m) => m.user_id as string | null)
      .filter((id): id is string => Boolean(id) && id !== input.authorId);
    if (recipientIds.length === 0) return;

    const { data: book } = await admin
      .from("playbooks")
      .select("name")
      .eq("id", input.playbookId)
      .maybeSingle();
    const playbookName = (book?.name as string | undefined) ?? "your team";
    const sender = input.authorName?.trim() || "A teammate";
    const preview =
      input.body.length > 140 ? `${input.body.slice(0, 139)}…` : input.body;

    await sendPushToUsers({
      admin,
      userIds: recipientIds,
      category: "team",
      message: {
        title: `${sender} · ${playbookName}`,
        body: preview,
        link: `/playbooks/${input.playbookId}?tab=messages`,
      },
    });
  } catch {
    // best-effort
  }
}

export async function editPlaybookMessageAction(
  messageId: string,
  body: string,
): Promise<ActionResult<{ message: PlaybookMessageRow }>> {
  if (!hasSupabaseEnv()) return notConfigured();
  const userId = await authedUserId();
  if (!userId) return { ok: false, error: "Not signed in." };

  const trimmed = body.trim();
  if (!trimmed) return { ok: false, error: "Message can't be empty." };
  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    return { ok: false, error: `Message is over ${MAX_MESSAGE_LENGTH} characters.` };
  }

  const sb = await createClient();
  const { data, error } = await sb
    .from("playbook_messages")
    .update({ body: trimmed, edited_at: new Date().toISOString() })
    .eq("id", messageId)
    .select("id, playbook_id, author_id, body, created_at, edited_at, deleted_at, deleted_by")
    .single();
  if (error || !data) {
    // RLS rejects edits outside the 15-min window or by non-authors. Surface
    // a friendly message rather than the Postgres error string.
    return {
      ok: false,
      error: "You can only edit your own message within 15 minutes of posting.",
    };
  }
  const authors = await hydrateAuthors(sb, [(data as RawRow).author_id]);
  return { ok: true, message: rowToMessage(data as RawRow, authors) };
}

export async function deletePlaybookMessageAction(
  messageId: string,
): Promise<ActionResult<{ message: PlaybookMessageRow }>> {
  if (!hasSupabaseEnv()) return notConfigured();
  const userId = await authedUserId();
  if (!userId) return { ok: false, error: "Not signed in." };

  const sb = await createClient();
  // Soft-delete: we keep the row and replace body with a tombstone marker.
  // `body` is a NOT-NULL column with a length check; the placeholder is
  // ignored by the UI (it reads `deleted_at` first), but it has to satisfy
  // the constraint for any client that fetches the row directly.
  const { data, error } = await sb
    .from("playbook_messages")
    .update({
      body: "[deleted]",
      deleted_at: new Date().toISOString(),
      deleted_by: userId,
    })
    .eq("id", messageId)
    .select("id, playbook_id, author_id, body, created_at, edited_at, deleted_at, deleted_by")
    .single();
  if (error || !data) {
    return {
      ok: false,
      error:
        "You can only delete your own message within 15 minutes, or any message if you're a coach.",
    };
  }
  const authors = await hydrateAuthors(sb, [(data as RawRow).author_id]);
  return { ok: true, message: rowToMessage(data as RawRow, authors) };
}

export async function setPlaybookMessagingEnabledAction(
  playbookId: string,
  enabled: boolean,
): Promise<ActionResult<{ messagingEnabled: boolean }>> {
  if (!hasSupabaseEnv()) return notConfigured();
  const userId = await authedUserId();
  if (!userId) return { ok: false, error: "Not signed in." };

  const sb = await createClient();
  // Owner check — we don't rely solely on the playbooks RLS update policy
  // because surfacing a clear error to a non-owner is friendlier than a
  // silent zero-row update.
  const { data: membership } = await sb
    .from("playbook_members")
    .select("role")
    .eq("playbook_id", playbookId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!membership || membership.role !== "owner") {
    return { ok: false, error: "Only the playbook owner can change this." };
  }

  const { error } = await sb
    .from("playbooks")
    .update({ messaging_enabled: enabled })
    .eq("id", playbookId);
  if (error) return { ok: false, error: error.message };
  return { ok: true, messagingEnabled: enabled };
}

/**
 * Stamp the viewer's `last_read_messages_at` to now() so the Messages tab
 * unread badge clears. Called when the user opens the Messages tab and on
 * each new realtime message that arrives while the tab is active.
 *
 * No-op (returns ok) for non-members — there's no row to update, but the
 * caller shouldn't error out either; just nothing to mark.
 */
export async function markPlaybookMessagesReadAction(
  playbookId: string,
): Promise<ActionResult<{ readAt: string }>> {
  if (!hasSupabaseEnv()) return notConfigured();
  const userId = await authedUserId();
  if (!userId) return { ok: false, error: "Not signed in." };
  const sb = await createClient();
  const readAt = new Date().toISOString();
  const { error } = await sb
    .from("playbook_members")
    .update({ last_read_messages_at: readAt })
    .eq("playbook_id", playbookId)
    .eq("user_id", userId);
  if (error) return { ok: false, error: error.message };
  return { ok: true, readAt };
}

/**
 * Count of unread, non-deleted messages in this playbook for the viewer.
 * Excludes the viewer's own messages — your own posts are never "unread"
 * to you. Returns 0 if the viewer isn't a member or hasn't loaded yet.
 *
 * Used to seed the bottom-nav unread badge on first paint. After mount,
 * the client tracks unread state in-memory based on realtime events +
 * tab-active state.
 */
export async function getPlaybookUnreadCountAction(
  playbookId: string,
): Promise<ActionResult<{ unread: number }>> {
  if (!hasSupabaseEnv()) return notConfigured();
  const userId = await authedUserId();
  if (!userId) return { ok: false, error: "Not signed in." };
  const sb = await createClient();
  const { data: membership } = await sb
    .from("playbook_members")
    .select("last_read_messages_at")
    .eq("playbook_id", playbookId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!membership) return { ok: true, unread: 0 };
  const lastReadAt =
    (membership.last_read_messages_at as string | null) ??
    "1970-01-01T00:00:00Z";
  const { count, error } = await sb
    .from("playbook_messages")
    .select("id", { count: "exact", head: true })
    .eq("playbook_id", playbookId)
    .neq("author_id", userId)
    .is("deleted_at", null)
    .gt("created_at", lastReadAt);
  if (error) return { ok: false, error: error.message };
  return { ok: true, unread: count ?? 0 };
}

/**
 * Count of non-deleted messages on a playbook the caller can read. Used by
 * the duplicate dialog to decide whether to surface the "Also copy message
 * history" checkbox — same pattern as getPlaybookKbCountAction.
 */
export async function getPlaybookMessagesCountAction(
  playbookId: string,
): Promise<ActionResult<{ count: number }>> {
  if (!hasSupabaseEnv()) return notConfigured();
  const sb = await createClient();
  const { count, error } = await sb
    .from("playbook_messages")
    .select("id", { count: "exact", head: true })
    .eq("playbook_id", playbookId)
    .is("deleted_at", null);
  if (error) return { ok: false, error: error.message };
  return { ok: true, count: count ?? 0 };
}

export async function clearAllPlaybookMessagesAction(
  playbookId: string,
): Promise<ActionResult<{ deleted: number }>> {
  if (!hasSupabaseEnv()) return notConfigured();
  const userId = await authedUserId();
  if (!userId) return { ok: false, error: "Not signed in." };

  const sb = await createClient();
  // The owner check is enforced both client-side here and inside the
  // SECURITY DEFINER function (`clear_playbook_messages`). The double check
  // means a misuse of the action by a non-owner returns a friendly error
  // before the RPC, and the RPC still rejects out-of-band callers (e.g.
  // someone hitting the function via REST without the action wrapper).
  const { data: membership } = await sb
    .from("playbook_members")
    .select("role")
    .eq("playbook_id", playbookId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!membership || membership.role !== "owner") {
    return { ok: false, error: "Only the playbook owner can clear messages." };
  }

  const { data, error } = await sb.rpc("clear_playbook_messages", { pb: playbookId });
  if (error) return { ok: false, error: error.message };
  return { ok: true, deleted: typeof data === "number" ? data : 0 };
}
