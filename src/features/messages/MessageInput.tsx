"use client";

import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { MAX_MESSAGE_LENGTH } from "@/domain/messages/types";

export type MessageInputProps = {
  disabled?: boolean;
  /** When false (because owner toggled messaging off), the input renders a
   *  read-only placeholder explaining the state instead of accepting input. */
  enabled: boolean;
  onSend: (body: string) => Promise<void>;
  onTypingPing: () => void;
  /** Emitted when the user clears the input — lets the hook clear our own
   *  typing presence locally if we wanted to (currently a no-op TTL handles it). */
  placeholder?: string;
};

const TYPING_PING_INTERVAL_MS = 2_500;

export function MessageInput({
  disabled,
  enabled,
  onSend,
  onTypingPing,
  placeholder,
}: MessageInputProps) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const lastPingRef = useRef(0);

  // Auto-grow textarea up to ~6 lines, then scroll inside.
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    const next = Math.min(ta.scrollHeight, 200);
    ta.style.height = `${next}px`;
  }, [body]);

  const submit = async () => {
    const trimmed = body.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setBody("");
    // Reset textarea height after clearing — the auto-grow effect runs on the
    // next paint so we'd flash a tall empty box otherwise.
    if (taRef.current) taRef.current.style.height = "auto";
    try {
      await onSend(trimmed);
    } finally {
      setBusy(false);
      taRef.current?.focus();
    }
  };

  if (!enabled) {
    return (
      <div className="border-t border-border bg-surface-inset px-4 py-3 text-center text-sm text-muted">
        Messaging is turned off for this playbook.
      </div>
    );
  }

  return (
    <div className="border-t border-border bg-surface-base px-3 py-2">
      <div className="flex items-end gap-2">
        <textarea
          ref={taRef}
          value={body}
          rows={1}
          maxLength={MAX_MESSAGE_LENGTH}
          disabled={disabled || busy}
          placeholder={placeholder ?? "Message the team…"}
          aria-label="Message the team"
          onChange={(e) => {
            setBody(e.target.value);
            const now = Date.now();
            if (now - lastPingRef.current > TYPING_PING_INTERVAL_MS) {
              lastPingRef.current = now;
              onTypingPing();
            }
          }}
          onKeyDown={(e) => {
            // Enter sends; Shift+Enter inserts newline. Matches Slack/Discord.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
          className="min-h-9 w-full resize-none rounded-2xl border border-border bg-surface-raised px-3 py-2 text-base text-foreground placeholder:text-muted focus:border-primary focus:outline-none disabled:opacity-60"
        />
        <button
          type="button"
          aria-label="Send"
          disabled={disabled || busy || body.trim().length === 0}
          onClick={() => void submit()}
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-white shadow-sm transition-transform hover:bg-primary/90 active:scale-95 disabled:opacity-50"
        >
          <Send className="size-4" />
        </button>
      </div>
      {body.length > MAX_MESSAGE_LENGTH * 0.9 && (
        <div className="mt-1 flex justify-end px-1 text-[11px] text-muted">
          <span>
            {body.length}/{MAX_MESSAGE_LENGTH}
          </span>
        </div>
      )}
    </div>
  );
}
