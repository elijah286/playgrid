"use client";

import { useTheme } from "./ThemeProvider";
import type { ColorSchemePreference } from "./colorModeStorage";

const options: { value: ColorSchemePreference; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

export function ColorModeToggle({ className = "" }: { className?: string }) {
  const { colorScheme, setColorScheme } = useTheme();

  return (
    <div
      className={`inline-flex rounded-xl bg-pg-surface/90 p-0.5 ring-1 ring-pg-line/80 dark:bg-pg-turf-deep/40 dark:ring-pg-line/30 ${className}`}
      role="group"
      aria-label="Color mode"
    >
      {options.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          onClick={() => setColorScheme(value)}
          className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
            colorScheme === value
              ? "bg-pg-chalk text-pg-ink shadow-sm dark:bg-pg-ink dark:text-pg-mist"
              : "text-pg-muted hover:text-pg-ink dark:text-pg-faint dark:hover:text-pg-mist"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
