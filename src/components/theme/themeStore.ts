import {
  COLOR_SCHEME_STORAGE_KEY,
  colorSchemeQuery,
  readStoredColorScheme,
  type ColorSchemePreference,
} from "./colorModeStorage";

const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function subscribeColorScheme(onChange: () => void) {
  listeners.add(onChange);

  if (typeof window !== "undefined") {
    const onStorage = (e: StorageEvent) => {
      if (e.key === COLOR_SCHEME_STORAGE_KEY || e.key === null) onChange();
    };
    window.addEventListener("storage", onStorage);
    // useSyncExternalStore contract: subscribe must not throw. `matchMedia`
    // can be unavailable on a cold WKWebView launch; colorSchemeQuery()
    // returns null instead of throwing (which would crash ThemeProvider's
    // hydration straight to global-error). Skip the media listener when
    // absent — the storage listener still keeps the store live.
    const mq = colorSchemeQuery();
    mq?.addEventListener("change", onChange);
    return () => {
      listeners.delete(onChange);
      window.removeEventListener("storage", onStorage);
      mq?.removeEventListener("change", onChange);
    };
  }

  return () => {
    listeners.delete(onChange);
  };
}

export function getColorSchemeSnapshot(): ColorSchemePreference {
  return readStoredColorScheme();
}

export function getColorSchemeServerSnapshot(): ColorSchemePreference {
  return "system";
}

export function persistColorScheme(pref: ColorSchemePreference) {
  try {
    window.localStorage.setItem(COLOR_SCHEME_STORAGE_KEY, pref);
  } catch {
    /* ignore */
  }
  emit();
}
