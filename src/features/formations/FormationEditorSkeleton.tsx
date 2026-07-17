/**
 * Route-level loading UI for the formation editor.
 *
 * The play editor has had one of these since coaches reported the app feeling
 * unresponsive for the half-second of server work after a tap — long enough to
 * tap again. Opening a formation is the same dynamic route with the same
 * round-trip and had nothing at all: the Formations tab just sat there.
 *
 * Mirrors the editor's own shell — header, the Sport type / Type / name row,
 * field, inspector — so the page doesn't visibly reflow when the real thing
 * mounts. Shared by /formations/new and /formations/[id]/edit; both render the
 * same editor, so one skeleton.
 */
export function FormationEditorSkeleton() {
  return (
    // Same width cap as the editor (and the play editor), so the skeleton
    // occupies the space the real content will.
    <div className="play-editor-content flex flex-col gap-5">
      {/* Header: back link, title, save */}
      <header className="flex flex-wrap items-center gap-3 border-b border-border pb-4">
        <div className="h-8 w-24 rounded-lg bg-surface-inset" aria-hidden />
        <div className="h-6 w-40 rounded bg-surface-inset" aria-hidden />
        <div className="ml-auto h-9 w-32 rounded-lg bg-surface-inset" aria-hidden />
      </header>

      {/* Sport type / Type / Formation name */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <div className="h-3 w-16 rounded bg-surface-inset" aria-hidden />
          <div className="h-9 w-44 rounded-lg bg-surface-inset" aria-hidden />
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="h-3 w-10 rounded bg-surface-inset" aria-hidden />
          <div className="h-9 w-40 rounded-lg bg-surface-inset" aria-hidden />
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <div className="h-3 w-24 rounded bg-surface-inset" aria-hidden />
          <div className="h-9 w-full rounded-lg bg-surface-inset" aria-hidden />
        </div>
      </div>

      <div className="grid min-h-0 min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="h-9 rounded-lg bg-surface-inset" aria-hidden />
          {/* The real box takes the field's own aspect, which depends on the
              variant — and a route-level loading file gets no params, so it
              can't know it. Same generic placeholder the play editor's
              skeleton uses; a small settle on mount beats a blank screen. */}
          <div
            className="field-viewport relative mx-auto flex w-full items-center justify-center overflow-hidden rounded-xl bg-surface-inset"
            style={{ aspectRatio: "8 / 5" }}
          >
            <Spinner />
          </div>
        </div>

        {/* Inspector */}
        <aside className="flex flex-col gap-3 rounded-xl border border-border bg-surface-raised p-4">
          <div className="h-3 w-16 rounded bg-surface-inset" aria-hidden />
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-12 rounded-lg bg-surface-inset" aria-hidden />
          ))}
        </aside>
      </div>
    </div>
  );
}

/** Matches the play editor skeleton's spinner so the two loading states read
 *  as the same app. */
function Spinner() {
  return (
    <svg
      className="size-6 animate-spin text-primary"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
        strokeOpacity="0.25"
      />
      <path
        d="M22 12a10 10 0 0 1-10 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
