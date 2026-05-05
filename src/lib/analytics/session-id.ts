const SESSION_KEY = "playgrid:session-id";
const FIRST_EVENT_KEY = "playgrid:session-first-sent";

/**
 * Per-tab session id. Stable across page navigations within one tab,
 * resets when the tab closes. Used to correlate page_views, ui_events,
 * and web vitals for the same browsing session.
 */
export function getSessionId(): string {
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

/** True the first time it's called per tab. */
export function consumeFirstSessionEventFlag(): boolean {
  try {
    if (!sessionStorage.getItem(FIRST_EVENT_KEY)) {
      sessionStorage.setItem(FIRST_EVENT_KEY, "1");
      return true;
    }
  } catch {
    // ignore
  }
  return false;
}
