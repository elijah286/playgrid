"use client";

import { useRef, useState } from "react";
import { Copy, ThumbsUp, ThumbsDown } from "lucide-react";
import { AssistantMessage } from "./AssistantMessage";

export function AssistantMessageWithFeedback({
  text,
  onThumbsUp,
  onThumbsDown,
}: {
  text: string;
  onThumbsUp: () => void;
  onThumbsDown: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [thumbsUp, setThumbsUp] = useState(false);
  const [thumbsDown, setThumbsDown] = useState(false);
  const contentRef = useRef<HTMLDivElement | null>(null);

  // Copy both rich HTML (for Google Docs, Notion, email, rich-text editors)
  // and the original markdown source (for plain-text or markdown-aware
  // targets like Reddit, Slack). The OS clipboard hands each app the
  // flavor it prefers, so the same Copy click works everywhere.
  const handleCopy = async () => {
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
          "text/plain": new Blob([text], { type: "text/plain" }),
        });
        await navigator.clipboard.write([item]);
      } else {
        await navigator.clipboard.writeText(text);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // Silently fail
      }
    }
  };

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
        <button
          type="button"
          onClick={handleCopy}
          title={copied ? "Copied!" : "Copy to clipboard"}
          className="inline-flex items-center rounded p-1 text-muted transition-colors hover:bg-surface hover:text-foreground"
        >
          <Copy className="size-4" />
        </button>
      </div>
    </div>
  );
}
