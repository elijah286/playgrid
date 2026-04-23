import type { PlayDocument, Player, Route, Zone } from "@/domain/play/types";

export type PrintProductKind = "playsheet" | "wristband";

export type PlaysheetGrouping = "manual" | "formation" | "name" | "number" | "group";

export type PlaysheetColumns = 1 | 2 | 3 | 4 | 5;

export const PLAYSHEET_COLUMN_OPTIONS: readonly PlaysheetColumns[] = [1, 2, 3, 4, 5] as const;

export type PlaysheetPageBreak = "continuous" | "group";

export type PlaysheetNoteLines = 1 | 2 | 3;

export type WristbandGridLayout = "12" | "10" | "8" | "6" | "4" | "4col" | "3";
export type WristbandZoom = 50 | 75 | 100 | 125 | 150;
export type WristbandIconSize = "small" | "medium" | "large";
export type WristbandRouteWeight = "thin" | "medium" | "thick";
export type ArrowSize = "small" | "medium" | "large";
export type PrintLabelToggles = {
  showNumber: boolean;
  showFormation: boolean;
  showName: boolean;
};
export type PrintNumberPosition =
  | "top-left"
  | "bottom-left"
  | "bottom-center"
  | "below-name";
export type PrintTextPosition = "top-left" | "top-center" | "bottom-center";
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
  /** Playsheet: columns across a letter page (1–5). */
  playsheetColumns: PlaysheetColumns;
  sheetOrientation: "portrait" | "landscape";
  /** Playsheet: continuous packing or force a new page per group. */
  playsheetPageBreak: PlaysheetPageBreak;
  /** Playsheet: fixed-height notes strip under each play. */
  playsheetShowNotes: boolean;
  playsheetNoteLines: PlaysheetNoteLines;
  /** Playsheet: 0 = no padding (edge-to-edge), 1 = current spacing. */
  playsheetCellPadding: number;
  /** Wristband: 0 = tiles flush together, 1 = default spacing. */
  wristbandCellPadding: number;
  /** Playsheet: render the team header banner across the top of every page. */
  playsheetIncludeHeader: boolean;
  /** Playsheet visual look (matches wristband options). */
  playsheetIconSize: WristbandIconSize;
  playsheetRouteWeight: WristbandRouteWeight;
  playsheetArrowSize: ArrowSize;
  playsheetLabels: PrintLabelToggles;
  /** Header text size multiplier (e.g. 0.5 = 50%, 1 = default, 2 = 200%). */
  playsheetHeaderFontSize: number;
  /** Number chip size multiplier (1 = default). */
  playsheetNumberSize: number;
  /** Where to render the play-number chip. */
  playsheetNumberPosition: PrintNumberPosition;
  /** Formation label size multiplier (1 = default). */
  playsheetFormationSize: number;
  /** Where to render the formation label. */
  playsheetFormationPosition: PrintTextPosition;
  /** Play name label size multiplier (1 = default). */
  playsheetNameSize: number;
  /** Where to render the play name label. */
  playsheetNamePosition: PrintTextPosition;
  /** Wrap long formation/name labels onto a second line instead of truncating. */
  playsheetLabelWrap: boolean;
  playsheetColorCoding: boolean;
  /** LOS line intensity 0–1 (0 hides it, 1 = full stroke + opacity). */
  playsheetLosIntensity: number;
  /** Yard-line guide intensity 0–1 (0 hides them, 1 = full). */
  playsheetYardMarkersIntensity: number;
  /** Play-tile border thickness multiplier (0 = invisible, 1 = default). */
  playsheetBorderThickness: number;
  playsheetShowPlayerLabels: boolean;
  playsheetPlayerOutline: boolean;
  /** Visual emphasis only for now (feeds print compiler) */
  backfieldYards: number;
  downfieldYards: number;
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
  /** Wristband: arrow-head size bucket */
  wristbandArrowSize: ArrowSize;
  /** Wristband: which play label(s) to show per tile */
  wristbandLabels: PrintLabelToggles;
  /** Header text size multiplier (e.g. 0.5 = 50%, 1 = default, 2 = 200%). */
  wristbandHeaderFontSize: number;
  /** Number chip size multiplier (1 = default). */
  wristbandNumberSize: number;
  /** Where to render the play-number chip. */
  wristbandNumberPosition: PrintNumberPosition;
  /** Formation label size multiplier (1 = default). */
  wristbandFormationSize: number;
  /** Where to render the formation label. */
  wristbandFormationPosition: PrintTextPosition;
  /** Play name label size multiplier (1 = default). */
  wristbandNameSize: number;
  /** Where to render the play name label. */
  wristbandNamePosition: PrintTextPosition;
  /** Wrap long formation/name labels onto a second line instead of truncating. */
  wristbandLabelWrap: boolean;
  /** Wristband: draw dark outline around player markers */
  wristbandPlayerOutline: boolean;
  /** Wristband: color-code labels by group/formation */
  wristbandColorCoding: boolean;
  /** Wristband: draw LOS line on each tile */
  wristbandShowLos: boolean;
  /** Wristband: draw faint yard-line guides on each tile */
  wristbandShowYardMarkers: boolean;
  /** Wristband: show letter labels inside player markers */
  wristbandShowPlayerLabels: boolean;
  /**
   * Wristband layout mode. "single" (legacy) = one narrow strip per PDF page.
   * "sheet" = pack as many identical strips as fit onto letter-size pages, top
   * aligned, so the user can cut them apart and hand one to each player.
   */
  wristbandSheet: WristbandSheetMode;
  /** Sheet mode: explicit copies per page, or auto-fit across the width. */
  wristbandCopiesPerSheet: "auto" | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  /** Playbook-logo watermark behind every page. */
  watermarkEnabled: boolean;
  /**
   * Watermark opacity, expressed as a percentage (5–20 per product spec).
   * Applied to a centered <image> layer rendered behind the content.
   */
  watermarkOpacityPct: number;
  /** Watermark image size, 0.1–1 (fraction of available area). */
  watermarkScale: number;
};

