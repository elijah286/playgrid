"use client";

import { useState } from "react";
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

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Silently fail
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
      <AssistantMessage text={text} />
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
