"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";

type Option = { value: string; label: string };

type SelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  className?: string;
};

export function Select({ value, onChange, options, placeholder = "Select...", className }: SelectProps) {
  const [open, setOpen] = useState(false);
  const [focusIdx, setFocusIdx] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = options.find((o) => o.value === value);

  const close = useCallback(() => {
    setOpen(false);
    setFocusIdx(-1);
  }, []);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        close();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open, close]);

  useEffect(() => {
    if (open && focusIdx >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll("[role='option']");
      (items[focusIdx] as HTMLElement)?.scrollIntoView({ block: "nearest" });
    }
  }, [focusIdx, open]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
        e.preventDefault();
        setOpen(true);
        setFocusIdx(Math.max(0, options.findIndex((o) => o.value === value)));
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setFocusIdx((i) => Math.min(options.length - 1, i + 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setFocusIdx((i) => Math.max(0, i - 1));
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        if (focusIdx >= 0 && focusIdx < options.length) {
          onChange(options[focusIdx].value);
          close();
        }
        break;
      case "Escape":
        e.preventDefault();
        close();
        break;
    }
  }

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => {
          setOpen((o) => !o);
          if (!open) setFocusIdx(Math.max(0, options.findIndex((o) => o.value === value)));
        }}
        onKeyDown={handleKeyDown}
        className={cn(
          "flex h-9 w-full items-center justify-between rounded-lg border bg-surface-raised px-3 text-sm transition-colors",
          "focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none",
          open ? "border-primary ring-1 ring-primary" : "border-border hover:border-muted-light",
        )}
      >
        <span className={selected ? "text-foreground" : "text-muted-light"}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown className={cn("size-4 text-muted transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <ul
          ref={listRef}
          role="listbox"
          className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-border bg-surface-raised py-1 shadow-elevated"
        >
          {options.map((opt, i) => (
            <li
              key={opt.value}
              role="option"
              aria-selected={opt.value === value}
              className={cn(
                "flex cursor-pointer items-center gap-2 px-3 py-2 text-sm transition-colors",
                focusIdx === i && "bg-primary-light",
                opt.value === value ? "text-primary font-medium" : "text-foreground",
              )}
              onMouseEnter={() => setFocusIdx(i)}
              onClick={() => {
                onChange(opt.value);
                close();
              }}
            >
              <Check
                className={cn(
                  "size-3.5 shrink-0",
                  opt.value === value ? "opacity-100" : "opacity-0",
                )}
              />
              {opt.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
