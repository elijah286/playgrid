"use client";

import { useEffect, useRef, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import {
  AUTHOR_EDIT_WINDOW_MS,
  MAX_MESSAGE_LENGTH,
  type PlaybookMessageRow,
} from "@/domain/messages/types";
import { MessageAvatar } from "./Avatar";
import { MessageMarkdown } from "./MessageMarkdown";
import { formatAbsoluteTime, formatRelativeTime } from "./format";

export type MessageBubbleProps = {
  message: PlaybookMessageRow;
  /** True when the immediately preceding bubble is from the same author within
   *  5 minutes. Hides the avatar+name header for a continuation feel. */
  grouped: boolean;
  /** Local viewer's user id, for self-bubble alignment + edit/delete UI. */
  viewerId: string;
  /** Coaches can soft-delete any message at any time. */
  viewerCanModerate: boolean;
  /** Optimistic flag — true while the action is in flight. Renders a faint
   *  bubble + a small clock so the sender knows the message is still going. */
  pending?: boolean;
  /** True when the row is the author's, the window hasn't lapsed, and it's
   *  not already deleted. The hook computes this so the bubble re-renders
   *  the action menu disappearance precisely on tick. */
  withinAuthorWindow: boolean;
  onEdit: (id: string, body: string) => Promise<{ ok: boolean; error?: string }>;
  onDelete: (id: string) => Promise<{ ok: boolean; error?: string }>;
};

export function MessageBubble({
  message,
  grouped,
  viewerId,
  viewerCanModerate,
  pending,
  withinAuthorWindow,
  onEdit,
  onDelete,
}: MessageBubbleProps) {
  const isSelf = message.authorId === viewerId;
  const isDeleted = !!message.deletedAt;
  const authorName = message.author?.displayName ?? "Member";

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.body);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canEdit = !isDeleted && isSelf && withinAuthorWindow;
  const canDelete = !isDeleted && (canEdit || viewerCanModerate);

  // Re-tick relative timestamp once a minute so "1m ago" → "2m ago" without
  // a full re-render of the parent stream.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (isDeleted) return;
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, [isDeleted]);

  const submit = async () => {
    const trimmed = draft.trim();
    if (!trimmed) {
      setError("Message can't be empty.");
      return;
    }
    if (trimmed === message.body) {
      setEditing(false);
      return;
    }
    setBusy(true);
    setError(null);
    const res = await onEdit(message.id, trimmed);
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "Couldn't save the edit.");
      return;
    }
    setEditing(false);
  };

  const animationClass = isSelf ? "msg-in" : "team-msg-in-other";

  return (
    <div
      className={`flex gap-3 px-4 ${grouped ? "pt-0.5" : "pt-3"} ${
        isSelf ? "flex-row-reverse" : "flex-row"
      }`}
    >
      <div className={`w-9 shrink-0 ${grouped ? "invisible" : ""}`}>
        {message.author && (
          <MessageAvatar
            userId={message.authorId}
            displayName={message.author.displayName}
            avatarUrl={message.author.avatarUrl}
            size={36}
          />
        )}
      </div>

      <div
        className={`flex min-w-0 max-w-[78ch] flex-col ${
          isSelf ? "items-end" : "items-start"
        }`}
      >
        {!grouped && (
          <div
            className={`mb-1 flex items-center gap-2 text-xs ${
              isSelf ? "flex-row-reverse" : "flex-row"
            }`}
          >
            <span className="font-semibold text-foreground">{authorName}</span>
          </div>
        )}

        {isDeleted ? (
          <div
            className={`rounded-2xl border border-dashed border-border bg-surface-raised px-3 py-2 text-xs italic text-muted`}
          >
            This message has been deleted
          </div>
        ) : editing ? (
          <div className="w-full max-w-[60ch]">
            <textarea
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  void submit();
                } else if (e.key === "Escape") {
                  setEditing(false);
                  setDraft(message.body);
                  setError(null);
                }
              }}
              maxLength={MAX_MESSAGE_LENGTH}
              rows={Math.min(8, Math.max(2, draft.split("\n").length))}
              className="w-full resize-none rounded-2xl border border-border bg-surface-raised px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
            />
            {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
            <div className="mt-1 flex items-center justify-end gap-2 text-xs">
              <button
                type="button"
                className="text-muted hover:text-foreground"
                onClick={() => {
                  setEditing(false);
                  setDraft(message.body);
                  setError(null);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy || draft.trim().length === 0}
                className="rounded-full bg-primary px-3 py-1 font-semibold text-white disabled:opacity-50"
                onClick={() => void submit()}
              >
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
            <p className="mt-1 text-[11px] text-muted">
              ⌘/Ctrl + Enter to save · Esc to cancel
            </p>
          </div>
        ) : (
          <div
            className={`group relative ${animationClass} rounded-2xl px-3 py-2 ${
              isSelf
                ? "rounded-br-sm bg-primary/10 text-foreground"
                : "rounded-bl-sm bg-surface-raised text-foreground"
            } ${pending ? "opacity-60" : ""}`}
          >
            <MessageMarkdown body={message.body} />
            {(canEdit || canDelete) && !pending && (
              <BubbleMenu
                isSelf={isSelf}
                onEdit={canEdit ? () => setEditing(true) : null}
                onDelete={
                  canDelete
                    ? () => {
                        if (!confirm("Delete this message? Others will see a 'deleted' marker.")) return;
                        void onDelete(message.id);
                      }
                    : null
                }
              />
            )}
          </div>
        )}

        <Timestamp
          message={message}
          isSelf={isSelf}
          pending={pending}
          isDeleted={isDeleted}
        />
      </div>
    </div>
  );
}

