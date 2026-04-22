import Link from "next/link";
import { FlaskConical } from "lucide-react";

/**
 * Visitor-facing banner shown at the top of an example playbook when the
 * viewer is not a member. Complements the per-action modals that pop when
 * a visitor tries to mutate — the banner sets expectations up front, the
 * modals intervene on save.
 */
export function ExamplePreviewBanner() {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
      <div className="inline-flex items-center gap-2 text-foreground">
        <FlaskConical className="size-4 text-primary" />
        <span>
          <span className="font-semibold">This is an example playbook.</span>{" "}
          Changes won&apos;t be saved.
        </span>
      </div>
      <Link
        href="/home"
        className="inline-flex items-center rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-primary-hover"
      >
        Create your own playbook
      </Link>
    </div>
  );
}
