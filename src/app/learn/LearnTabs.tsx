"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/learn/using-xo", label: "Using XO Gridmaker" },
  { href: "/learn/library", label: "Football Library" },
] as const;

export function LearnTabs() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 border-b border-border" aria-label="Learning Center sections">
      {TABS.map((t) => {
        const active = pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`-mb-px px-4 py-2.5 text-sm font-medium transition-colors ${
              active
                ? "border-b-2 border-primary text-foreground font-semibold"
                : "border-b-2 border-transparent text-muted hover:text-foreground"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
