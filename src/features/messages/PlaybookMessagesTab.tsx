"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, MessageSquareOff, MoreHorizontal, ShieldCheck, Trash2 } from "lucide-react";
import {
  clearAllPlaybookMessagesAction,
  setPlaybookMessagingEnabledAction,
} from "@/app/actions/playbook-messages";
import { authorWindowRemaining, MessageBubble } from "./MessageBubble";
import { MessageInput } from "./MessageInput";
import { TypingIndicator } from "./TypingIndicator";
import {
  formatDayLabel,
  isSameDay,
  shouldGroupWith,
} from "./format";
import {
  useMessageStream,
  type StreamMessage,
  type ViewerProfile,
} from "./useMessageStream";

export type PlaybookMessagesTabProps = {
  playbookId: string;
  playbookName: string;
  viewer: ViewerProfile;
  /** owner = full controls, editor = moderation only, viewer = post + delete-own. */
  viewerRole: "owner" | "editor" | "viewer";
  /** Initial server-side state — avoids the loading flash on first paint. */
  initial: {
    messages: StreamMessage[];
    hasMore: boolean;
    messagingEnabled: boolean;
  };
  /**
   * `"fixed"` (default) = the production playbook-page behavior: on mobile the
   * chat pins itself with `position: fixed` to offsets tuned for the production
   * header/banner/bottom-nav, and locks document scroll. `"inline"` = fill the
   * parent container instead (no fixed positioning, no body-scroll lock) — used
   * by the new shell, whose chrome heights differ, so the chat lives inside the
   * shell's own scroll frame. Default preserves production exactly.
   */
  layout?: "fixed" | "inline";
};

