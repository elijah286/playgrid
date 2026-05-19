/**
 * Editor-side helper: tell the tutorial engine the coach just
 * performed an action so its in-step checkbox list (or any other
 * reactive UI in the step card) can update.
 *
 * Dispatches a `tutorial:action` window event with `{ kind }` in
 * detail. The TutorialProvider listens for it and accumulates the
 * kinds into a per-step Set that body callbacks read via
 * `ctx.actions.has("…")`.
 *
 * Cheap to call — when no tour is active nobody is listening and
 * the event is a no-op. Editors should call this unconditionally
 * from their existing handlers; we don't want every editor action
 * to know whether a tour happens to be running.
 */
export function notifyTutorialAction(kind: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("tutorial:action", { detail: { kind } }),
  );
}

/** The window-event name the engine listens for. Exported so the
 *  engine can subscribe without re-typing the string. */
export const TUTORIAL_ACTION_EVENT = "tutorial:action" as const;

/**
 * Ask the editor to open a collapsible UI surface (notes section,
 * inspector panel, etc.) on the coach's behalf. Fired by the
 * tutorial's `find` links so a step bullet that references a panel
 * the coach hasn't expanded yet can be made visible in one click.
 *
 * `target` is a stable identifier — the corresponding editor
 * component subscribes to the event and opens itself when its
 * target matches.
 */
export function notifyTutorialRequestOpen(target: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(TUTORIAL_REQUEST_OPEN_EVENT, { detail: { target } }),
  );
}

export const TUTORIAL_REQUEST_OPEN_EVENT = "tutorial:request-open" as const;
