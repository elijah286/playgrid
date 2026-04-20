"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { MessageCirclePlus, Sparkles, X } from "lucide-react";
import { submitFeedbackAction } from "@/app/actions/feedback";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

export function FeedbackWidget() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const { toast } = useToast();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (open) textareaRef.current?.focus();
  }, [open]);

  function submit() {
    const text = message.trim();
    if (!text) return;
    startTransition(async () => {
      const res = await submitFeedbackAction(text);
      if (!res.ok) {
        toast(res.error, "error");
        return;
      }
      toast("Thanks! Your feedback was sent.", "success");
      setMessage("");
      setOpen(false);
    });
  }

  return (
    <div className="fixed bottom-4 right-4 z-40 print:hidden">
      {open ? (
        <div className="w-[22rem] max-w-[calc(100vw-2rem)] rounded-2xl border border-border bg-surface-raised shadow-toast">
          <div className="flex items-start gap-3 border-b border-border px-4 py-3">
            <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-foreground">
                Help shape PlayGrid
              </p>
              <p className="mt-0.5 text-xs text-muted">
                This site is brand new — we&apos;d love your ideas, bug reports,
                or anything confusing.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="shrink-0 text-muted hover:text-foreground"
              aria-label="Close feedback"
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="px-4 py-3">
            <textarea
              ref={textareaRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit();
              }}
              placeholder="What could be better? Any bugs or missing features?"
              rows={4}
              maxLength={4000}
              className="block w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="text-xs text-muted">⌘↵ to send</span>
              <Button
                variant="primary"
                size="sm"
                loading={pending}
                disabled={!message.trim()}
                onClick={submit}
              >
                Send feedback
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn(
            "group flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-white shadow-lg",
            "hover:bg-primary-hover active:bg-primary-dark",
            "ring-4 ring-primary/20",
          )}
        >
          <MessageCirclePlus className="size-4" />
          <span>Send feedback</span>
          <span className="hidden rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide sm:inline">
            New site
          </span>
        </button>
      )}
    </div>
  );
}
