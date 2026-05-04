import Link from "next/link";

export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer data-site-footer className="relative z-10 mt-auto border-t border-border bg-surface-inset text-xs text-muted print:hidden">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-6 py-5 sm:flex-row">
        <p className="font-medium">
          © {year} XO Gridmaker · Cedar Park, TX
        </p>
        <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
          <Link href="/#tour" className="hover:text-foreground transition-colors">
            Tour
          </Link>
          <Link href="/coach-cal" className="hover:text-foreground transition-colors">
            Coach Cal
          </Link>
          <Link href="/examples" className="hover:text-foreground transition-colors">
            Examples
          </Link>
          <Link href="/pricing" className="hover:text-foreground transition-colors">
            Pricing
          </Link>
          <Link href="/about" className="hover:text-foreground transition-colors">
            About
          </Link>
          <Link href="/contact" className="hover:text-foreground transition-colors">
            Contact
          </Link>
          <Link href="/faq" className="hover:text-foreground transition-colors">
            FAQ
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
