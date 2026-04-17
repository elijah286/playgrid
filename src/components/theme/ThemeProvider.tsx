"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { applyColorSchemeToDocument } from "./colorModeStorage";
import type { ColorSchemePreference } from "./colorModeStorage";
import {
  getColorSchemeServerSnapshot,
  getColorSchemeSnapshot,
  persistColorScheme,
  subscribeColorScheme,
} from "./themeStore";

type Ctx = {
  colorScheme: ColorSchemePreference;
  setColorScheme: (v: ColorSchemePreference) => void;
};

const ThemeContext = createContext<Ctx | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const colorScheme = useSyncExternalStore(
    subscribeColorScheme,
    getColorSchemeSnapshot,
    getColorSchemeServerSnapshot,
  );

  useEffect(() => {
    applyColorSchemeToDocument(colorScheme);
  }, [colorScheme]);

  const setColorScheme = useCallback((v: ColorSchemePreference) => {
    persistColorScheme(v);
  }, []);

  const value = useMemo(() => ({ colorScheme, setColorScheme }), [colorScheme, setColorScheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
