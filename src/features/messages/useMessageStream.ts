"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient as createBrowserSupabase } from "@/lib/supabase/client";
import {
  deletePlaybookMessageAction,
  editPlaybookMessageAction,
  listPlaybookMessagesAction,
  postPlaybookMessageAction,
} from "@/app/actions/playbook-messages";
import type {
  PlaybookMessageAuthor,
  PlaybookMessageRow,
} from "@/domain/messages/types";

/** Typing presence retention. Older than this and we drop the indicator. */
const TYPING_TTL_MS = 4_000;

export type ViewerProfile = PlaybookMessageAuthor;

export type StreamMessage = PlaybookMessageRow & {
  /** True while the optimistic insert is in flight. Used by the bubble to
   *  render the "Sending…" timestamp + faint opacity. */
  pending?: boolean;
};

type RawDbRow = {
  id: string;
  playbook_id: string;
  author_id: string;
  body: string;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
};

type TypingEntry = { userId: string; displayName: string; lastPing: number };

export type UseMessageStream = {
  messages: StreamMessage[];
  typingNames: string[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  messagingEnabled: boolean;
  error: string | null;
  send: (body: string) => Promise<void>;
  edit: (id: string, body: string) => Promise<{ ok: boolean; error?: string }>;
  remove: (id: string) => Promise<{ ok: boolean; error?: string }>;
  loadOlder: () => Promise<void>;
  pingTyping: () => void;
};

/**
 * Single hook that owns the chat state for one playbook stream:
 *   - initial fetch + cursor-based "load older"
 *   - realtime postgres_changes subscription (insert + soft-delete updates)
 *   - typing presence via the same Realtime channel's broadcast
 *   - optimistic send with id-matching dedupe against the realtime echo
 *
 * The subscription tears down on playbookId change so navigating between
 * playbooks doesn't accidentally cross-pollinate streams.
 */
export function useMessageStream({
  playbookId,
  viewer,
  initial,
}: {
  playbookId: string;
  viewer: ViewerProfile;
  initial?: { messages: StreamMessage[]; hasMore: boolean; messagingEnabled: boolean };
}): UseMessageStream {
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const [messages, setMessages] = useState<StreamMessage[]>(
    initial?.messages ?? [],
  );
  const [hasMore, setHasMore] = useState<boolean>(initial?.hasMore ?? false);
  const [messagingEnabled, setMessagingEnabled] = useState<boolean>(
    initial?.messagingEnabled ?? true,
  );
  const [loading, setLoading] = useState(!initial);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typing, setTyping] = useState<Map<string, TypingEntry>>(new Map());

  // Stable refs so the channel callbacks don't churn on every state update.
  const messagesRef = useRef<StreamMessage[]>(messages);
  messagesRef.current = messages;
  const typingRef = useRef(typing);
  typingRef.current = typing;
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const upsertMessage = useCallback((row: RawDbRow) => {
    setMessages((prev) => {
      const existingIdx = prev.findIndex((m) => m.id === row.id);

      // Already in the list — update body/edited/deleted in place, keep the
      // author we already hydrated.
      if (existingIdx >= 0) {
        const next = prev.slice();
        next[existingIdx] = {
          ...next[existingIdx],
          body: row.body,
          editedAt: row.edited_at,
          deletedAt: row.deleted_at,
          deletedBy: row.deleted_by,
          pending: false,
        };
        return next;
      }

      // Dedupe: when our own optimistic row arrives back via realtime,
      // replace the temp by author + body match. CRITICAL: preserve the
      // temp's `author` field (the local viewer profile) — realtime
      // payloads don't include author display_name/avatar, and dropping
      // it makes the bubble fall back to a "Member" label.
      const tempIdx = prev.findIndex(
        (m) =>
          m.id.startsWith("temp-") &&
          m.authorId === row.author_id &&
          m.body === row.body,
      );
      if (tempIdx >= 0) {
        const next = prev.slice();
        next[tempIdx] = {
          id: row.id,
          playbookId: row.playbook_id,
          authorId: row.author_id,
          body: row.body,
          createdAt: row.created_at,
          editedAt: row.edited_at,
          deletedAt: row.deleted_at,
          deletedBy: row.deleted_by,
          author: prev[tempIdx].author,
          pending: false,
        };
        return next;
      }

      // New message from someone else. Author starts null; the lazy
      // hydrator effect below batch-fetches missing profiles so the
      // bubble shows the right name on the next tick.
      const inserted: StreamMessage = {
        id: row.id,
        playbookId: row.playbook_id,
        authorId: row.author_id,
        body: row.body,
        createdAt: row.created_at,
        editedAt: row.edited_at,
        deletedAt: row.deleted_at,
        deletedBy: row.deleted_by,
        author: null,
        pending: false,
      };
      // Insert sorted by createdAt ascending. Most realtime events arrive
      // at the tail, so the quick last-element check usually wins.
      if (
        prev.length === 0 ||
        new Date(prev[prev.length - 1].createdAt).getTime() <=
          new Date(row.created_at).getTime()
      ) {
        return [...prev, inserted];
      }
      const insertAt = prev.findIndex(
        (m) =>
          new Date(m.createdAt).getTime() > new Date(row.created_at).getTime(),
      );
      if (insertAt === -1) return [...prev, inserted];
      return [...prev.slice(0, insertAt), inserted, ...prev.slice(insertAt)];
    });
  }, []);

  // ── Initial load ────────────────────────────────────────────────────────
  // Always fetch fresh on mount, even if `initial` is provided. The `initial`
  // prop is a server-rendered snapshot from page load; once the user posts
  // and tabs away, that snapshot is stale by the time they tab back. The
  // tab unmounts on switch (conditional render in ui.tsx), so component
  // state doesn't survive — without a refetch, posted messages would
  // appear to vanish. We skip the loading spinner when initial is present
  // so the refetch is a quiet refresh, not a UI flicker.
  useEffect(() => {
    let cancelled = false;
    if (!initial) setLoading(true);
    listPlaybookMessagesAction(playbookId).then((res) => {
      if (cancelled) return;
      if (!res.ok) {
        setError(res.error);
        setLoading(false);
        return;
      }
      // Merge — preserve any client-only optimistic temps that haven't
      // been ack'd yet (rare: only if the user posted ~ms before remount
      // and the action hasn't resolved). The server response is the
      // canonical truth for everything else.
      setMessages((prev) => {
        const pendingTemps = prev.filter((m) => m.id.startsWith("temp-"));
        const fresh = res.messages.map((m) => ({ ...m }));
        if (pendingTemps.length === 0) return fresh;
        // Drop temps whose body is already in the fresh server list (the
        // action committed during the refetch race).
        const freshBodies = new Set(
          fresh.map((m) => `${m.authorId}:${m.body}`),
        );
        const stillPending = pendingTemps.filter(
          (t) => !freshBodies.has(`${t.authorId}:${t.body}`),
        );
        return [...fresh, ...stillPending];
      });
      setHasMore(res.hasMore);
      setMessagingEnabled(res.messagingEnabled);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [playbookId, initial]);

  // ── Realtime channel ────────────────────────────────────────────────────
  useEffect(() => {
    const ch = supabase
      .channel(`playbook-messages:${playbookId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "playbook_messages",
          filter: `playbook_id=eq.${playbookId}`,
        },
        (payload) => {
          upsertMessage(payload.new as RawDbRow);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "playbook_messages",
          filter: `playbook_id=eq.${playbookId}`,
        },
        (payload) => {
          upsertMessage(payload.new as RawDbRow);
        },
      )
      .on("broadcast", { event: "typing" }, (msg) => {
        const payload = msg.payload as
          | { userId?: string; displayName?: string }
          | undefined;
        if (!payload?.userId || payload.userId === viewer.id) return;
        const userId = payload.userId;
        const displayName = payload.displayName ?? "Someone";
        setTyping((prev) => {
          const next = new Map(prev);
          next.set(userId, { userId, displayName, lastPing: Date.now() });
          return next;
        });
      })
      .subscribe();
    channelRef.current = ch;

    return () => {
      void supabase.removeChannel(ch);
      channelRef.current = null;
    };
  }, [playbookId, supabase, upsertMessage, viewer.id]);

  // ── Lazy author hydration ──────────────────────────────────────────────
  // Realtime payloads only carry the row, not the author's profile. When a
  // message arrives from another member, the bubble would render "Member"
  // until a refetch. This effect watches for messages with null `author`
  // and batch-fetches the missing profiles, attaching them to the rows.
  // Tracked-IDs ref prevents the effect from re-fetching the same profile
  // on every messages-state update.
  const fetchedAuthorIdsRef = useRef<Set<string>>(new Set([viewer.id]));
  useEffect(() => {
    const missingIds = new Set<string>();
    for (const m of messages) {
      if (!m.author && m.authorId && !fetchedAuthorIdsRef.current.has(m.authorId)) {
        missingIds.add(m.authorId);
      }
    }
    if (missingIds.size === 0) return;
    for (const id of missingIds) fetchedAuthorIdsRef.current.add(id);
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .in("id", Array.from(missingIds));
      if (cancelled || !data || data.length === 0) return;
      const fetched = new Map<string, PlaybookMessageAuthor>();
      for (const p of data) {
        fetched.set(p.id as string, {
          id: p.id as string,
          displayName: (p.display_name as string | null) ?? null,
          avatarUrl: (p.avatar_url as string | null) ?? null,
        });
      }
      setMessages((prev) =>
        prev.map((m) => {
          if (m.author) return m;
          const author = fetched.get(m.authorId);
          if (!author) return m;
          return { ...m, author };
        }),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [messages, supabase, viewer.id]);

  // ── Typing TTL sweeper ─────────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      setTyping((prev) => {
        let dirty = false;
        const next = new Map(prev);
        for (const [k, v] of next) {
          if (now - v.lastPing > TYPING_TTL_MS) {
            next.delete(k);
            dirty = true;
          }
        }
        return dirty ? next : prev;
      });
    }, 1_000);
    return () => clearInterval(id);
  }, []);

  // ── Public actions ─────────────────────────────────────────────────────
  const send = useCallback(
    async (body: string) => {
      const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const optimistic: StreamMessage = {
        id: tempId,
        playbookId,
        authorId: viewer.id,
        body,
        createdAt: new Date().toISOString(),
        editedAt: null,
        deletedAt: null,
        deletedBy: null,
        author: viewer,
        pending: true,
      };
      setMessages((prev) => [...prev, optimistic]);

      const res = await postPlaybookMessageAction(playbookId, body);
      if (!res.ok) {
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        setError(res.error);
        return;
      }

      // Replace the temp with the real row. If realtime already raced ahead
      // and inserted the real row, the temp is still in our state — we
      // strip it here and trust upsertMessage already added the real one.
      setMessages((prev) => {
        const realAlreadyThere = prev.some((m) => m.id === res.message.id);
        if (realAlreadyThere) {
          return prev.filter((m) => m.id !== tempId);
        }
        return prev.map((m) =>
          m.id === tempId
            ? { ...res.message, author: viewer, pending: false }
            : m,
        );
      });
    },
    [playbookId, viewer],
  );

  const edit = useCallback(
    async (id: string, body: string) => {
      const res = await editPlaybookMessageAction(id, body);
      if (!res.ok) return { ok: false, error: res.error };
      setMessages((prev) =>
        prev.map((m) =>
          m.id === id
            ? { ...res.message, author: m.author ?? res.message.author }
            : m,
        ),
      );
      return { ok: true };
    },
    [],
  );

  const remove = useCallback(async (id: string) => {
    const res = await deletePlaybookMessageAction(id);
    if (!res.ok) return { ok: false, error: res.error };
    setMessages((prev) =>
      prev.map((m) =>
        m.id === id
          ? { ...res.message, author: m.author ?? res.message.author }
          : m,
      ),
    );
    return { ok: true };
  }, []);

  const loadOlder = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    const oldest = messagesRef.current[0];
    if (!oldest) return;
    setLoadingMore(true);
    const res = await listPlaybookMessagesAction(playbookId, {
      beforeCreatedAt: oldest.createdAt,
    });
    setLoadingMore(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setMessages((prev) => [...res.messages.map((m) => ({ ...m })), ...prev]);
    setHasMore(res.hasMore);
  }, [hasMore, loadingMore, playbookId]);

  const pingTyping = useCallback(() => {
    const ch = channelRef.current;
    if (!ch) return;
    void ch.send({
      type: "broadcast",
      event: "typing",
      payload: {
        userId: viewer.id,
        displayName: viewer.displayName ?? "Member",
      },
    });
  }, [viewer.displayName, viewer.id]);

  const typingNames = useMemo(() => {
    const arr: string[] = [];
    for (const v of typing.values()) arr.push(v.displayName);
    return arr;
  }, [typing]);

  return {
    messages,
    typingNames,
    loading,
    loadingMore,
    hasMore,
    messagingEnabled,
    error,
    send,
    edit,
    remove,
    loadOlder,
    pingTyping,
  };
}
