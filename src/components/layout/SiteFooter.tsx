import Link from "next/link";

export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-border bg-surface-raised/40 text-xs text-muted">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-6 py-4 sm:flex-row">
        <p>
          © {year} PlayGrid LLC · Cedar Park, TX
        </p>
        <nav className="flex items-center gap-4">
          <Link href="/about" className="hover:text-foreground transition-colors">
            About
          </Link>
          <Link href="/contact" className="hover:text-foreground transition-colors">
            Contact
          </Link>
          <Link href="/terms" className="hover:text-foreground transition-colors">
            Terms
          </Link>
          <Link href="/privacy" className="hover:text-foreground transition-colors">
            Privacy
          </Link>
        </nav>
      </div>
    </footer>
  );
}
