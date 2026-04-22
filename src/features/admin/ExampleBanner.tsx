import { FlaskConical } from "lucide-react";

/**
 * Server-rendered banner shown on any playbook that's been marked as a
 * public example. Conveys two pieces of status in one glance:
 *   * "this playbook is an example" (the banner itself)
 *   * "it is / is not currently published" (the pill on the right)
 * The actual toggle lives in the playbook action menu, not here.
 */
export function ExampleBanner({ isPublished }: { isPublished: boolean }) {
  return (
    <div
      className={`mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${
        isPublished
          ? "border-emerald-500/30 bg-emerald-50/80 text-emerald-950 dark:bg-emerald-500/10 dark:text-emerald-100"
          : "border-amber-500/30 bg-amber-50/80 text-amber-950 dark:bg-amber-500/10 dark:text-amber-100"
      }`}
    >
      <div className="inline-flex items-center gap-2">
        <FlaskConical className="size-4" />
        <span className="font-semibold">Public example</span>
        <span
          className={
            isPublished
              ? "text-emerald-900/70 dark:text-emerald-100/70"
              : "text-amber-900/70 dark:text-amber-100/70"
          }
        >
          — marked as an example playbook.
        </span>
      </div>
      <span
        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
          isPublished
            ? "bg-emerald-600 text-white"
            : "bg-amber-600/90 text-white"
        }`}
      >
        {isPublished ? "Published" : "Unpublished"}
      </span>
    </div>
  );
}
