"use client";

import { forwardRef } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip } from "./Tooltip";

const variants = {
  default:
    "text-muted hover:text-foreground hover:bg-surface-inset active:bg-border-light ring-1 ring-border",
  active:
    "bg-primary text-white shadow-sm hover:bg-primary-hover",
  ghost:
    "text-muted hover:text-foreground hover:bg-surface-inset active:bg-border-light",
} as const;

type IconButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: LucideIcon;
  variant?: keyof typeof variants;
  size?: "sm" | "md";
  tooltip?: string;
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon: Icon, variant = "default", size = "md", tooltip, className, ...props },
  ref,
) {
  const btn = (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center rounded-lg transition-colors disabled:opacity-40",
        variants[variant],
        size === "sm" ? "size-8" : "size-9",
        className,
      )}
      {...props}
    >
      <Icon className={size === "sm" ? "size-3.5" : "size-4"} />
    </button>
  );

  if (tooltip) {
    return <Tooltip content={tooltip}>{btn}</Tooltip>;
  }

  return btn;
});
