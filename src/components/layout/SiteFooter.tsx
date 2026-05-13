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
          <Link href="/tour" className="hover:text-foreground transition-colors">
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
          <a
            href="https://www.facebook.com/profile.php?id=61589257046303"
            target="_blank"
            rel="noopener noreferrer me"
            aria-label="XO Gridmaker on Facebook"
            className="inline-flex items-center text-muted hover:text-foreground transition-colors"
          >
            <svg
              aria-hidden="true"
              focusable="false"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5.02 3.66 9.18 8.44 9.94v-7.03H7.9v-2.91h2.54V9.85c0-2.52 1.49-3.91 3.78-3.91 1.09 0 2.24.2 2.24.2v2.47h-1.26c-1.24 0-1.63.78-1.63 1.57v1.88h2.78l-.44 2.91h-2.34V22c4.78-.76 8.43-4.92 8.43-9.94Z" />
            </svg>
          </a>
        </nav>
      </div>
    </footer>
  );
}
