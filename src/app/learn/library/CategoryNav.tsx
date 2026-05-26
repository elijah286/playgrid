"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

// Tab-style category nav for the four Football Library index pages.
// Lives above the variant pill on Plays / Formations / Defenses / Routes
// index pages so coaches can jump sideways between catalog types without
// going back to /learn/library first.
//
// Preserves the variant query param so a coach browsing 7v7 plays who
// clicks "Formations" lands on 7v7 formations, not the default. Routes
// is variant-agnostic — clicking it drops the `?v=` because the routes
// catalog is shared across variants.

const CATEGORIES = [
  { label: "Plays", href: "/learn/library/plays", keepVariant: true },
  { label: "Formations", href: "/learn/library/formations", keepVariant: true },
  { label: "Defenses", href: "/learn/library/defense", keepVariant: true },
  { label: "Routes", href: "/learn/library/routes", keepVariant: false },
] as const;

export function CategoryNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const v = searchParams.get("v");

  return (
    <nav
      aria-label="Football Library categories"
      className="mb-4 inline-flex flex-wrap gap-1 rounded-xl border border-border bg-surface-inset p-1"
    >
      {CATEGORIES.map((c) => {
        const active = pathname === c.href || pathname.startsWith(`${c.href}/`);
        const href = c.keepVariant && v ? `${c.href}?v=${v}` : c.href;
        const className = `whitespace-nowrap rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors ${
          active
            ? "bg-surface-raised text-foreground shadow-sm font-semibold"
            : "text-muted hover:text-foreground"
        }`;
        if (active) {
          return (
            <span key={c.href} className={className} aria-current="page">
              {c.label}
            </span>
          );
        }
        return (
          <Link key={c.href} href={href} className={className}>
            {c.label}
          </Link>
        );
      })}
    </nav>
  );
}
