export type ColorSchemePreference = "light" | "dark" | "system";

export const COLOR_SCHEME_STORAGE_KEY = "playgrid-color-scheme";

export function readStoredColorScheme(): ColorSchemePreference {
  if (typeof window === "undefined") return "system";
  try {
    const v = window.localStorage.getItem(COLOR_SCHEME_STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    /* ignore */
  }
  return "system";
}

/**
 * Safe accessor for the dark-mode media query. `matchMedia` is exercised
 * during ThemeProvider hydration (the useSyncExternalStore subscribe path)
 * and in its effect — both inside the root layout, so a throw here would
 * escape to global-error.tsx and replace the whole document. That's the
 * scary full-page error the offline shell must never show. WKWebView can be
 * slow to stand its browser APIs up on a cold first launch, so treat a
 * missing/throwing `matchMedia` as "no dark preference" (matches the
 * try/catch already guarding the sibling localStorage read). Returns `null`
 * when the query is unavailable so callers can skip listener wiring.
 */
export function colorSchemeQuery(): MediaQueryList | null {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return null;
  }
  try {
    return window.matchMedia("(prefers-color-scheme: dark)");
  } catch {
    return null;
  }
}

export function systemPrefersDark(): boolean {
  return colorSchemeQuery()?.matches ?? false;
}

export function applyColorSchemeToDocument(pref: ColorSchemePreference) {
  const root = document.documentElement;
  const dark = pref === "dark" || (pref === "system" && systemPrefersDark());
  root.classList.toggle("dark", dark);
}