export function PlaybookMessagesTab({
  playbookId,
  playbookName,
  viewer,
  viewerRole,
  initial,
  layout = "fixed",
}: PlaybookMessagesTabProps) {
  const inline = layout === "inline";
  const stream = useMessageStream({ playbookId, viewer, initial });
  const isOwner = viewerRole === "owner";
  const canModerate = viewerRole === "owner" || viewerRole === "editor";

  // Auto-scroll: only nudge to bottom when the viewer is already near it,
  // so reading older messages doesn't get yanked back when others type.
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [pinnedToBottom, setPinnedToBottom] = useState(true);
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const onScroll = () => {
      const fromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      setPinnedToBottom(fromBottom < 80);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const lastMessageId = stream.messages[stream.messages.length - 1]?.id ?? null;
  useEffect(() => {
    if (!pinnedToBottom) return;
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [lastMessageId, pinnedToBottom, stream.typingNames.length]);

  // First paint: jump to bottom unconditionally so the most recent messages
  // are visible without a tween.
  const didInitialScroll = useRef(false);
  useEffect(() => {
    if (didInitialScroll.current) return;
    if (stream.loading) return;
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    didInitialScroll.current = true;
  }, [stream.loading]);

  // Lock the document scroll on mobile so only the message list scrolls.
  // Without this, banners stacking above the chat push its bottom — and
  // the input — below the viewport, and a scroll gesture on the messages
  // chains out to the page. The body-scroll lock + fixed positioning
  // below keeps the input glued to the viewport bottom.
  useEffect(() => {
    if (typeof window === "undefined") return;
    // Inline layout lives inside its host's own scroll frame (the new shell),
    // so it must NOT lock the document or fix-position itself — that's only the
    // production playbook page's behavior.
    if (inline) return;
    const apply = () => {
      const isMobile = window.matchMedia("(max-width: 639px)").matches;
      if (isMobile) {
        document.documentElement.classList.add("messages-mobile-lock");
      } else {
        document.documentElement.classList.remove("messages-mobile-lock");
      }
    };
    apply();
    const mq = window.matchMedia("(max-width: 639px)");
    mq.addEventListener("change", apply);
    return () => {
      mq.removeEventListener("change", apply);
      document.documentElement.classList.remove("messages-mobile-lock");
    };
  }, [inline]);

  return (
    <div
      // Mobile: `messages-mobile-fixed` (defined in globals.css under
      // the @media (max-width: 639px) block) anchors the chat below
      // the sticky banner and above the bottom nav. `messages-mobile-lock`
      // on <html> (set by the effect above) clamps the document to
      // viewport height so the page can't scroll out from under it.
      //
      // Desktop: normal flow with a calc'd height (340px subtracted from
      // 100dvh covers site-header + top-tabs + chrome) capped at 760px
      // so very tall screens don't get an absurdly long chat. The
      // mobile class becomes a no-op on `sm:` and up.
      className={
        inline
          ? // Fill the host card (the shell sets its height); no fixed
            // positioning, no mobile-lock — the shell owns the scroll frame.
            // Pad the bottom by the safe-area inset (iMessage/ChatGPT
            // convention) so the composer clears the home indicator + curved
            // corners; the surface-raised bg fills that strip. env() is 0 on
            // desktop / non-notched devices, so it's a no-op there.
            "flex h-full flex-col overflow-hidden bg-surface-raised pb-[env(safe-area-inset-bottom,0px)]"
          : "messages-mobile-fixed flex flex-col overflow-hidden bg-surface-base sm:h-[calc(100dvh-340px)] sm:max-h-[760px] sm:rounded-2xl sm:border sm:border-border"
      }
    >
      <Header
        playbookName={playbookName}
        messagingEnabled={stream.messagingEnabled}
        isOwner={isOwner}
        canModerate={canModerate}
        onToggle={async () => {
          const next = !stream.messagingEnabled;
          const res = await setPlaybookMessagingEnabledAction(playbookId, next);
          if (!res.ok) {
            alert(res.error);
            return;
          }
          // Reload so every connected client picks up the new state. A
          // future enhancement would broadcast a Realtime event so the
          // toggle surfaces instantly without a refresh — for now reload
          // is simple and correct.
          location.reload();
        }}
        onClearAll={async () => {
          if (
            !confirm(
              "Permanently delete every message in this playbook? This can't be undone.",
            )
          ) {
            return;
          }
          const res = await clearAllPlaybookMessagesAction(playbookId);
          if (!res.ok) {
            alert(res.error);
            return;
          }
          location.reload();
        }}
      />

      <div
        ref={scrollerRef}
        className="flex-1 overflow-y-auto overscroll-contain"
        aria-live="polite"
        aria-relevant="additions"
      >
        {stream.loading ? (
          <div className="flex h-full items-center justify-center text-muted">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : stream.messages.length === 0 ? (
          <EmptyState messagingEnabled={stream.messagingEnabled} />
        ) : (
          <div className="pb-2 pt-1">
            {stream.hasMore && (
              <div className="flex justify-center pb-2 pt-3">
                <button
                  type="button"
                  onClick={() => void stream.loadOlder()}
                  disabled={stream.loadingMore}
                  className="rounded-full border border-border bg-surface-raised px-3 py-1 text-xs font-medium text-foreground hover:bg-surface-inset disabled:opacity-50"
                >
                  {stream.loadingMore ? "Loading…" : "Load older messages"}
                </button>
              </div>
            )}
            <MessageList stream={stream} viewer={viewer} canModerate={canModerate} />
          </div>
        )}
      </div>

      <TypingIndicator names={stream.typingNames} />

      <MessageInput
        enabled={stream.messagingEnabled}
        onSend={async (body) => {
          await stream.send(body);
        }}
        onTypingPing={stream.pingTyping}
      />

      {stream.error && (
        <div
          role="alert"
          className="border-t border-rose-200 bg-rose-50 px-4 py-2 text-xs text-rose-900"
        >
          {stream.error}
        </div>
      )}
    </div>
  );
}

function MessageList({
  stream,
  viewer,
  canModerate,
}: {
  stream: ReturnType<typeof useMessageStream>;
  viewer: ViewerProfile;
  canModerate: boolean;
}) {
  // Re-tick once a minute so the per-bubble "withinAuthorWindow" prop drops
  // back to false at the right moment without the bubble owning a timer.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const items = useMemo(() => {
    const out: Array<
      | { kind: "day"; iso: string; key: string }
      | {
          kind: "msg";
          message: StreamMessage;
          grouped: boolean;
          key: string;
        }
    > = [];
    let prev: StreamMessage | null = null;
    for (const m of stream.messages) {
      if (!prev || !isSameDay(prev.createdAt, m.createdAt)) {
        out.push({ kind: "day", iso: m.createdAt, key: `day-${m.createdAt}` });
      }
      out.push({
        kind: "msg",
        message: m,
        grouped: shouldGroupWith(prev, m),
        key: m.id,
      });
      prev = m;
    }
    return out;
  }, [stream.messages]);

  return (
    <div>
      {items.map((it) =>
        it.kind === "day" ? (
          <DaySeparator key={it.key} iso={it.iso} />
        ) : (
          <MessageBubble
            key={it.key}
            message={it.message}
            grouped={it.grouped}
            viewerId={viewer.id}
            viewerCanModerate={canModerate}
            pending={it.message.pending}
            withinAuthorWindow={authorWindowRemaining(it.message.createdAt) > 0}
            onEdit={stream.edit}
            onDelete={stream.remove}
          />
        ),
      )}
    </div>
  );
}

function DaySeparator({ iso }: { iso: string }) {
  return (
    <div className="my-2 flex items-center gap-3 px-4">
      <span className="h-px flex-1 bg-border" />
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
        {formatDayLabel(iso)}
      </span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

function EmptyState({ messagingEnabled }: { messagingEnabled: boolean }) {
  if (!messagingEnabled) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-16 text-center text-muted">
        <MessageSquareOff className="size-8" />
        <p className="text-base font-semibold text-foreground">
          Messaging is disabled
        </p>
        <p className="max-w-sm text-sm leading-relaxed">
          The playbook owner has turned messaging off. They can re-enable it
          from the menu above.
        </p>
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-16 text-center text-muted">
      <p className="text-base font-semibold text-foreground">
        No messages yet
      </p>
      <p className="max-w-sm text-sm leading-relaxed">
        Start a conversation with your team. Use it for practice updates,
        equipment, last-minute schedule changes — anything the team needs.
      </p>
    </div>
  );
}

function Header({
  playbookName,
  messagingEnabled,
  isOwner,
  canModerate,
  onToggle,
  onClearAll,
}: {
  playbookName: string;
  messagingEnabled: boolean;
  isOwner: boolean;
  canModerate: boolean;
  onToggle: () => Promise<void>;
  onClearAll: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="flex items-center justify-between border-b border-border bg-surface-base px-4 py-3">
      <div className="min-w-0">
        <h2 className="truncate text-base font-bold tracking-tight">
          {playbookName} — Team chat
        </h2>
        <p className="truncate text-xs text-muted">
          {messagingEnabled
            ? "Coaches, players, and parents in this playbook can post."
            : "Messaging is currently disabled for this playbook."}
          {canModerate && (
            <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
              <ShieldCheck className="size-3" />
              Moderator
            </span>
          )}
        </p>
      </div>
      {isOwner && (
        <div ref={ref} className="relative">
          <button
            type="button"
            aria-label="Owner controls"
            onClick={() => setOpen((v) => !v)}
            className="flex size-8 items-center justify-center rounded-full border border-border bg-surface-raised text-muted hover:text-foreground"
          >
            <MoreHorizontal className="size-4" />
          </button>
          {open && (
            <div
              role="menu"
              className="absolute right-0 top-10 z-10 w-56 overflow-hidden rounded-lg border border-border bg-surface-raised text-sm shadow-lg"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  void onToggle();
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-foreground hover:bg-surface-inset"
              >
                <MessageSquareOff className="size-4" />
                {messagingEnabled ? "Disable messaging" : "Enable messaging"}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  void onClearAll();
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-rose-600 hover:bg-rose-50"
              >
                <Trash2 className="size-4" />
                Clear all messages…
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
