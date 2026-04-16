"use client";

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Segment<T extends string> = {
  value: T;
  label: string;
  icon?: LucideIcon;
};

type Props<T extends string> = {
  options: Segment<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: "sm" | "md";
  className?: string;
};

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = "md",
  className,
}: Props<T>) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-lg bg-surface-inset p-1",
        className,
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        const Icon = opt.icon;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md font-medium transition-all",
              size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm",
              active
                ? "bg-surface-raised text-foreground shadow-sm"
                : "text-muted hover:text-foreground",
            )}
          >
            {Icon && <Icon className={size === "sm" ? "size-3.5" : "size-4"} />}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
