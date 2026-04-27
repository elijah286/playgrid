/**
 * Field-theme colors shared by every play renderer (the editor canvas, the
 * read-only thumbnail, the Coach AI chat embed). Centralizing here means
 * tweaking a color in one place updates every play surface — no drift between
 * the editor and Coach AI's diagrams.
 */

export type FieldBackground = "green" | "white" | "black" | "gray";

export type FieldTheme = {
  /** Top stop of the field gradient */
  bgMain: string;
  /** Bottom stop of the field gradient */
  bgDark: string;
  /** Yard-line stripes */
  lineColor: string;
  /** Hash marks (intentionally a touch brighter than yard lines) */
  hashColor: string;
  /** Yard numbers in the gutters */
  numberColor: string;
  /** Thin outline around the whole field (visual separation from page bg) */
  borderColor: string;
  /** Line-of-scrimmage marker + ball icon */
  losColor: string;
};

const BG_COLORS: Record<string, { main: string; dark: string }> = {
  green: { main: "#2D8B4E", dark: "#247540" },
  white: { main: "#FFFFFF", dark: "#FFFFFF" },
  black: { main: "#0A0A0A", dark: "#141414" },
};

const LINE_COLORS: Record<string, string> = {
  green: "rgba(255,255,255,0.30)",
  white: "rgba(0,0,0,0.55)",
  black: "rgba(255,255,255,0.22)",
};

const HASH_COLORS: Record<string, string> = {
  green: "rgba(255,255,255,0.75)",
  white: "rgba(0,0,0,0.70)",
  black: "rgba(255,255,255,0.60)",
};

const NUMBER_COLORS: Record<string, string> = {
  green: "rgba(255,255,255,0.85)",
  white: "rgba(0,0,0,0.80)",
  black: "rgba(255,255,255,0.70)",
};

const BORDER_COLORS: Record<string, string> = {
  green: "rgba(255,255,255,0.35)",
  white: "rgba(0,0,0,0.50)",
  black: "rgba(255,255,255,0.30)",
};

const LOS_COLORS: Record<string, string> = {
  green: "rgba(255,255,255,0.55)",
  white: "rgba(0,0,0,0.55)",
  black: "rgba(255,255,255,0.50)",
};

/** Resolve every theme color for a given background choice. Legacy "gray"
 *  plays fall back to the white theme so they don't render an unstyled mess. */
export function resolveFieldTheme(bg: FieldBackground | null | undefined): FieldTheme {
  const key = bg === "gray" ? "white" : (bg ?? "green");
  return {
    bgMain: BG_COLORS[key].main,
    bgDark: BG_COLORS[key].dark,
    lineColor: LINE_COLORS[key],
    hashColor: HASH_COLORS[key],
    numberColor: NUMBER_COLORS[key],
    borderColor: BORDER_COLORS[key],
    losColor: LOS_COLORS[key],
  };
}
