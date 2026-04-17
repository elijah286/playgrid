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

export function applyColorSchemeToDocument(pref: ColorSchemePreference) {
  const root = document.documentElement;
  const dark =
    pref === "dark" ||
    (pref === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.classList.toggle("dark", dark);
}
