/**
 * Routes where a page-level banner takes over the top of the screen on
 * mobile, so the global SiteHeader must hide there — otherwise two headers
 * stack, and in the native app the two safe-area insets compound into a
 * doubled band above the banner. Desktop always shows both: the page banners
 * are designed to sit below the sticky SiteHeader from the `sm` breakpoint up.
 *
 *   - playbook detail          → PlaybookHeader banner
 *   - play editor (`/plays/…`) → EditorPlaybookChrome banner
 *
 * Why this lives here (render-time, driven by `usePathname`) instead of a body
 * class toggled in a `useEffect`: the play editor used to hide the header by
 * adding `editor-hide-site-header` to <body> from an effect. Effects run a
 * frame after paint and re-fire inconsistently across entry points (hard load
 * vs. soft navigation), so on some entries the SiteHeader flashed — or stuck —
 * visible above the editor's own banner. That produced the reported bug: a
 * white top bar and a doubled red safe-area band above the play. A pathname
 * check is available synchronously during render, so the header is hidden in
 * the very first paint regardless of how the coach reached the page.
 */

const PLAYBOOK_DETAIL_RE = /^\/playbooks\/[^/]+(?:\/.*)?$/;

// ...except the print sub-route. It has no banner of its own — just a
// back-link row — so hiding the global header there leaves nothing to push
// content below the iOS status bar (the back button ends up under the clock).
const PLAYBOOK_PRINT_RE = /^\/playbooks\/[^/]+\/print(?:\/|$)/;

// The `(editor)` group's play routes (/plays/new, /plays/new-preview,
// /plays/[id]/edit) all render EditorPlaybookChrome as their top banner.
// Practice-plan editors are intentionally excluded: they render no
// replacement banner, so they keep the SiteHeader as their top affordance.
const PLAY_EDITOR_RE = /^\/plays\//;

/**
 * True when `pathname` owns a page-level top banner that replaces the global
 * SiteHeader on mobile, so the header should render `hidden sm:block`.
 */
export function hideSiteHeaderOnMobile(pathname: string): boolean {
  if (PLAYBOOK_PRINT_RE.test(pathname)) return false;
  return PLAYBOOK_DETAIL_RE.test(pathname) || PLAY_EDITOR_RE.test(pathname);
}
