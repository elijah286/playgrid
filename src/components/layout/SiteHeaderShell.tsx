"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserMenu } from "@/components/layout/UserMenu";

type Props = {
  user: { id: string; email: string | null } | null;
  isAdmin: boolean;
  displayName: string | null;
  avatarUrl: string | null;
};

// Routes where the playbook banner takes over the top of the screen on
// mobile — hide the global header there so mobile isn't stuck with two
// stacked headers. Desktop always shows both.
const PLAYBOOK_DETAIL_RE = /^\/playbooks\/[^/]+(?:\/.*)?$/;

export function SiteHeaderShell({ user, isAdmin, displayName, avatarUrl }: Props) {
  const pathname = usePathname();
  const hideOnMobile = PLAYBOOK_DETAIL_RE.test(pathname);

  return (
    <header
      className={`sticky top-0 z-30 border-b border-border bg-surface-raised/80 backdrop-blur-lg ${
        hideOnMobile ? "hidden sm:block" : ""
      }`}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
        <Link
          href={user ? "/home" : "/"}
          className="text-lg font-extrabold tracking-tight text-primary"
        >
          PlayGrid
        </Link>
        {user ? (
          <div className="flex items-center gap-4">
            <Link
              href="/pricing"
              className="text-sm text-muted hover:text-foreground transition-colors"
            >
              Pricing
            </Link>
            <UserMenu
              email={user.email ?? ""}
              displayName={displayName}
              avatarUrl={avatarUrl}
              isAdmin={isAdmin}
            />
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <Link
              href="/pricing"
              className="text-sm text-muted hover:text-foreground transition-colors"
            >
              Pricing
            </Link>
            <Link
              href="/login"
              className="text-sm font-semibold text-foreground hover:text-primary transition-colors"
            >
              Sign in
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}
