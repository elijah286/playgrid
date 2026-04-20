"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { CreditCard, LogOut, Shield } from "lucide-react";
import { signOutAction } from "@/app/actions/auth";
import { cn } from "@/lib/utils";

type Props = {
  email: string;
  displayName: string | null;
  avatarUrl?: string | null;
  isAdmin: boolean;
  compact?: boolean;
};

function initialsFor(email: string, displayName: string | null): string {
  const source = displayName?.trim() || email;
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((p) => p[0]!.toUpperCase());
  return letters.join("") || "?";
}

export function UserMenu({ email, displayName, avatarUrl, isAdmin, compact }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const initials = initialsFor(email, displayName);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const size = compact ? "size-7 text-[11px]" : "size-9 text-xs";

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "relative inline-flex items-center justify-center overflow-hidden rounded-full bg-primary font-bold text-white shadow-sm transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          size,
        )}
      >
        {avatarUrl ? (
          <Image
            src={avatarUrl}
            alt=""
            fill
            sizes={compact ? "28px" : "36px"}
            className="object-cover"
            unoptimized
          />
        ) : (
          initials
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-40 mt-2 w-64 overflow-hidden rounded-xl border border-border bg-surface-raised shadow-elevated"
        >
          <div className="border-b border-border px-4 py-3">
            {displayName && (
              <p className="truncate text-sm font-semibold text-foreground">{displayName}</p>
            )}
            <p className="truncate text-xs text-muted">{email}</p>
          </div>

          <div className="py-1">
            <Link
              href="/account"
              onClick={() => setOpen(false)}
              role="menuitem"
              className="flex items-center gap-2 px-4 py-2 text-sm text-foreground transition-colors hover:bg-surface-inset"
            >
              <CreditCard className="size-4" />
              Account
            </Link>
            {isAdmin && (
              <Link
                href="/settings"
                onClick={() => setOpen(false)}
                role="menuitem"
                className="flex items-center gap-2 px-4 py-2 text-sm text-foreground transition-colors hover:bg-surface-inset"
              >
                <Shield className="size-4" />
                Site Admin
              </Link>
            )}
          </div>

          <form action={signOutAction} className="border-t border-border">
            <button
              type="submit"
              role="menuitem"
              className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-foreground transition-colors hover:bg-surface-inset"
            >
              <LogOut className="size-4" />
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
