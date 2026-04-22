"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { GripVertical, MessageCirclePlus, Sparkles, X } from "lucide-react";
import { submitFeedbackAction } from "@/app/actions/feedback";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "playgrid:feedback-widget-pos";
const MARGIN = 16;
const FOOTER_CLEARANCE = 96;

type Pos = { x: number; y: number };

function clampToViewport(pos: Pos, size: { w: number; h: number }): Pos {
  if (typeof window === "undefined") return pos;
  const maxX = Math.max(MARGIN, window.innerWidth - size.w - MARGIN);
  const maxY = Math.max(MARGIN, window.innerHeight - size.h - MARGIN);
  return {
    x: Math.min(Math.max(MARGIN, pos.x), maxX),
    y: Math.min(Math.max(MARGIN, pos.y), maxY),
  };
}

function defaultPosition(size: { w: number; h: number }): Pos {
  if (typeof window === "undefined") return { x: 0, y: 0 };
  return {
    x: window.innerWidth - size.w - MARGIN,
    y: window.innerHeight - size.h - FOOTER_CLEARANCE,
  };
}

export function FeedbackWidget({ hasCreatedPlay: _ }: { hasCreatedPlay: boolean }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const { toast } = useToast();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const [pos, setPos] = useState<Pos | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragOffset = useRef<{ dx: number; dy: number } | null>(null);
  const didDragRef = useRef(false);

  useLayoutEffect(() => {
    if (!rootRef.current) return;
    const rect = rootRef.current.getBoundingClientRect();
    const size = { w: rect.width, h: rect.height };

    let saved: Pos | null = null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed?.x === "number" && typeof parsed?.y === "number") {
          saved = parsed;
        }
      }
    } catch {
      /* ignore */
    }
    setPos(clampToViewport(saved ?? defaultPosition(size), size));
  }, []);

  useEffect(() => {
    function onResize() {
      if (!rootRef.current) return;
      const rect = rootRef.current.getBoundingClientRect();
      setPos((p) => (p ? clampToViewport(p, { w: rect.width, h: rect.height }) : p));
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (open) textareaRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!dragging) return;
    function onMove(e: PointerEvent) {
      if (!dragOffset.current || !rootRef.current) return;
      didDragRef.current = true;
      const rect = rootRef.current.getBoundingClientRect();
      const next = clampToViewport(
        { x: e.clientX - dragOffset.current.dx, y: e.clientY - dragOffset.current.dy },
        { w: rect.width, h: rect.height },
      );
      setPos(next);
    }
    function onUp() {
      setDragging(false);
      dragOffset.current = null;
      setPos((p) => {
        if (p) {
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
          } catch {
            /* ignore */
          }
        }
        return p;
      });
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [dragging]);

  const startDrag = useCallback((e: React.PointerEvent) => {
    if (!rootRef.current) return;
    const rect = rootRef.current.getBoundingClientRect();
    dragOffset.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
    didDragRef.current = false;
    setDragging(true);
  }, []);

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

  const style: React.CSSProperties = pos
    ? { left: pos.x, top: pos.y, right: "auto", bottom: "auto" }
    : { visibility: "hidden" };

  return (
    <div
      ref={rootRef}
      style={style}
      className={cn(
        "fixed z-40 print:hidden select-none",
        "hidden sm:block",
        dragging && "cursor-grabbing",
      )}
    >
      {open ? (
        <div className="w-[22rem] max-w-[calc(100vw-2rem)] rounded-2xl border border-border bg-surface-raised shadow-toast">
          <div
            onPointerDown={startDrag}
            className={cn(
              "flex items-start gap-2 border-b border-border px-3 py-3",
              dragging ? "cursor-grabbing" : "cursor-grab",
            )}
          >
            <GripVertical className="mt-0.5 size-4 shrink-0 text-muted" />
            <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-foreground">
                Help shape PlayGrid
              </p>
              <p className="mt-0.5 text-xs text-muted">
                This site is brand new — we&apos;d love your ideas, bug reports,
                or anything confusing. Feel free to tell us what you like, too.
              </p>
            </div>
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
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
              placeholder="What could be better? What do you like? Any bugs?"
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
          onPointerDown={startDrag}
          onClick={() => {
            if (didDragRef.current) return;
            setOpen(true);
          }}
          className={cn(
            "group flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-white shadow-lg",
            "hover:bg-primary-hover active:bg-primary-dark",
            "ring-4 ring-primary/20",
            dragging ? "cursor-grabbing" : "cursor-grab",
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
