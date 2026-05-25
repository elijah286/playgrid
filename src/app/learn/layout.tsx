import type { ReactNode } from "react";
import { LearnTabs } from "./LearnTabs";

export default function LearnLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-6xl px-6 py-10 text-foreground">
      <header className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Learn</p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight">Learning Center</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Everything you need to coach better with XO Gridmaker — from product
          walkthroughs to a full library of football concepts. Free, public,
          no sign-in required.
        </p>
      </header>
      <LearnTabs />
      <div className="mt-6">{children}</div>
    </div>
  );
}