export type WristbandSheetMode = "single" | "sheet";

/** Clamp the watermark opacity to the product range (5–20%). */
export const WATERMARK_MIN_PCT = 5;
export const WATERMARK_MAX_PCT = 20;

export const defaultPlaybookPrintRunConfig: PlaybookPrintRunConfig = {
  product: "playsheet",
  playsheetColumns: 3,
  sheetOrientation: "portrait",
  playsheetPageBreak: "continuous",
  playsheetShowNotes: true,
  playsheetNoteLines: 2,
  playsheetCellPadding: 0.5,
  wristbandCellPadding: 1,
  playsheetIncludeHeader: true,
  playsheetIconSize: "medium",
  playsheetRouteWeight: "medium",
  playsheetArrowSize: "medium",
  playsheetLabels: { showNumber: true, showFormation: false, showName: true },
  playsheetHeaderFontSize: 1,
  playsheetNumberSize: 1,
  playsheetNumberPosition: "top-left",
  playsheetFormationSize: 1,
  playsheetFormationPosition: "top-center",
  playsheetNameSize: 1,
  playsheetNamePosition: "top-center",
  playsheetLabelWrap: false,
  playsheetColorCoding: false,
  playsheetLosIntensity: 0.5,
  playsheetYardMarkersIntensity: 0.3,
  playsheetBorderThickness: 1,
  playsheetShowPlayerLabels: true,
  playsheetPlayerOutline: false,
  backfieldYards: 10,
  downfieldYards: 15,
  wristbandWidthIn: 4,
  wristbandHeightIn: 2.25,
  wristbandGridLayout: "8",
  wristbandZoom: 100,
  wristbandIconSize: "medium",
  wristbandRouteWeight: "medium",
  wristbandArrowSize: "medium",
  wristbandLabels: { showNumber: true, showFormation: false, showName: false },
  wristbandHeaderFontSize: 1,
  wristbandNumberSize: 1,
  wristbandNumberPosition: "top-left",
  wristbandFormationSize: 1,
  wristbandFormationPosition: "top-center",
  wristbandNameSize: 1,
  wristbandNamePosition: "top-center",
  wristbandLabelWrap: false,
  wristbandPlayerOutline: false,
  wristbandColorCoding: true,
  wristbandShowLos: true,
  wristbandShowYardMarkers: true,
  wristbandShowPlayerLabels: true,
  wristbandSheet: "sheet",
  wristbandCopiesPerSheet: "auto",
  watermarkEnabled: true,
  watermarkOpacityPct: 10,
  watermarkScale: 0.6,
};

/** Map a legacy string label mode onto the new toggles struct. */
function legacyLabelsToToggles(mode: unknown): PrintLabelToggles | null {
  if (mode === "both") return { showNumber: true, showFormation: false, showName: true };
  if (mode === "name") return { showNumber: false, showFormation: false, showName: true };
  if (mode === "number") return { showNumber: true, showFormation: false, showName: false };
  return null;
}

