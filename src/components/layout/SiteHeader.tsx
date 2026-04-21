"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ColorModeToggle } from "@/components/theme/ColorModeToggle";

export function SiteHeader() {
  const pathname = usePathname();

  const isPublicPage = ["/about", "/terms", "/privacy", "/contact"].includes(
    pathname
  );

  // Don't show header on authenticated pages
  if (!isPublicPage && pathname !== "/") {
    return null;
  }

  return (
    <header className="border-b border-border/40 bg-surface">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2 text-xl font-bold">
          PlayGrid
        </Link>
        <nav className="flex items-center gap-8">
          <Link
            href="/about"
            className="text-sm text-muted hover:text-foreground transition-colors"
          >
            About
          </Link>
          <Link
            href="/contact"
            className="text-sm text-muted hover:text-foreground transition-colors"
          >
            Contact
          </Link>
          <Link
            href="/terms"
            className="text-sm text-muted hover:text-foreground transition-colors"
          >
            Terms
          </Link>
          <Link
            href="/privacy"
            className="text-sm text-muted hover:text-foreground transition-colors"
          >
            Privacy
          </Link>
          <ColorModeToggle />
        </nav>
      </div>
    </header>
  );
}
