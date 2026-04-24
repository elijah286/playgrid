"use client";

import type { GameKind } from "./live-session-types";

export function KindToggle({
  value,
  onChange,
  className,
}: {
  value: GameKind;
  onChange: (v: GameKind) => void;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Session type"
      className={
        "grid grid-cols-2 rounded-lg border border-border bg-surface p-1 " +
        (className ?? "")
      }
    >
      {(["game", "scrimmage"] as const).map((k) => {
        const active = value === k;
        return (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(k)}
            className={
              "inline-flex h-9 items-center justify-center rounded-md text-sm font-semibold transition-colors " +
              (active
                ? "bg-primary text-primary-foreground"
                : "text-muted hover:text-foreground")
            }
          >
            {k === "game" ? "Game" : "Scrimmage"}
          </button>
        );
      })}
    </div>
  );
}
