"use client";

import { forwardRef } from "react";
import type { LucideIcon } from "lucide-react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const variants = {
  primary:
    "bg-primary text-white shadow-sm hover:bg-primary-hover active:bg-primary-dark disabled:opacity-50",
  secondary:
    "bg-surface-raised text-foreground ring-1 ring-border shadow-sm hover:bg-surface-inset active:bg-border-light disabled:opacity-50",
  ghost:
    "text-muted hover:text-foreground hover:bg-surface-inset active:bg-border-light disabled:opacity-50",
  danger:
    "bg-danger text-white shadow-sm hover:bg-red-700 active:bg-red-800 disabled:opacity-50",
} as const;

const sizes = {
  sm: "h-8 px-3 text-xs gap-1.5",
  md: "h-9 px-4 text-sm gap-2",
  lg: "h-11 px-6 text-base gap-2.5",
} as const;

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  leftIcon?: LucideIcon;
  rightIcon?: LucideIcon;
  loading?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "secondary",
    size = "md",
    leftIcon: LeftIcon,
    rightIcon: RightIcon,
    loading,
    disabled,
    className,
    children,
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center rounded-lg font-medium transition-colors",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {loading ? (
        <Loader2 className="size-4 animate-spin" />
      ) : LeftIcon ? (
        <LeftIcon className="size-4" />
      ) : null}
      {children}
      {RightIcon && !loading && <RightIcon className="size-4" />}
    </button>
  );
});
