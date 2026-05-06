"use client";

/**
 * Three-dot typing indicator. Pure CSS animation — no Framer/dep, just a
 * keyframe per dot with a staggered delay. Honors `prefers-reduced-motion`
 * via the keyframe override in globals.css (msg-typing-bounce → static).
 */
export function TypingIndicator({ names }: { names: string[] }) {
  if (names.length === 0) return null;
  const label = labelFor(names);
  return (
    <div className="flex items-center gap-2 px-4 py-2 text-xs text-muted">
      <span className="flex h-4 items-end gap-0.5" aria-hidden>
        <span className="msg-typing-dot" style={{ animationDelay: "0ms" }} />
        <span className="msg-typing-dot" style={{ animationDelay: "120ms" }} />
        <span className="msg-typing-dot" style={{ animationDelay: "240ms" }} />
      </span>
      <span className="truncate">{label}</span>
    </div>
  );
}

function labelFor(names: string[]): string {
  if (names.length === 1) return `${names[0]} is typing…`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
  return `${names[0]}, ${names[1]} and ${names.length - 2} more are typing…`;
}
