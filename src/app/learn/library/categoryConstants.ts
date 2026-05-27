// Shared constants for the unified Football Library landing — kept in
// a non-"use client" module so server components can import the type
// + helpers without dragging the React-client bundle along. The
// CategoryPill component re-exports these for client-side consumers.

export const LIBRARY_CATEGORIES = [
  { value: "plays", label: "Plays" },
  { value: "formations", label: "Formations" },
  { value: "defenses", label: "Defenses" },
  { value: "routes", label: "Routes" },
] as const;

export type LibraryCategory = (typeof LIBRARY_CATEGORIES)[number]["value"];

export const DEFAULT_LIBRARY_CATEGORY: LibraryCategory = "plays";

export function isLibraryCategory(value: unknown): value is LibraryCategory {
  return (
    typeof value === "string" &&
    LIBRARY_CATEGORIES.some((c) => c.value === value)
  );
}
