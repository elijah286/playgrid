"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  BookOpen,
  ChevronDown,
  CreditCard,
  GraduationCap,
  HelpCircle,
  Layers,
  LogOut,
  Shield,
  Sparkles,
} from "lucide-react";
import { signOutAction } from "@/app/actions/auth";
import type { ShellUser } from "@/features/preview-shell/types";

function initialsFor(user: ShellUser): string {
  const src = user.displayName?.trim() || user.email;
  const parts = src.split(/[\s@._-]+/).filter(Boolean);
  return parts.slice(0, 2).map((p) => p[0]!.toUpperCase()).join("") || "?";
}

type LinkItem = { href: string; label: string; Icon: React.ElementType };

/**
 * The shell's account + "everything else" menu — the destinations that don't
 * live in the primary team nav (Learning Center, Football Library, tutorials,
 * examples, FAQ, Site Admin, account, sign out). One menu, reused by the mobile
 * header avatar and the desktop sidebar account block, so nothing production
 * offers is unreachable from the shell.
 */
export function ShellAccountMenu({
  user,
  footballLibraryAvailable,
  variant = "avatar",
  openUp = false,
}: {
  user: ShellUser;
  footballLibraryAvailable: boolean;
  /** "avatar" = round avatar button (mobile header). "full" = avatar + name row (desktop sidebar). */
  variant?: "avatar" | "full";
  /** Open the menu upward (desktop sidebar sits at the bottom). */
  openUp?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const learn: LinkItem[] = [
    ...(footballLibraryAvailable
      ? [{ href: "/learn/library", label: "Football library", Icon: BookOpen }]
      : []),
    { href: "/learn/using-xo", label: "App tutorials", Icon: GraduationCap },
    { href: "/examples", label: "Examples", Icon: Layers },
    { href: "/faq", label: "FAQ", Icon: HelpCircle },
  ];

  const avatar = (
    <span className="relative grid size-8 shrink-0 place-items-center overflow-hidden rounded-full bg-primary text-xs font-bold text-white ring-1 ring-border">
      {user.avatarUrl ? (
        <Image src={user.avatarUrl} alt="" fill sizes="32px" className="object-cover" unoptimized />
      ) : (
        initialsFor(user)
      )}
    </span>
  );

  return (
    <div ref={wrapRef} className="relative">
      {variant === "avatar" ? (
        <button
          type="button"
          aria-label="Account & more"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="grid size-11 place-items-center rounded-full outline-none ring-primary focus-visible:ring-2"
        >
          {avatar}
        </button>
      ) : (
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center gap-2.5 rounded-xl border border-border bg-surface-raised px-2.5 py-2 text-left transition-colors hover:bg-surface-inset"
        >
          {avatar}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-bold text-foreground">
              {user.displayName || user.email}
            </span>
            <span className="block truncate text-[11px] text-muted">Account &amp; more</span>
          </span>
          <ChevronDown className="size-4 shrink-0 text-muted" aria-hidden />
        </button>
      )}

      {open && (
        <div
          role="menu"
          className={`absolute z-50 max-h-[calc(100dvh-5rem)] overflow-y-auto rounded-2xl border border-border bg-surface-raised shadow-elevated ${
            openUp ? "bottom-full mb-2" : "top-full mt-2"
          } ${variant === "avatar" ? "w-64 right-0" : "left-0 right-0"}`}
        >
          <div className="border-b border-border px-4 py-3">
            {user.displayName && (
              <p className="truncate text-sm font-semibold text-foreground">{user.displayName}</p>
            )}
            <p className="truncate text-xs text-muted">{user.email}</p>
          </div>

          <div className="py-1">
            <MenuLink href="/coach-cal/chat" label="Coach Cal" Icon={Sparkles} onNav={() => setOpen(false)} />
            <MenuLink href="/account" label="Account" Icon={CreditCard} onNav={() => setOpen(false)} />
            <MenuLink href="/learn" label="Learning Center" Icon={GraduationCap} onNav={() => setOpen(false)} />
          </div>

          <div className="border-t border-border py-1">
            {learn.map((it) => (
              <MenuLink key={it.href} href={it.href} label={it.label} Icon={it.Icon} onNav={() => setOpen(false)} />
            ))}
          </div>

          {user.isAdmin && (
            <div className="border-t border-border py-1">
              <MenuLink href="/settings" label="Site Admin" Icon={Shield} onNav={() => setOpen(false)} />
            </div>
          )}

          <form action={signOutAction} className="border-t border-border">
            <button
              type="submit"
              role="menuitem"
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-foreground transition-colors hover:bg-surface-inset"
            >
              <LogOut className="size-4 text-muted" />
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function MenuLink({
  href,
  label,
  Icon,
  onNav,
}: {
  href: string;
  label: string;
  Icon: React.ElementType;
  onNav: () => void;
}) {
  return (
    <Link
      href={href}
      role="menuitem"
      onClick={onNav}
      className="flex items-center gap-2.5 px-4 py-2 text-sm text-foreground transition-colors hover:bg-surface-inset"
    >
      <Icon className="size-4 text-muted" aria-hidden />
      {label}
    </Link>
  );
}
