import Link from "next/link";

/**
 * Visitor-facing notice shown at the top of an example playbook when the
 * viewer is not a member. Complements the per-action modals that pop when
 * a visitor tries to mutate — the notice sets expectations up front, the
 * modals intervene on save.
 */
export function ExamplePreviewBanner() {
  return (
    <div className="mb-4 flex items-center justify-between gap-3 border-b border-border/60 px-1 pb-2 text-xs text-muted-foreground">
      <span>
        <span className="font-medium text-foreground">Example playbook</span>
        <span className="mx-1.5 text-border">·</span>
        Changes won&apos;t be saved.
      </span>
      <Link
        href="/home"
        className="font-medium text-primary hover:text-primary-hover"
      >
        Create your own →
      </Link>
    </div>
  );
}
