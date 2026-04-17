"use client";

import { forwardRef } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  leftIcon?: LucideIcon;
  error?: boolean;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { leftIcon: LeftIcon, error, className, ...props },
  ref,
) {
  return (
    <div className="relative">
      {LeftIcon && (
        <LeftIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-light" />
      )}
      <input
        ref={ref}
        className={cn(
          "h-9 w-full rounded-lg border bg-surface-raised px-3 text-sm text-foreground placeholder:text-muted-light transition-colors",
          "focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none",
          LeftIcon && "pl-9",
          error
            ? "border-danger ring-1 ring-danger"
            : "border-border hover:border-muted-light",
          className,
        )}
        {...props}
      />
    </div>
  );
});
