import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Signed out",
  description: "You've been signed out of XO Gridmaker.",
  robots: { index: false, follow: false },
};

// Sign-out confirmation page. Standalone and auth-free so it can't fall
// into the form-action revalidation trap: when signOutAction runs from
// inside the dashboard, Next.js re-renders the originating route before
// applying the redirect. If that route requires auth, it throws and the
// user lands on error.tsx instead of a stable signed-out state. Landing
// them here sidesteps that race — this page fetches nothing.
export default function SignedOutPage() {
  return (
    <div className="mx-auto max-w-lg px-6 py-16 text-center">
      <h1 className="text-xl font-semibold text-foreground">
        You&rsquo;re signed out.
      </h1>
      <p className="mt-2 text-sm text-muted">See you again soon.</p>
      <div className="mt-5 flex justify-center gap-2">
        <Link
          href="/login"
          className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-hover"
        >
          Sign back in
        </Link>
        <Link
          href="/"
          className="inline-flex h-9 items-center justify-center rounded-lg bg-surface-raised px-4 text-sm font-medium text-foreground ring-1 ring-border shadow-sm transition-colors hover:bg-surface-inset"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}
