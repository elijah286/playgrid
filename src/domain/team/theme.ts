import { z } from "zod";

export const teamThemeSchema = z.object({
  presetId: z.string().optional(),
  primary: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  accent: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  field: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  ink: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  surface: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  pageBg: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
});

export type TeamTheme = z.infer<typeof teamThemeSchema>;

export const DEFAULT_TEAM_THEME: TeamTheme = {
  presetId: "default",
  primary: "#134e2a",
  accent: "#c2410c",
  field: "#c8ecd4",
  ink: "#07140f",
  surface: "#dfeae2",
  pageBg: "#fafafa",
};

export const TEAM_THEME_PRESETS: { id: string; label: string; theme: TeamTheme }[] = [
  { id: "default", label: "Forest & orange", theme: DEFAULT_TEAM_THEME },
  {
    id: "navy",
    label: "Navy & gold",
    theme: {
      presetId: "navy",
      primary: "#1e3a5f",
      accent: "#b45309",
      field: "#dbeafe",
      ink: "#0f172a",
      surface: "#e2e8f0",
      pageBg: "#f8fafc",
    },
  },
  {
    id: "crimson",
    label: "Crimson",
    theme: {
      presetId: "crimson",
      primary: "#7f1d1d",
      accent: "#ea580c",
      field: "#fecaca",
      ink: "#450a0a",
      surface: "#fee2e2",
      pageBg: "#fff7ed",
    },
  },
  {
    id: "royal",
    label: "Royal purple",
    theme: {
      presetId: "royal",
      primary: "#5b21b6",
      accent: "#0891b2",
      field: "#e9d5ff",
      ink: "#1e1b4b",
      surface: "#ddd6fe",
      pageBg: "#faf5ff",
    },
  },
  {
    id: "slate",
    label: "Slate pro",
    theme: {
      presetId: "slate",
      primary: "#334155",
      accent: "#0d9488",
      field: "#ccfbf1",
      ink: "#0f172a",
      surface: "#e2e8f0",
      pageBg: "#f1f5f9",
    },
  },
];

export function parseTeamTheme(raw: unknown): TeamTheme {
  const parsed = teamThemeSchema.safeParse(raw);
  return parsed.success ? parsed.data : DEFAULT_TEAM_THEME;
}

export function teamThemeCssVars(theme: TeamTheme): Record<string, string> {
  return {
    "--team-primary": theme.primary,
    "--team-accent": theme.accent,
    "--team-field": theme.field,
    "--team-ink": theme.ink,
    "--team-surface": theme.surface,
    "--team-page-bg": theme.pageBg,
  };
}
