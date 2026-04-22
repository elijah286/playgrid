"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type Props = {
  value: number | string;
  className?: string;
};

function formatBadge(raw: string): string {
  return raw.length < 2 ? raw.padStart(2, "0") : raw;
}

export function PlayNumberBadge({ value, className }: Props) {
  return (
    <span
      className={cn(
        "inline-flex h-[22px] min-w-[28px] items-center justify-center rounded-[4px] bg-primary px-1.5 font-mono text-[12px] font-bold leading-none tracking-wider tabular-nums text-white shadow-sm",
        className,
      )}
    >
      {formatBadge(String(value))}
    </span>
  );
}

type EditableProps = {
  value: number;
  max: number;
  onChange: (next: number) => void;
  className?: string;
  disabled?: boolean;
};

/**
 * Double-click the badge to renumber. Commits on Enter or blur; Escape
 * cancels. `onChange` is responsible for performing the swap against the
 * rest of the playbook — this component only collects the target number.
 */
export function EditablePlayNumberBadge({
  value,
  max,
  onChange,
  className,
  disabled,
}: EditableProps) {
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState(String(value));
  const committedRef = useRef(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!editing) setInput(String(value));
  }, [value, editing]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  function commit() {
    if (committedRef.current) return;
    committedRef.current = true;
    const n = parseInt(input, 10);
    setEditing(false);
    if (Number.isFinite(n) && n >= 1 && n !== value) {
      onChange(Math.min(Math.max(1, n), max));
    }
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="number"
        min={1}
        max={max}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onMouseDown={(e) => e.stopPropagation()}
        onBlur={commit}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            committedRef.current = true;
            setInput(String(value));
            setEditing(false);
          }
        }}
        className={cn(
          "h-[22px] w-14 rounded-[4px] bg-primary px-1.5 text-center font-mono text-[12px] font-bold leading-none tracking-wider tabular-nums text-white outline-none ring-2 ring-primary/60 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
          className,
        )}
        aria-label="Renumber play"
      />
    );
  }

  return (
    <span
      role={disabled ? undefined : "button"}
      tabIndex={disabled ? -1 : 0}
      title={disabled ? undefined : "Double-click to renumber"}
      className={cn(
        "inline-flex h-[22px] min-w-[28px] items-center justify-center rounded-[4px] bg-primary px-1.5 font-mono text-[12px] font-bold leading-none tracking-wider tabular-nums text-white shadow-sm",
        !disabled && "cursor-text",
        className,
      )}
      onDoubleClick={(e) => {
        if (disabled) return;
        e.preventDefault();
        e.stopPropagation();
        committedRef.current = false;
        setInput(String(value));
        setEditing(true);
      }}
    >
      {formatBadge(String(value))}
    </span>
  );
}
