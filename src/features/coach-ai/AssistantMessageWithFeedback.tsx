"use client";

import { useEffect, useRef, useState } from "react";
import { Braces, Copy, Flag, ThumbsUp, ThumbsDown } from "lucide-react";
import { AssistantMessage } from "./AssistantMessage";
import { rewritePlayFencesForCopy } from "@/lib/coach-ai/copy-rewrite";
import { ReportDialog } from "@/components/moderation/ReportDialog";

const LONG_PRESS_MS = 500;

export function AssistantMessageWithFeedback({
  text,
  canDebugCal = false,
  onThumbsUp,
  onThumbsDown,
}: {
  text: string;
  /** Site admin, or a non-admin account a site admin granted Cal debug tools to. */
  canDebugCal?: boolean;
  onThumbsUp: () => void;
  onThumbsDown: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [thumbsUp, setThumbsUp] = useState(false);
  const [thumbsDown, setThumbsDown] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Set when the long-press / right-click branch fires the menu, so the
  // bubble-phase click on the same press doesn't *also* trigger a copy.
  const longPressFiredRef = useRef(false);
  const copyBtnRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const cancelLongPress = () => {
    if (longPressTimerRef.current !== null) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  // Default copy. text/html keeps the rendered diagram for rich-text
  // targets (Docs, Notion). text/plain swaps ```play JSON for coach
  // prose so Facebook / plain-text composers paste something useful.
  const copyAsText = async () => {
    const plain = rewritePlayFencesForCopy(text);
    try {
      const html = contentRef.current?.innerHTML ?? "";
      const ClipboardItemCtor =
        typeof window !== "undefined"
          ? (window as unknown as { ClipboardItem?: typeof ClipboardItem }).ClipboardItem
          : undefined;
      if (
        html &&
        ClipboardItemCtor &&
        typeof navigator.clipboard.write === "function"
      ) {
        const item = new ClipboardItemCtor({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([plain], { type: "text/plain" }),
        });
        await navigator.clipboard.write([item]);
      } else {
        await navigator.clipboard.writeText(plain);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      try {
        await navigator.clipboard.writeText(plain);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // Silently fail
      }
    }
  };

  // Admin debug path — raw markdown including ```play JSON. Useful for
  // pasting into a Claude session to diagnose a Cal misbehavior.
  const copyAsJson = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Silently fail
    }
  };

  const openMenu = () => {
    longPressFiredRef.current = true;
    setMenuOpen(true);
  };

  const handleClick = () => {
    if (longPressFiredRef.current) {
      longPressFiredRef.current = false;
      return;
    }
    void copyAsText();
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!canDebugCal) return;
    if (e.button !== 0) return; // right-click takes the onContextMenu path
    cancelLongPress();
    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null;
      openMenu();
    }, LONG_PRESS_MS);
  };
  const handlePointerEnd = () => {
    cancelLongPress();
  };
  const handleContextMenu = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!canDebugCal) return;
    e.preventDefault();
    openMenu();
  };

  useEffect(() => {
    if (!menuOpen) return;
    const onDocDown = (e: MouseEvent) => {
      const tgt = e.target as Node | null;
      if (!tgt) return;
      if (menuRef.current?.contains(tgt)) return;
      if (copyBtnRef.current?.contains(tgt)) return;
      setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onDocDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDocDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const handleThumbsUp = () => {
    if (thumbsDown) {
      setThumbsDown(false);
    }
    setThumbsUp(!thumbsUp);
    if (!thumbsUp) {
      onThumbsUp();
    }
  };

  const handleThumbsDown = () => {
    if (thumbsUp) {
      setThumbsUp(false);
    }
    setThumbsDown(!thumbsDown);
    if (!thumbsDown) {
      onThumbsDown();
    }
  };

  return (
    <div className="space-y-2">
      <div ref={contentRef}>
        <AssistantMessage text={text} />
      </div>
      <div className="flex items-center gap-1.5 pt-1">
        <button
          type="button"
          onClick={handleThumbsUp}
          title="Helpful"
          className={`inline-flex items-center rounded p-1 text-muted transition-colors hover:bg-surface hover:text-foreground ${
            thumbsUp ? "text-primary" : ""
          }`}
        >
          <ThumbsUp className="size-4" />
        </button>
        <button
          type="button"
          onClick={handleThumbsDown}
          title="Not helpful"
          className={`inline-flex items-center rounded p-1 text-muted transition-colors hover:bg-surface hover:text-foreground ${
            thumbsDown ? "text-red-600 dark:text-red-400" : ""
          }`}
        >
          <ThumbsDown className="size-4" />
        </button>
        <div className="h-1 w-1 rounded-full bg-border" />
        <div className="relative">
          <button
            ref={copyBtnRef}
            type="button"
            onClick={handleClick}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerEnd}
            onPointerLeave={handlePointerEnd}
            onPointerCancel={handlePointerEnd}
            onContextMenu={handleContextMenu}
            title={
              copied
                ? "Copied!"
                : canDebugCal
                ? "Copy to clipboard (hold for options)"
                : "Copy to clipboard"
            }
            className="inline-flex items-center rounded p-1 text-muted transition-colors hover:bg-surface hover:text-foreground"
          >
            <Copy className="size-4" />
          </button>
          {menuOpen && (
            <div
              ref={menuRef}
              role="menu"
              className="absolute left-0 top-full z-50 mt-1 min-w-[150px] overflow-hidden rounded-md border border-border bg-surface-raised text-foreground shadow-lg ring-1 ring-black/5"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  void copyAsText();
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-surface-inset"
              >
                <Copy className="size-3.5" />
                Copy text
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  void copyAsJson();
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-surface-inset"
              >
                <Braces className="size-3.5" />
                Copy JSON
              </button>
            </div>
          )}
        </div>
        <div className="h-1 w-1 rounded-full bg-border" />
        <button
          type="button"
          onClick={() => setReportOpen(true)}
          title="Report this response"
          className="inline-flex items-center rounded p-1 text-muted transition-colors hover:bg-surface hover:text-foreground"
        >
          <Flag className="size-4" />
        </button>
      </div>
      <ReportDialog
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        contentType="cal_response"
        reportedText={text}
        label="Report this response"
      />
    </div>
  );
}