function Timestamp({
  message,
  isSelf,
  pending,
  isDeleted,
}: {
  message: PlaybookMessageRow;
  isSelf: boolean;
  pending?: boolean;
  isDeleted: boolean;
}) {
  if (isDeleted) return null;
  const rel = pending ? "Sending…" : formatRelativeTime(message.createdAt);
  const abs = formatAbsoluteTime(message.createdAt);
  return (
    <div
      className={`mt-1 flex items-center gap-1 text-[11px] text-muted ${
        isSelf ? "flex-row-reverse" : "flex-row"
      }`}
    >
      <time title={abs} dateTime={message.createdAt}>
        {rel}
      </time>
      {message.editedAt && !pending && (
        <span title={`Edited ${formatAbsoluteTime(message.editedAt)}`}>
          · edited
        </span>
      )}
    </div>
  );
}

function BubbleMenu({
  isSelf,
  onEdit,
  onDelete,
}: {
  isSelf: boolean;
  onEdit: (() => void) | null;
  onDelete: (() => void) | null;
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
    <div
      ref={ref}
      className={`absolute -top-3 ${
        isSelf ? "-left-2" : "-right-2"
      } opacity-0 transition-opacity group-hover:opacity-100`}
    >
      <button
        type="button"
        aria-label="Message actions"
        onClick={() => setOpen((v) => !v)}
        className="flex size-7 items-center justify-center rounded-full border border-border bg-surface-raised text-muted shadow-sm hover:text-foreground"
      >
        <MoreDotsIcon />
      </button>
      {open && (
        <div
          role="menu"
          className={`absolute z-10 mt-1 w-36 overflow-hidden rounded-lg border border-border bg-surface-raised text-sm shadow-lg ${
            isSelf ? "left-0" : "right-0"
          }`}
        >
          {onEdit && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onEdit();
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-foreground hover:bg-surface-inset"
            >
              <Pencil className="size-3.5" />
              Edit
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onDelete();
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-rose-600 hover:bg-rose-50"
            >
              <Trash2 className="size-3.5" />
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function MoreDotsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="5" cy="12" r="1.6" fill="currentColor" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" />
      <circle cx="19" cy="12" r="1.6" fill="currentColor" />
    </svg>
  );
}

/** Helper: how long the author still has to edit/delete after posting. */
export function authorWindowRemaining(createdAt: string, now = Date.now()): number {
  const t = new Date(createdAt).getTime();
  return Math.max(0, AUTHOR_EDIT_WINDOW_MS - (now - t));
}
