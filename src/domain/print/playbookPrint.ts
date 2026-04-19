import type { PlayDocument } from "@/domain/play/types";

export type PrintProductKind = "playsheet" | "wristband";

export type PlaysheetGrouping = "manual" | "formation" | "name" | "number" | "group";

export type WristbandGridLayout = "8" | "6" | "4" | "4col" | "3";
export type WristbandZoom = 50 | 75 | 100 | 125 | 150;
export type WristbandIconSize = "small" | "medium" | "large";
export type WristbandRouteWeight = "thin" | "medium" | "thick";
export type WristbandLabelStyle = "prominent" | "compact";
export type WristbandLabelMode = "both" | "name" | "number";
export type WristbandPlayerShape = "circle" | "x" | "diamond";

export const WRISTBAND_WIDTHS_IN: readonly number[] = [
  3, 3.25, 3.5, 3.75, 4, 4.25, 4.5, 4.75, 5,
] as const;

export const WRISTBAND_HEIGHTS_IN: readonly number[] = [
  2, 2.25, 2.5, 2.75, 3, 3.5,
] as const;

export const WRISTBAND_ZOOMS: readonly WristbandZoom[] = [50, 75, 100, 125, 150] as const;

export type PlaybookPrintRunConfig = {
  product: PrintProductKind;
  /** Playsheet: diagrams per letter page (wristband export ignores for page tiling) */
  playsPerSheet: 1 | 2 | 4;
  sheetOrientation: "portrait" | "landscape";
  playsheetGrouping: PlaysheetGrouping;
  /** Visual emphasis only for now (feeds print compiler) */
  backfieldYards: number;
  downfieldYards: number;
  includeCommentsAndNotes: boolean;
  /** Wristband: outer dimensions in inches (quarter-inch increments) */
  wristbandWidthIn: number;
  wristbandHeightIn: number;
  /** Wristband: tile grid preset */
  wristbandGridLayout: WristbandGridLayout;
  /** Wristband: per-tile diagram zoom (percent) */
  wristbandZoom: WristbandZoom;
  /** Wristband: player-icon size bucket */
  wristbandIconSize: WristbandIconSize;
  /** Wristband: route stroke weight bucket */
  wristbandRouteWeight: WristbandRouteWeight;
  /** Wristband: play-label emphasis */
  wristbandLabelStyle: WristbandLabelStyle;
  /** Wristband: which play label(s) to show per tile */
  wristbandLabels: WristbandLabelMode;
  /** Wristband: player marker shape */
  wristbandPlayerShape: WristbandPlayerShape;
  /** Wristband: color-code labels by group/formation */
  wristbandColorCoding: boolean;
  wristbandGrouping: PlaysheetGrouping;
};

export const defaultPlaybookPrintRunConfig: PlaybookPrintRunConfig = {
  product: "playsheet",
  playsPerSheet: 1,
  sheetOrientation: "portrait",
  playsheetGrouping: "manual",
  backfieldYards: 10,
  downfieldYards: 15,
  includeCommentsAndNotes: true,
  wristbandWidthIn: 4.5,
  wristbandHeightIn: 2.25,
  wristbandGridLayout: "6",
  wristbandZoom: 100,
  wristbandIconSize: "large",
  wristbandRouteWeight: "medium",
  wristbandLabelStyle: "compact",
  wristbandLabels: "number",
  wristbandPlayerShape: "circle",
  wristbandColorCoding: true,
  wristbandGrouping: "manual",
};

export function wristbandGridDims(layout: WristbandGridLayout): { rows: number; cols: number } {
  switch (layout) {
    case "8":
      return { rows: 2, cols: 4 };
    case "6":
      return { rows: 2, cols: 3 };
    case "4":
      return { rows: 2, cols: 2 };
    case "4col":
      return { rows: 1, cols: 4 };
    case "3":
      return { rows: 1, cols: 3 };
  }
}

export function wristbandTilesPerBand(layout: WristbandGridLayout): number {
  const { rows, cols } = wristbandGridDims(layout);
  return rows * cols;
}

export const IN_TO_MM = 25.4;

export function inchesToMm(inches: number): number {
  return inches * IN_TO_MM;
}

export type PlaybookGroupRow = {
  id: string;
  name: string;
  sort_order: number;
};

export type PlaybookPlayNavItem = {
  id: string;
  name: string;
  wristband_code: string;
  shorthand: string;
  formation_name: string;
  concept: string;
  tags: string[];
  group_id: string | null;
  sort_order: number;
  group_name: string | null;
  group_sort_order: number | null;
  current_version_id: string | null;
};

export function compareNavPlays(a: PlaybookPlayNavItem, b: PlaybookPlayNavItem): number {
  const ungA = a.group_id == null ? 0 : 1;
  const ungB = b.group_id == null ? 0 : 1;
  if (ungA !== ungB) return ungA - ungB;
  const ga = a.group_sort_order ?? 0;
  const gb = b.group_sort_order ?? 0;
  if (ga !== gb) return ga - gb;
  if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
  return a.name.localeCompare(b.name);
}

export function sortNavPlaysForPrint(
  plays: PlaybookPlayNavItem[],
  grouping: PlaysheetGrouping,
): PlaybookPlayNavItem[] {
  const base = [...plays];
  if (grouping === "manual") {
    base.sort(compareNavPlays);
    return base;
  }
  const key = (p: PlaybookPlayNavItem) => {
    switch (grouping) {
      case "formation":
        return p.formation_name.toLowerCase();
      case "name":
        return p.name.toLowerCase();
      case "number":
        return p.wristband_code.toLowerCase();
      case "group":
        return (p.group_name ?? "").toLowerCase();
      default:
        return "";
    }
  };
  base.sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    if (ka !== kb) return ka.localeCompare(kb);
    return compareNavPlays(a, b);
  });
  return base;
}

export function formatPlayFullLabel(doc: PlayDocument): string {
  const m = doc.metadata;
  const tagLabel = m.tags && m.tags.length > 0 ? `Tags: ${m.tags.join(", ")}` : "";
  const parts = [
    m.coachName,
    m.formation && `Formation: ${m.formation}`,
    tagLabel,
    m.wristbandCode && `#${m.wristbandCode}`,
    m.concept && `Concept: ${m.concept}`,
  ].filter(Boolean);
  return parts.join(" · ");
}

export function formatPlayNavSubtitle(p: Pick<PlaybookPlayNavItem, "formation_name" | "tags" | "wristband_code">): string {
  const tagStr = p.tags && p.tags.length > 0 ? p.tags.join(", ") : "";
  const bits = [p.formation_name, tagStr, p.wristband_code].filter((s) => s && s.trim().length > 0);
  return bits.join(" · ") || "—";
}

/** Clone for PDF export only — does not replace on-screen document */
export function applyExportPresentation(doc: PlayDocument, run: PlaybookPrintRunConfig): PlayDocument {
  const out: PlayDocument = structuredClone(doc);
  out.printProfile.visibility.showNotes = run.includeCommentsAndNotes;
  if (run.product === "wristband") {
    const showCode = run.wristbandLabels !== "name";
    const showName = run.wristbandLabels !== "number";
    if (!showCode) out.printProfile.visibility.showWristbandCode = false;
    if (!showName) out.metadata.coachName = "\u200b";
  }
  return out;
}