function coerceLabels(value: unknown, fallback: PrintLabelToggles): PrintLabelToggles {
  const legacy = legacyLabelsToToggles(value);
  if (legacy) return legacy;
  if (value && typeof value === "object") {
    const v = value as Partial<PrintLabelToggles>;
    return {
      showNumber: typeof v.showNumber === "boolean" ? v.showNumber : fallback.showNumber,
      showFormation:
        typeof v.showFormation === "boolean" ? v.showFormation : fallback.showFormation,
      showName: typeof v.showName === "boolean" ? v.showName : fallback.showName,
    };
  }
  return { ...fallback };
}

/**
 * Read a persisted print config (preset JSON, localStorage) and coerce it into
 * the current shape. Drops legacy `playsheetLabelStyle`/`wristbandLabelStyle`
 * keys and converts legacy string label modes to the toggles struct.
 */
export function normalizePrintRunConfig(raw: unknown): PlaybookPrintRunConfig {
  const base = { ...defaultPlaybookPrintRunConfig };
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Record<string, unknown>;
  const merged = { ...base, ...r } as PlaybookPrintRunConfig & Record<string, unknown>;
  merged.playsheetLabels = coerceLabels(r.playsheetLabels, base.playsheetLabels);
  merged.wristbandLabels = coerceLabels(r.wristbandLabels, base.wristbandLabels);
  delete (merged as Record<string, unknown>).playsheetLabelStyle;
  delete (merged as Record<string, unknown>).wristbandLabelStyle;
  return merged;
}

export function wristbandGridDims(layout: WristbandGridLayout): { rows: number; cols: number } {
  switch (layout) {
    case "12":
      return { rows: 3, cols: 4 };
    case "10":
      return { rows: 2, cols: 5 };
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
  play_type: "offense" | "defense" | "special_teams";
  preview?: {
    players: Player[];
    routes: Route[];
    zones: Zone[];
    lineOfScrimmageY: number;
  } | null;
};

export function compareNavPlays(a: PlaybookPlayNavItem, b: PlaybookPlayNavItem): number {
  const ungA = a.group_id == null ? 0 : 1;
  const ungB = b.group_id == null ? 0 : 1;
  if (ungA !== ungB) return ungA - ungB;
  const ga = a.group_sort_order ?? 0;
  const gb = b.group_sort_order ?? 0;
  if (ga !== gb) return ga - gb;
  if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
  return a.name.localeCompare(b.name, undefined, {
    numeric: true,
    sensitivity: "base",
  });
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
    if (ka !== kb)
      return ka.localeCompare(kb, undefined, { numeric: true, sensitivity: "base" });
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
  if (run.product === "wristband") {
    out.printProfile.visibility.showNotes = false;
    const showCode = run.wristbandLabels.showNumber;
    const showName = run.wristbandLabels.showName;
    if (!showCode) out.printProfile.visibility.showWristbandCode = false;
    if (!showName) out.metadata.coachName = "\u200b";
  } else {
    out.printProfile.visibility.showNotes = run.playsheetShowNotes;
    const showCode = run.playsheetLabels.showNumber;
    const showName = run.playsheetLabels.showName;
    if (!showCode) out.printProfile.visibility.showWristbandCode = false;
    if (!showName) out.metadata.coachName = "\u200b";
  }

  // Apply the print config's backfield/downfield yards to the doc so the
  // slider actually moves the line of scrimmage (and players/routes stay
  // in sync). Mirrors the `field.setYardage` reducer case — kept here so
  // the export runs without a dispatch.
  const clampYards = (v: number, lo: number, hi: number) =>
    Math.max(lo, Math.min(hi, Math.round(v)));
  const bk = clampYards(run.backfieldYards, 2, 30);
  const dn = clampYards(run.downfieldYards, 5, 50);
  const newTotal = bk + dn;
  const newLosY = bk / newTotal;
  const oldTotal = out.sportProfile.fieldLengthYds;
  const oldLosY = typeof out.lineOfScrimmageY === "number" ? out.lineOfScrimmageY : 0.4;
  if (newTotal !== oldTotal || Math.abs(newLosY - oldLosY) > 1e-6) {
    const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
    const scaleY = (y: number) =>
      clamp01(newLosY + ((y - oldLosY) * oldTotal) / newTotal);
    out.lineOfScrimmageY = newLosY;
    out.sportProfile = { ...out.sportProfile, fieldLengthYds: newTotal };
    out.layers.players = out.layers.players.map((p) => ({
      ...p,
      position: { x: p.position.x, y: scaleY(p.position.y) },
    }));
    out.layers.routes = out.layers.routes.map((r) => ({
      ...r,
      nodes: r.nodes.map((n) => ({
        ...n,
        position: { x: n.position.x, y: scaleY(n.position.y) },
      })),
    }));
  }

  return out;
}
