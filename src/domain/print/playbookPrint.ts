import type { PlayDocument } from "@/domain/play/types";

export type PrintProductKind = "playsheet" | "wristband";

export type PlaysheetGrouping = "manual" | "formation" | "name" | "number" | "group";

export type WristbandSizePreset = "narrow" | "standard" | "wide";

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
  wristbandSize: WristbandSizePreset;
  playsPerBand: 1 | 2 | 3 | 4;
  wristbandShowName: boolean;
  wristbandShowNumber: boolean;
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
  wristbandSize: "standard",
  playsPerBand: 2,
  wristbandShowName: true,
  wristbandShowNumber: true,
  wristbandGrouping: "manual",
};

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

export function wristbandWidthMm(size: WristbandSizePreset): number {
  switch (size) {
    case "narrow":
      return 20;
    case "wide":
      return 32;
    default:
      return 25;
  }
}

/** Clone for PDF export only — does not replace on-screen document */
export function applyExportPresentation(doc: PlayDocument, run: PlaybookPrintRunConfig): PlayDocument {
  const out: PlayDocument = structuredClone(doc);
  out.printProfile.visibility.showNotes = run.includeCommentsAndNotes;
  if (run.product === "wristband") {
    if (!run.wristbandShowNumber) out.printProfile.visibility.showWristbandCode = false;
    if (!run.wristbandShowName) out.metadata.coachName = "\u200b";
  }
  return out;
}
