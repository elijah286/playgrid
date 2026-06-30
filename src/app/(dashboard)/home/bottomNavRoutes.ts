/**
 * Routes whose own context renders a bottom toolbar (or is intentionally
 * full-screen), so the global mobile bottom nav must NOT also render there
 * — otherwise two bars stack. Sourced from the route groups that own the
 * bottom of the screen:
 *   - playbook detail          → PlaybookBottomNav
 *   - play & practice editors  → EditorBottomNav (the `(editor)` group:
 *                                /plays/new, /plays/new-preview,
 *                                /plays/[id]/edit, /practice-plans/[id]/…)
 *   - mobile viewer + share    → focused viewer chrome (the `(viewer)`
 *                                group: /m/play/[id], /v/[token])
 *   - full-screen Coach Cal    → /coach-cal/chat (the /coach-cal landing
 *                                page is marketing and DOES show the nav)
 *
 * Everything NOT matched here — /home, /account, /learn/*, /pricing, and the
 * rest of the marketing/resource surfaces — shows the nav for authed users,
 * so a coach never lands on an in-app page with no way back.
 */
const OWN_BOTTOM_BAR_RE =
  /^\/(playbooks\/[^/]+|plays\/|practice-plans\/[^/]+|m\/play\/|v\/[^/]+|coach-cal\/chat|league(?:\/|$))/;

/**
 * Exception: the playbook *print* sub-route renders no bottom toolbar of its
 * own, and its in-app back button can sit under the iOS status bar — so it
 * keeps the global nav as its only way out. (Carved out of the playbook
 * match above.)
 */
const PRINT_EXCEPTION_RE = /^\/playbooks\/[^/]+\/print(?:\/|$)/;

/** True when `pathname` is owned by a context-specific bottom toolbar or a
 *  full-screen surface, so the global bottom nav should bail (return null). */
export function isOwnBottomBarRoute(pathname: string): boolean {
  return OWN_BOTTOM_BAR_RE.test(pathname) && !PRINT_EXCEPTION_RE.test(pathname);
}
