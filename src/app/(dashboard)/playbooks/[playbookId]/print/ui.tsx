"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  FileDown,
  ImagePlus,
  Lock,
  Maximize2,
  Printer,
  Save,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import type { PlaybookPrintPackRow } from "@/app/actions/plays";
import {
  applyExportPresentation,
  defaultPlaybookPrintRunConfig,
  normalizePrintRunConfig,
  sortNavPlaysForPrint,
  wristbandTilesPerBand,
  WATERMARK_MAX_PCT,
  WATERMARK_MIN_PCT,
  type PlaybookGroupRow,
  type PlaybookPrintRunConfig,
  type PlaysheetGrouping,
  type PrintProductKind,
} from "@/domain/print/playbookPrint";
import {
  compilePlaysheetPdfPages,
  compileWristbandGridSvg,
  compileWristbandPdfPages,
  compileWristbandSheetPdfPages,
  type PlaysheetHeader,
  type PlaysheetOptions,
  type Watermark,
  type WristbandGridOptions,
} from "@/domain/print/templates";
import { exportSvgsToMultiPagePdf, openSvgsInPrintTab } from "@/features/print/exportPdf";
import { PlaybookPrintRunControls } from "@/features/print/PlaybookPrintRunControls";
import {
  deletePrintPresetAction,
  deleteSystemPresetAction,
  listPrintPresetsAction,
  promoteToSystemPresetAction,
  savePrintPresetAction,
  type PrintPreset,
} from "@/app/actions/printPresets";
import { Badge, Button, Card, Input, SegmentedControl, useToast } from "@/components/ui";
import { cn } from "@/lib/utils";
import { track } from "@/lib/analytics/track";

type Props = {
  playbookId: string;
  initialPack: PlaybookPrintPackRow[];
  initialGroups: PlaybookGroupRow[];
  loadError: string | null;
  team: PlaysheetHeader;
  logoUrl: string | null;
  headCoachName: string | null;
  canUseWristbands: boolean;
  canRemovePlaysheetWatermark: boolean;
  /** When true, Print + PDF are intercepted with a "claim this example
   *  to export" modal so unauthenticated visitors see the full preview
   *  experience before being asked to convert. */
  isExamplePreview?: boolean;
  /** Site admin can promote user presets into system presets. */
  isSiteAdmin?: boolean;
};

type SortKey = "position" | "alpha" | "group" | "tag";
type TypeFilter = "all" | "offense" | "defense" | "special_teams";

/** Format dimension shown in the redesigned format picker. Maps 1:1 to
 *  PrintProductKind for now but is named user-side (Playbook → playbook,
 *  Call sheet → playsheet, Wrist coach → wristband). */
const FORMATS: ReadonlyArray<{
  id: PrintProductKind;
  title: string;
  blurb: string;
  locked?: (canUseWristbands: boolean) => boolean;
}> = [
  {
    id: "playsheet",
    title: "Call sheet",
    blurb: "Multi-column grid for game-day playcards.",
  },
  {
    id: "playbook",
    title: "Playbook",
    blurb: "One or two plays per page, big diagrams.",
  },
  {
    id: "wristband",
    title: "Wrist coach",
    blurb: "Compact tiles sized to a wristband.",
    locked: (can) => !can,
  },
];

function compareByWristbandNumber(a: PlaybookPrintPackRow, b: PlaybookPrintPackRow) {
  return a.nav.sort_order - b.nav.sort_order;
}

/**
 * Per-group, 1-based positions for plays already grouped contiguously by
 * group_id (i.e. after sortNavPlaysForPrint with grouping="group"). Mirrors
 * the playbook grid view's positionByPlayId so a coach printing the
 * Recommended group sees 01, 02, 03… instead of the absolute playbook
 * positions (which leave gaps when other groups are unselected).
 */
function computeGroupPositions(
  ordered: PlaybookPrintPackRow[],
): Map<string, number> {
  const m = new Map<string, number>();
  let lastGid: string | null | undefined = undefined;
  let counter = 0;
  for (const r of ordered) {
    const gid = r.nav.group_id ?? null;
    if (gid !== lastGid) {
      counter = 1;
      lastGid = gid;
    } else {
      counter++;
    }
    m.set(r.id, counter);
  }
  return m;
}

function resolveFooterText(
  template: string,
  playbookName: string,
  coachName: string | null,
): string {
  // Use a fixed locale so server and client format the same way — otherwise
  // the SVG footer ("Printed: May 4, 2026" vs "5/4/2026") triggers a
  // hydration mismatch that breaks event handlers on the entire client
  // subtree.
  const date = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  return template
    .replace(/\{playbook\}/gi, playbookName || "")
    .replace(/\{coach\}/gi, coachName || "")
    .replace(/\{date\}/gi, date);
}

export function PrintPlaybookClient({
  playbookId,
  initialPack,
  initialGroups,
  loadError,
  team,
  logoUrl,
  headCoachName,
  canUseWristbands,
  canRemovePlaysheetWatermark,
  isExamplePreview = false,
  isSiteAdmin = false,
}: Props) {
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [printing, startPrint] = useTransition();
  const [exampleGateOpen, setExampleGateOpen] = useState(false);
  const [exampleGateAttempt, setExampleGateAttempt] = useState<"print" | "pdf" | null>(
    null,
  );
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!isExamplePreview) return;
    track({
      event: "example_print_browse",
      target: playbookId,
      metadata: { playbook_id: playbookId },
    });
  }, [isExamplePreview, playbookId]);

  const [selected, setSelected] = useState<Set<string>>(() => {
    const fromUrl = searchParams.get("plays");
    if (fromUrl) {
      const ids = new Set(fromUrl.split(",").filter(Boolean));
      const ok = new Set(initialPack.filter((p) => ids.has(p.id)).map((p) => p.id));
      if (ok.size > 0) return ok;
    }
    return new Set(initialPack.map((p) => p.id));
  });
  const [config, setConfig] = useState<PlaybookPrintRunConfig>(defaultPlaybookPrintRunConfig);
  const [q, setQ] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("position");
  const [numberPlaysInOrder, setNumberPlaysInOrder] = useState<boolean>(false);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("offense");
  const [previewPage, setPreviewPage] = useState(0);
  const [wristbandPreviewMode, setWristbandPreviewMode] = useState<
    "card" | "sheet"
  >("card");
  const [fullscreen, setFullscreen] = useState(false);

  // Section open/close state for the redesigned panel. Plays + Format
  // default open; Customize is collapsed so most coaches never see the
  // low-level controls.
  const [playsOpen, setPlaysOpen] = useState(true);
  const [formatOpen, setFormatOpen] = useState(true);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [presetSaveName, setPresetSaveName] = useState("");

  // Promote-to-system dialog state. Captured thumbnail (PNG data URL) is
  // taken from the live preview SVG at the moment the admin opens the
  // dialog so the description always matches what they're looking at.
  const [promoteState, setPromoteState] = useState<{
    name: string;
    description: string;
    thumbnailDataUrl: string | null;
    presetId: string | null;
  } | null>(null);

  type TreeNode = { key: string; name: string; rows: PlaybookPrintPackRow[] };
  const tree: TreeNode[] = useMemo(() => {
    const s = q.trim().toLowerCase();
    const match = (r: PlaybookPrintPackRow) => {
      if (typeFilter !== "all" && r.nav.play_type !== typeFilter) return false;
      if (!s) return true;
      const n = r.nav;
      return (
        n.name.toLowerCase().includes(s) ||
        n.wristband_code.toLowerCase().includes(s) ||
        n.shorthand.toLowerCase().includes(s) ||
        n.formation_name.toLowerCase().includes(s) ||
        n.tags.some((t) => t.toLowerCase().includes(s))
      );
    };
    const filtered = initialPack.filter(match);
    const byName = (a: PlaybookPrintPackRow, b: PlaybookPrintPackRow) =>
      a.nav.name.localeCompare(b.nav.name, undefined, {
        numeric: true,
        sensitivity: "base",
      });

    if (sortBy === "position") {
      const rows = [...filtered].sort(compareByWristbandNumber);
      if (rows.length === 0) return [];
      return [{ key: "__all__", name: "All plays", rows }];
    }

    if (sortBy === "alpha") {
      const rows = [...filtered].sort(byName);
      if (rows.length === 0) return [];
      return [{ key: "__all__", name: "All plays", rows }];
    }

    if (sortBy === "tag") {
      const byKey = new Map<string, PlaybookPrintPackRow[]>();
      for (const r of filtered) {
        const tags = r.nav.tags && r.nav.tags.length > 0 ? r.nav.tags : [""];
        for (const t of tags) {
          const k = t || "__untagged__";
          const arr = byKey.get(k) ?? [];
          arr.push(r);
          byKey.set(k, arr);
        }
      }
      const names = [...byKey.keys()].sort((a, b) => {
        if (a === "__untagged__") return 1;
        if (b === "__untagged__") return -1;
        return a.localeCompare(b, undefined, { sensitivity: "base" });
      });
      return names.map((k) => ({
        key: `tag:${k}`,
        name: k === "__untagged__" ? "Untagged" : k,
        rows: [...(byKey.get(k) ?? [])].sort(byName),
      }));
    }

    const byKey = new Map<string, PlaybookPrintPackRow[]>();
    for (const r of filtered) {
      const k = r.nav.group_id ?? "__ungrouped__";
      const arr = byKey.get(k) ?? [];
      arr.push(r);
      byKey.set(k, arr);
    }
    const nodes: TreeNode[] = [];
    for (const g of initialGroups) {
      const rows = byKey.get(g.id);
      if (rows && rows.length > 0)
        nodes.push({ key: g.id, name: g.name, rows: [...rows].sort(byName) });
    }
    const ung = byKey.get("__ungrouped__");
    if (ung && ung.length > 0)
      nodes.push({ key: "__ungrouped__", name: "Ungrouped", rows: [...ung].sort(byName) });
    return nodes;
  }, [initialPack, initialGroups, q, sortBy, typeFilter]);

  const [userOpenGroups, setUserOpenGroups] = useState<Set<string>>(() => new Set());
  const autoOpenAll = q.trim().length > 0 || sortBy === "alpha";
  const openGroups = useMemo(
    () => (autoOpenAll ? new Set(tree.map((n) => n.key)) : userOpenGroups),
    [autoOpenAll, tree, userOpenGroups],
  );

  function toggleGroupOpen(k: string) {
    setUserOpenGroups((prev) => {
      const base = autoOpenAll ? new Set(tree.map((n) => n.key)) : prev;
      const next = new Set(base);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  function togglePlay(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleGroup(node: TreeNode) {
    const allOn = node.rows.every((r) => selected.has(r.id));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const r of node.rows) {
        if (allOn) next.delete(r.id);
        else next.add(r.id);
      }
      return next;
    });
  }

  function selectAllVisible(on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const node of tree) {
        for (const r of node.rows) {
          if (on) next.add(r.id);
          else next.delete(r.id);
        }
      }
      return next;
    });
  }

  const wristbandGridOpts: WristbandGridOptions = useMemo(
    () => ({
      widthIn: config.wristbandWidthIn,
      heightIn: config.wristbandHeightIn,
      layout: config.wristbandGridLayout,
      zoom: config.wristbandZoom,
      iconSize: config.wristbandIconSize,
      routeWeight: config.wristbandRouteWeight,
      arrowSize: config.wristbandArrowSize,
      labels: config.wristbandLabels,
      headerFontSize: config.wristbandHeaderFontSize,
      numberSize: config.wristbandNumberSize,
      numberPosition: config.wristbandNumberPosition,
      formationSize: config.wristbandFormationSize,
      formationPosition: config.wristbandFormationPosition,
      nameSize: config.wristbandNameSize,
      namePosition: config.wristbandNamePosition,
      labelWrap: config.wristbandLabelWrap,
      colorCoding: config.wristbandColorCoding,
      losIntensity: config.wristbandShowLos ? 0.5 : 0,
      yardMarkersIntensity: config.wristbandShowYardMarkers ? 0.3 : 0,
      borderThickness: config.wristbandBorderThickness,
      showPlayerLabels: config.wristbandShowPlayerLabels,
      playerOutline: config.wristbandPlayerOutline,
      showOpponents: config.showOpponents,
      cellPadding: config.wristbandCellPadding,
    }),
    [config],
  );

  // Playsheet & playbook share the playsheet renderer. The only difference
  // today is the column-count cap surfaced in the UI (1–3 vs 1–5).
  const playsheetOpts: PlaysheetOptions = useMemo(() => {
    return {
      columns: config.playsheetColumns,
      orientation: config.sheetOrientation,
      pageBreak: config.playsheetPageBreak,
      showNotes: config.playsheetShowNotes,
      noteLines: config.playsheetNoteLines,
      noteFontSize: config.playsheetNoteFontSize,
      noteVisualPlayers: config.playsheetNoteVisualPlayers,
      noteCompact: config.playsheetNoteCompact,
      cellPadding: config.playsheetCellPadding,
      cellHeightScale: config.playsheetCellHeightScale,
      iconSize: config.playsheetIconSize,
      routeWeight: config.playsheetRouteWeight,
      arrowSize: config.playsheetArrowSize,
      labels: config.playsheetLabels,
      headerFontSize: config.playsheetHeaderFontSize,
      numberSize: config.playsheetNumberSize,
      numberPosition: config.playsheetNumberPosition,
      formationSize: config.playsheetFormationSize,
      formationPosition: config.playsheetFormationPosition,
      nameSize: config.playsheetNameSize,
      namePosition: config.playsheetNamePosition,
      labelWrap: config.playsheetLabelWrap,
      colorCoding: config.playsheetColorCoding,
      losIntensity: config.playsheetLosIntensity,
      yardMarkersIntensity: config.playsheetYardMarkersIntensity,
      borderThickness: config.playsheetBorderThickness,
      borderDarkness: config.playsheetBorderDarkness,
      showPlayerLabels: config.playsheetShowPlayerLabels,
      playerOutline: config.playsheetPlayerOutline,
      showOpponents: config.showOpponents,
    };
  }, [config]);

  // svg2pdf / jsPDF don't honour CSS `mix-blend-mode`, so any non-transparent
  // pixels in the team logo render as an opaque box in the exported PDF.
  // Preprocess the logo through a canvas once: knock near-white pixels down
  // to alpha 0, so the watermark blends cleanly in both preview and PDF.
  const [alphaCache, setAlphaCache] = useState<{ src: string; value: string } | null>(null);
  useEffect(() => {
    if (!logoUrl) return;
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (cancelled) return;
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const px = data.data;
        for (let i = 0; i < px.length; i += 4) {
          const r = px[i]!;
          const g = px[i + 1]!;
          const b = px[i + 2]!;
          const maxC = Math.max(r, g, b);
          if (maxC > 230) {
            const t = (maxC - 230) / 25;
            px[i + 3] = Math.round(px[i + 3]! * (1 - Math.min(1, t)));
          }
        }
        ctx.putImageData(data, 0, 0);
        setAlphaCache({ src: logoUrl, value: canvas.toDataURL("image/png") });
      } catch {
        setAlphaCache({ src: logoUrl, value: logoUrl });
      }
    };
    img.onerror = () => {
      if (!cancelled) setAlphaCache({ src: logoUrl, value: logoUrl });
    };
    img.src = logoUrl;
    return () => {
      cancelled = true;
    };
  }, [logoUrl]);
  const alphaKeyedLogoUrl =
    logoUrl && alphaCache && alphaCache.src === logoUrl ? alphaCache.value : null;

  const watermark: Watermark | null = useMemo(() => {
    if (!canRemovePlaysheetWatermark) return null;
    if (!config.watermarkEnabled) return null;
    const src = alphaKeyedLogoUrl ?? logoUrl;
    if (!src) return null;
    const pct = Math.max(
      WATERMARK_MIN_PCT,
      Math.min(WATERMARK_MAX_PCT, config.watermarkOpacityPct),
    );
    const scale = Math.max(0.1, Math.min(1, config.watermarkScale ?? 0.6));
    return { logoUrl: src, opacity: pct / 100, scale };
  }, [
    canRemovePlaysheetWatermark,
    config.watermarkEnabled,
    config.watermarkOpacityPct,
    config.watermarkScale,
    alphaKeyedLogoUrl,
    logoUrl,
  ]);

  const playbookPositionById = useMemo(() => {
    const byType = new Map<string, typeof initialPack>();
    for (const r of initialPack) {
      const k = r.nav.play_type;
      const arr = byType.get(k);
      if (arr) arr.push(r);
      else byType.set(k, [r]);
    }
    const m = new Map<string, number>();
    for (const [, arr] of byType) {
      arr.sort((a, b) => a.nav.sort_order - b.nav.sort_order);
      arr.forEach((r, i) => m.set(r.id, i + 1));
    }
    return m;
  }, [initialPack]);

  const previewPages = useMemo<string[]>(() => {
    const chosen = initialPack.filter(
      (r) =>
        selected.has(r.id) &&
        (typeFilter === "all" || r.nav.play_type === typeFilter),
    );
    const pool = chosen.length > 0 ? chosen : initialPack.slice(0, 1);
    if (config.product === "wristband") {
      const wbGrouping: PlaysheetGrouping =
        sortBy === "alpha" ? "name" : sortBy === "group" ? "group" : "name";
      const wbOrdered =
        sortBy === "position"
          ? [...pool].sort(compareByWristbandNumber)
          : (() => {
              const navOrder = sortNavPlaysForPrint(
                pool.map((r) => r.nav),
                wbGrouping,
              );
              return navOrder
                .map((n) => pool.find((r) => r.id === n.id))
                .filter((x): x is PlaybookPrintPackRow => x != null);
            })();
      const wbGroupPos =
        sortBy === "group" ? computeGroupPositions(wbOrdered) : null;
      const docs = wbOrdered.map((r, i) => {
        const d = applyExportPresentation(r.document, config);
        const pos = playbookPositionById.get(r.id);
        const groupIdx = wbGroupPos?.get(r.id) ?? null;
        const label = numberPlaysInOrder
          ? String(i + 1).padStart(2, "0")
          : groupIdx != null
            ? String(groupIdx).padStart(2, "0")
            : pos != null
              ? String(pos).padStart(2, "0")
              : d.metadata.wristbandCode;
        d.metadata = { ...d.metadata, wristbandCode: label };
        if (d.metadata.coachName !== "​") {
          d.metadata = { ...d.metadata, coachName: r.nav.name };
        }
        if (numberPlaysInOrder) d.printProfile.visibility.showWristbandCode = true;
        return d;
      });
      if (docs.length === 0) return [];
      if (wristbandPreviewMode === "sheet") {
        return compileWristbandSheetPdfPages(
          docs,
          wristbandGridOpts,
          config.wristbandCopiesPerSheet,
          watermark,
        );
      }
      const tiles = wristbandTilesPerBand(config.wristbandGridLayout);
      const pages: string[] = [];
      for (let i = 0; i < docs.length; i += tiles) {
        pages.push(
          compileWristbandGridSvg(docs.slice(i, i + tiles), wristbandGridOpts, watermark)
            .svgMarkup,
        );
      }
      return pages;
    }
    const printGrouping: PlaysheetGrouping =
      sortBy === "alpha" ? "name" : sortBy === "group" ? "group" : "name";
    const ordered =
      sortBy === "position"
        ? [...pool].sort(compareByWristbandNumber)
        : (() => {
            const navOrder = sortNavPlaysForPrint(
              pool.map((r) => r.nav),
              printGrouping,
            );
            return navOrder
              .map((n) => pool.find((r) => r.id === n.id))
              .filter((x): x is PlaybookPrintPackRow => x != null);
          })();
    const playsheetGroupPos =
      sortBy === "group" ? computeGroupPositions(ordered) : null;
    const docs = ordered.map((r, i) => {
      const d = applyExportPresentation(r.document, config);
      const pos = playbookPositionById.get(r.id);
      const groupIdx = playsheetGroupPos?.get(r.id) ?? null;
      const label = numberPlaysInOrder
        ? String(i + 1).padStart(2, "0")
        : groupIdx != null
          ? String(groupIdx).padStart(2, "0")
          : pos != null
            ? String(pos).padStart(2, "0")
            : d.metadata.wristbandCode;
      d.metadata = { ...d.metadata, wristbandCode: label };
      if (d.metadata.coachName !== "​") {
        d.metadata = { ...d.metadata, coachName: r.nav.name };
      }
      if (numberPlaysInOrder) d.printProfile.visibility.showWristbandCode = true;
      return d;
    });
    const groupKeys = ordered.map((r) => r.nav.group_id ?? null);
    return compilePlaysheetPdfPages(
      docs,
      playsheetOpts,
      groupKeys,
      config.playsheetIncludeHeader ? team : null,
      watermark,
      !canRemovePlaysheetWatermark,
      config.playsheetIncludeFooter
        ? {
            text: resolveFooterText(config.playsheetFooterText, team.teamName, headCoachName),
            accentColor: team.accentColor,
          }
        : null,
    );
  }, [initialPack, selected, typeFilter, sortBy, numberPlaysInOrder, config, wristbandGridOpts, playsheetOpts, team, watermark, playbookPositionById, wristbandPreviewMode, headCoachName, canRemovePlaysheetWatermark]);

  const pageCount = previewPages.length;
  const currentPageIdx = Math.min(previewPage, Math.max(0, pageCount - 1));
  const stripXmlProlog = (s: string) => s.replace(/^\s*<\?xml[^?]*\?>\s*/, "");
  const stripSvgSize = (s: string) =>
    s.replace(/<svg\b([^>]*)>/, (_m, attrs: string) =>
      `<svg${attrs.replace(/\s(width|height)="[^"]*"/g, "")}>`,
    );
  const previewHtml = (s: string) => stripSvgSize(stripXmlProlog(s));
  const isPortrait = config.sheetOrientation === "portrait";
  const pageAspect =
    config.product === "wristband"
      ? wristbandPreviewMode === "sheet"
        ? "215.9 / 279.4"
        : `${config.wristbandWidthIn} / ${config.wristbandHeightIn}`
      : isPortrait
        ? "215.9 / 279.4"
        : "279.4 / 215.9";

  // Ref to the live-preview container so we can capture its current SVG
  // markup as a PNG for system-preset thumbnails.
  const previewSvgRef = useRef<HTMLElement | null>(null);

  async function compileForExport(): Promise<string[] | null> {
    const rows = initialPack.filter(
      (r) =>
        selected.has(r.id) &&
        (typeFilter === "all" || r.nav.play_type === typeFilter),
    );
    if (rows.length === 0) {
      toast("Select at least one play to print", "error");
      return null;
    }
    const grouping: PlaysheetGrouping =
      sortBy === "alpha" ? "name" : sortBy === "group" ? "group" : "name";
    const ordered =
      sortBy === "position"
        ? [...rows].sort(compareByWristbandNumber)
        : (() => {
            const navOrder = sortNavPlaysForPrint(
              rows.map((r) => r.nav),
              grouping,
            );
            return navOrder
              .map((n) => rows.find((r) => r.id === n.id))
              .filter((x): x is PlaybookPrintPackRow => x != null);
          })();
    const exportGroupPos =
      sortBy === "group" ? computeGroupPositions(ordered) : null;
    const docs = ordered.map((r, i) => {
      const d = applyExportPresentation(r.document, config);
      const pos = playbookPositionById.get(r.id);
      const groupIdx = exportGroupPos?.get(r.id) ?? null;
      const label = numberPlaysInOrder
        ? String(i + 1).padStart(2, "0")
        : groupIdx != null
          ? String(groupIdx).padStart(2, "0")
          : pos != null
            ? String(pos).padStart(2, "0")
            : d.metadata.wristbandCode;
      d.metadata = { ...d.metadata, wristbandCode: label };
      if (d.metadata.coachName !== "​") {
        d.metadata = { ...d.metadata, coachName: r.nav.name };
      }
      if (numberPlaysInOrder) d.printProfile.visibility.showWristbandCode = true;
      return d;
    });

    if (config.product === "playsheet" || config.product === "playbook") {
      const groupKeys = ordered.map((r) => r.nav.group_id ?? null);
      return compilePlaysheetPdfPages(
        docs,
        playsheetOpts,
        groupKeys,
        config.playsheetIncludeHeader ? team : null,
        watermark,
        !canRemovePlaysheetWatermark,
        config.playsheetIncludeFooter
          ? {
              text: resolveFooterText(
                config.playsheetFooterText,
                team.teamName,
                headCoachName,
              ),
              accentColor: team.accentColor,
            }
          : null,
      );
    }
    if (config.wristbandSheet === "sheet") {
      return compileWristbandSheetPdfPages(
        docs,
        wristbandGridOpts,
        config.wristbandCopiesPerSheet,
        watermark,
      );
    }
    return compileWristbandPdfPages(docs, wristbandGridOpts, watermark);
  }

  const wristbandLocked = config.product === "wristband" && !canUseWristbands;

  function exportPdf() {
    if (isExamplePreview) {
      track({
        event: "example_print_export_attempt",
        target: "pdf",
        metadata: { playbook_id: playbookId, product: config.product },
      });
      setExampleGateAttempt("pdf");
      setExampleGateOpen(true);
      return;
    }
    if (wristbandLocked) {
      toast("Wristbands are a Team Coach feature. See /pricing to upgrade.", "error");
      return;
    }
    startTransition(async () => {
      const pages = await compileForExport();
      if (!pages) return;
      const label =
        config.product === "wristband"
          ? "wristband"
          : config.product === "playbook"
            ? "playbook"
            : "playcard";
      const name = `${label}-${playbookId.slice(0, 8)}.pdf`;
      await exportSvgsToMultiPagePdf(pages, name);
      toast(
        `${
          config.product === "wristband"
            ? "Wrist coach"
            : config.product === "playbook"
              ? "Playbook"
              : "Playcard"
        } PDF exported`,
        "success",
      );
    });
  }

  function printNow() {
    if (isExamplePreview) {
      track({
        event: "example_print_export_attempt",
        target: "print",
        metadata: { playbook_id: playbookId, product: config.product },
      });
      setExampleGateAttempt("print");
      setExampleGateOpen(true);
      return;
    }
    if (wristbandLocked) {
      toast("Wristbands are a Team Coach feature. See /pricing to upgrade.", "error");
      return;
    }
    startPrint(async () => {
      const pages = await compileForExport();
      if (!pages) return;
      await openSvgsInPrintTab(pages);
    });
  }

  // Capture the current preview SVG → 320×240 PNG data URL so the admin
  // promote dialog can show a live thumbnail and persist it on the row.
  async function capturePreviewThumbnail(): Promise<string | null> {
    const node = previewSvgRef.current;
    if (!node) return null;
    const svg = node.querySelector("svg");
    if (!svg) return null;
    try {
      const cloned = svg.cloneNode(true) as SVGSVGElement;
      // Ensure SVG namespace is preserved for serialization.
      cloned.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      const serializer = new XMLSerializer();
      const svgStr = serializer.serializeToString(cloned);
      const blob = new Blob([svgStr], { type: "image/svg+xml" });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.crossOrigin = "anonymous";
      const loaded = new Promise<void>((res, rej) => {
        img.onload = () => res();
        img.onerror = (e) => rej(e);
      });
      img.src = url;
      await loaded;
      const w = 320;
      const h = 240;
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        return null;
      }
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
      // Fit the page-sized SVG into 320×240 preserving aspect ratio.
      const srcW = img.naturalWidth || w;
      const srcH = img.naturalHeight || h;
      const srcRatio = srcW / srcH;
      const dstRatio = w / h;
      let dW = w;
      let dH = h;
      if (srcRatio > dstRatio) {
        dH = w / srcRatio;
      } else {
        dW = h * srcRatio;
      }
      const dx = (w - dW) / 2;
      const dy = (h - dH) / 2;
      ctx.drawImage(img, dx, dy, dW, dH);
      URL.revokeObjectURL(url);
      return canvas.toDataURL("image/png");
    } catch {
      return null;
    }
  }

  async function openPromoteDialog(args: {
    name: string;
    description?: string;
    presetId?: string | null;
  }) {
    const thumb = await capturePreviewThumbnail();
    setPromoteState({
      name: args.name,
      description: args.description ?? "",
      thumbnailDataUrl: thumb,
      presetId: args.presetId ?? null,
    });
  }

  if (loadError) {
    return (
      <p className="text-sm text-danger">Could not load playbook to print: {loadError}</p>
    );
  }

  if (initialPack.length === 0) {
    return (
      <Card className="p-6 text-center">
        <p className="text-sm text-muted">This playbook has no plays to print yet.</p>
      </Card>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-3 lg:[height:calc(100vh-180px)] lg:min-h-[520px]">
        <Card className="flex flex-wrap items-center justify-between gap-2 p-2">
          <p className="px-1 text-sm font-semibold text-foreground">
            {selected.size} of {initialPack.length} play{initialPack.length === 1 ? "" : "s"} selected
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="secondary"
              leftIcon={wristbandLocked ? Lock : Printer}
              onClick={printNow}
              loading={printing}
              disabled={wristbandLocked}
              title={wristbandLocked ? "Wristbands require a Coach subscription" : undefined}
            >
              Print
            </Button>
            <Button
              variant="primary"
              leftIcon={wristbandLocked ? Lock : FileDown}
              onClick={exportPdf}
              loading={pending}
              disabled={wristbandLocked}
              title={wristbandLocked ? "Wristbands require a Coach subscription" : undefined}
            >
              PDF
            </Button>
          </div>
        </Card>

        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(340px,38%)_1fr]">
          <div className="min-h-0 space-y-3 overflow-y-auto pr-1">
            <Section
              title="1. Plays"
              subtitle={`${selected.size} selected`}
              open={playsOpen}
              onToggle={() => setPlaysOpen((v) => !v)}
            >
              <PlaysPanel
                tree={tree}
                openGroups={openGroups}
                onToggleGroupOpen={toggleGroupOpen}
                togglePlay={togglePlay}
                toggleGroup={toggleGroup}
                selectAllVisible={selectAllVisible}
                selected={selected}
                initialPackCount={initialPack.length}
                q={q}
                setQ={setQ}
                typeFilter={typeFilter}
                setTypeFilter={setTypeFilter}
                sortBy={sortBy}
                setSortBy={setSortBy}
                numberPlaysInOrder={numberPlaysInOrder}
                setNumberPlaysInOrder={setNumberPlaysInOrder}
                playbookPositionById={playbookPositionById}
              />
            </Section>

            <Section
              title="2. Format & preset"
              subtitle={FORMATS.find((f) => f.id === config.product)?.title}
              open={formatOpen}
              onToggle={() => setFormatOpen((v) => !v)}
            >
              <FormatAndPresetPanel
                config={config}
                onConfigChange={setConfig}
                canUseWristbands={canUseWristbands}
                isSiteAdmin={isSiteAdmin}
                onPromote={(name, description, presetId) =>
                  openPromoteDialog({ name, description, presetId })
                }
                presetSaveName={presetSaveName}
                setPresetSaveName={setPresetSaveName}
              />
            </Section>

            <Section
              title="3. Customize (advanced)"
              subtitle={customizeOpen ? "Open" : "Closed"}
              open={customizeOpen}
              onToggle={() => setCustomizeOpen((v) => !v)}
              icon={Settings2}
            >
              <CustomizePanel
                config={config}
                setConfig={setConfig}
                canUseWristbands={canUseWristbands}
                canRemovePlaysheetWatermark={canRemovePlaysheetWatermark}
                logoUrl={logoUrl}
              />
            </Section>
          </div>

          <div className="flex min-h-0 flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              {config.product === "wristband" ? (
                <div className="min-w-0">
                  <SegmentedControl
                    options={[
                      { value: "card" as const, label: "Individual band" },
                      { value: "sheet" as const, label: "On paper" },
                    ]}
                    value={wristbandPreviewMode}
                    onChange={(v) => {
                      setWristbandPreviewMode(v);
                      setPreviewPage(0);
                    }}
                  />
                </div>
              ) : (
                <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-muted">
                  {`Live preview · ${config.playsheetColumns} col${config.playsheetColumns === 1 ? "" : "s"} · ${config.sheetOrientation}${config.playsheetPageBreak === "group" ? " · per-group pages" : ""}`}
                </p>
              )}
              {pageCount > 0 && (
                <div className="flex shrink-0 items-center gap-2">
                  {pageCount > 1 && (
                    <div className="flex items-center gap-1 text-xs text-muted">
                      <button
                        type="button"
                        className="rounded p-1 hover:bg-surface-raised disabled:opacity-40"
                        disabled={currentPageIdx === 0}
                        onClick={() => setPreviewPage((p) => Math.max(0, p - 1))}
                        aria-label="Previous page"
                      >
                        <ChevronLeft className="size-4" />
                      </button>
                      <span className="tabular-nums">
                        {currentPageIdx + 1} / {pageCount}
                      </span>
                      <button
                        type="button"
                        className="rounded p-1 hover:bg-surface-raised disabled:opacity-40"
                        disabled={currentPageIdx >= pageCount - 1}
                        onClick={() =>
                          setPreviewPage((p) => Math.min(pageCount - 1, p + 1))
                        }
                        aria-label="Next page"
                      >
                        <ChevronRight className="size-4" />
                      </button>
                    </div>
                  )}
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-muted hover:bg-surface-raised disabled:opacity-50"
                    onClick={() => {
                      if (wristbandLocked) return;
                      setFullscreen(true);
                    }}
                    disabled={wristbandLocked}
                    aria-label="Expand preview"
                  >
                    {wristbandLocked ? <Lock className="size-3.5" /> : <Maximize2 className="size-3.5" />}
                    Expand
                  </button>
                </div>
              )}
            </div>
            {pageCount > 0 ? (
              <div className="relative flex min-h-0 flex-1 justify-center overflow-auto">
                <button
                  ref={(el) => {
                    previewSvgRef.current = el;
                  }}
                  type="button"
                  className={cn(
                    "block h-fit w-full shrink-0 overflow-hidden bg-white text-left shadow-elevated ring-1 ring-black/10 [&_svg]:block [&_svg]:h-full [&_svg]:w-full",
                    wristbandLocked && "pointer-events-none select-none blur-md",
                  )}
                  style={{ aspectRatio: pageAspect }}
                  onClick={() => {
                    if (wristbandLocked) return;
                    setFullscreen(true);
                  }}
                  aria-label="Open preview fullscreen"
                  dangerouslySetInnerHTML={{
                    __html: previewHtml(
                      previewPages[currentPageIdx] ?? previewPages[0] ?? "",
                    ),
                  }}
                />
                {wristbandLocked ? (
                  <div className="pointer-events-none absolute inset-0 flex items-start justify-center pt-8">
                    <div className="pointer-events-auto flex max-w-xs flex-col items-center gap-3 rounded-xl bg-surface-raised/95 p-5 text-center shadow-lg ring-1 ring-border backdrop-blur">
                      <Lock className="size-6 text-muted" />
                      <p className="text-sm font-semibold text-foreground">
                        Wristbands are a Team Coach feature
                      </p>
                      <p className="text-xs text-muted">
                        Upgrade to Team Coach ($9/mo or $99/yr) to print wrist coaches. Playsheets stay free.
                      </p>
                      <Link
                        href="/pricing"
                        data-web-only
                        className="inline-flex items-center rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-hover"
                      >
                        Upgrade
                      </Link>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-border p-8">
                <p className="text-sm text-muted">Select a play to preview.</p>
              </div>
            )}
          </div>
        </div>

        {fullscreen && pageCount > 0 && (
          <div
            className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur"
            role="dialog"
            aria-modal="true"
            onKeyDown={(e) => {
              if (e.key === "Escape") setFullscreen(false);
            }}
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                Preview · {pageCount} page{pageCount === 1 ? "" : "s"}
              </p>
              <button
                type="button"
                className="rounded p-1.5 text-muted hover:bg-surface-raised hover:text-foreground"
                onClick={() => setFullscreen(false)}
                aria-label="Close preview"
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="flex-1 space-y-6 overflow-auto p-6 [&_svg]:h-auto [&_svg]:w-full [&_svg]:max-w-[900px]">
              {previewPages.map((svg, i) => (
                <div
                  key={i}
                  className="mx-auto w-full max-w-[900px] rounded-xl border border-border bg-surface-raised p-4"
                  dangerouslySetInnerHTML={{ __html: previewHtml(svg) }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {promoteState && (
        <PromoteDialog
          state={promoteState}
          onClose={() => setPromoteState(null)}
          onPromoted={() => {
            setPromoteState(null);
            // Notify the format panel to reload presets.
            window.dispatchEvent(new CustomEvent("print-presets:refresh"));
          }}
          config={config}
        />
      )}

      {isExamplePreview && exampleGateOpen && (
        <ExamplePrintGateModal
          playbookId={playbookId}
          attempt={exampleGateAttempt}
          product={config.product}
          onClose={() => setExampleGateOpen(false)}
        />
      )}
    </>
  );
}

// ── Section wrapper ──────────────────────────────────────────────────

function Section({
  title,
  subtitle,
  open,
  onToggle,
  icon: Icon,
  children,
}: {
  title: string;
  subtitle?: string;
  open: boolean;
  onToggle: () => void;
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <Card className="overflow-hidden p-0">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-raised"
        onClick={onToggle}
        aria-expanded={open}
      >
        <div className="flex items-center gap-2">
          {Icon ? <Icon className="size-4 text-muted" /> : null}
          <p className="text-sm font-semibold text-foreground">{title}</p>
          {subtitle ? (
            <span className="text-xs text-muted">· {subtitle}</span>
          ) : null}
        </div>
        {open ? <ChevronUp className="size-4 text-muted" /> : <ChevronDown className="size-4 text-muted" />}
      </button>
      {open && <div className="border-t border-border px-4 py-3">{children}</div>}
    </Card>
  );
}

// ── Plays panel ──────────────────────────────────────────────────────

type PlaysPanelProps = {
  tree: { key: string; name: string; rows: PlaybookPrintPackRow[] }[];
  openGroups: Set<string>;
  onToggleGroupOpen: (k: string) => void;
  togglePlay: (id: string) => void;
  toggleGroup: (node: { key: string; name: string; rows: PlaybookPrintPackRow[] }) => void;
  selectAllVisible: (on: boolean) => void;
  selected: Set<string>;
  initialPackCount: number;
  q: string;
  setQ: (v: string) => void;
  typeFilter: TypeFilter;
  setTypeFilter: (v: TypeFilter) => void;
  sortBy: SortKey;
  setSortBy: (v: SortKey) => void;
  numberPlaysInOrder: boolean;
  setNumberPlaysInOrder: (v: boolean) => void;
  playbookPositionById: Map<string, number>;
};

function PlaysPanel(props: PlaysPanelProps) {
  const {
    tree,
    openGroups,
    onToggleGroupOpen,
    togglePlay,
    toggleGroup,
    selectAllVisible,
    selected,
    initialPackCount,
    q,
    setQ,
    typeFilter,
    setTypeFilter,
    sortBy,
    setSortBy,
    numberPlaysInOrder,
    setNumberPlaysInOrder,
    playbookPositionById,
  } = props;

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
          {selected.size}/{initialPackCount} selected
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            className="text-xs font-medium text-primary hover:underline"
            onClick={() => selectAllVisible(true)}
          >
            Select shown
          </button>
          <button
            type="button"
            className="text-xs font-medium text-primary hover:underline"
            onClick={() => selectAllVisible(false)}
          >
            Clear shown
          </button>
        </div>
      </div>
      <div className="mt-3">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter plays…" />
      </div>
      <div className="mt-3 space-y-2">
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
            Type
          </p>
          <SegmentedControl
            options={[
              { value: "all" as const, label: "All" },
              { value: "offense" as const, label: "Offense" },
              { value: "defense" as const, label: "Defense" },
              { value: "special_teams" as const, label: "ST" },
            ]}
            value={typeFilter}
            onChange={setTypeFilter}
          />
        </div>
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
            Sort by
          </p>
          <SegmentedControl
            options={[
              { value: "position" as const, label: "#" },
              { value: "alpha" as const, label: "A–Z" },
              { value: "group" as const, label: "Group" },
              { value: "tag" as const, label: "Tag" },
            ]}
            value={sortBy}
            onChange={setSortBy}
          />
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-foreground">
          <input
            type="checkbox"
            checked={numberPlaysInOrder}
            onChange={(e) => setNumberPlaysInOrder(e.target.checked)}
            className="size-4 accent-primary"
          />
          Number plays in order
          <span className="text-muted">(01–{String(selected.size).padStart(2, "0")})</span>
        </label>
      </div>
      <div className="mt-3 space-y-1">
        {tree.length === 0 && (
          <p className="py-3 text-center text-xs text-muted">No plays match.</p>
        )}
        {tree.map((node) => {
          const allOn = node.rows.every((r) => selected.has(r.id));
          const someOn = !allOn && node.rows.some((r) => selected.has(r.id));
          const expanded = openGroups.has(node.key);
          return (
            <div key={node.key} className="rounded border border-border/60">
              <div className="flex items-center gap-2 px-2 py-1.5">
                <button
                  type="button"
                  onClick={() => onToggleGroupOpen(node.key)}
                  className="text-muted hover:text-foreground"
                  aria-label={expanded ? "Collapse group" : "Expand group"}
                >
                  {expanded ? (
                    <ChevronDown className="size-4" />
                  ) : (
                    <ChevronRight className="size-4" />
                  )}
                </button>
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={allOn}
                  ref={(el) => {
                    if (el) el.indeterminate = someOn;
                  }}
                  onChange={() => toggleGroup(node)}
                />
                <button
                  type="button"
                  onClick={() => onToggleGroupOpen(node.key)}
                  className="flex-1 text-left text-sm font-medium text-foreground"
                >
                  {node.name}
                </button>
                <span className="text-xs text-muted">
                  {node.rows.filter((r) => selected.has(r.id)).length}/{node.rows.length}
                </span>
              </div>
              {expanded && (
                <ul className="divide-y divide-border/50 border-t border-border/50">
                  {node.rows.map((r, i) => {
                    const on = selected.has(r.id);
                    return (
                      <li key={r.id}>
                        <label className="flex cursor-pointer items-start gap-2 px-3 py-1.5 pl-9 text-sm">
                          <input
                            type="checkbox"
                            className="mt-0.5 size-4 accent-primary"
                            checked={on}
                            onChange={() => togglePlay(r.id)}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="truncate font-medium text-foreground">
                                {r.nav.name}
                              </span>
                              {(() => {
                                // When sorted by group, mirror the
                                // playbook grid: number plays
                                // consecutively within each group
                                // node. Otherwise fall back to the
                                // per-type playbook position.
                                const label =
                                  sortBy === "group"
                                    ? String(i + 1).padStart(2, "0")
                                    : (() => {
                                        const pos = playbookPositionById.get(r.id);
                                        return pos != null
                                          ? String(pos).padStart(2, "0")
                                          : r.nav.wristband_code;
                                      })();
                                return label ? <Badge variant="primary">{label}</Badge> : null;
                              })()}
                            </div>
                            {r.nav.formation_name && (
                              <div className="mt-0.5 text-xs text-muted">
                                {r.nav.formation_name}
                              </div>
                            )}
                          </div>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Format & preset panel ────────────────────────────────────────────

function FormatAndPresetPanel({
  config,
  onConfigChange,
  canUseWristbands,
  isSiteAdmin,
  onPromote,
  presetSaveName,
  setPresetSaveName,
}: {
  config: PlaybookPrintRunConfig;
  onConfigChange: (cfg: PlaybookPrintRunConfig) => void;
  canUseWristbands: boolean;
  isSiteAdmin: boolean;
  onPromote: (name: string, description: string, presetId: string | null) => void;
  presetSaveName: string;
  setPresetSaveName: (v: string) => void;
}) {
  const { toast } = useToast();
  const [presets, setPresets] = useState<PrintPreset[] | null>(null);
  const [busy, startBusy] = useTransition();

  const refreshPresets = async () => {
    const res = await listPrintPresetsAction();
    if (res.ok) setPresets(res.presets);
    else setPresets([]);
  };

  useEffect(() => {
    refreshPresets();
    const onRefresh = () => {
      refreshPresets();
    };
    window.addEventListener("print-presets:refresh", onRefresh);
    return () => window.removeEventListener("print-presets:refresh", onRefresh);
  }, []);

  function applyPreset(p: PrintPreset) {
    onConfigChange(
      normalizePrintRunConfig({ ...defaultPlaybookPrintRunConfig, ...p.config }),
    );
    toast(`Applied "${p.name}"`, "success");
  }

  function savePreset() {
    const n = presetSaveName.trim();
    if (!n) {
      toast("Name required", "error");
      return;
    }
    startBusy(async () => {
      const res = await savePrintPresetAction(n, config);
      if (!res.ok) {
        toast(res.error, "error");
        return;
      }
      setPresetSaveName("");
      await refreshPresets();
      toast("Preset saved", "success");
    });
  }

  function removeUserPreset(id: string) {
    startBusy(async () => {
      const res = await deletePrintPresetAction(id);
      if (!res.ok) {
        toast(res.error, "error");
        return;
      }
      await refreshPresets();
    });
  }

  function removeSystemPreset(id: string) {
    if (!confirm("Remove this system preset for everyone?")) return;
    startBusy(async () => {
      const res = await deleteSystemPresetAction(id);
      if (!res.ok) {
        toast(res.error, "error");
        return;
      }
      await refreshPresets();
    });
  }

  // Filter presets by current format. A preset's `product` field carries the
  // format it was saved against; absent (legacy) presets are bucketed by
  // their config.product.
  const forCurrentFormat = (presets ?? []).filter(
    (p) => (p.product ?? p.config.product) === config.product,
  );
  const systemPresets = forCurrentFormat.filter((p) => p.kind === "system");
  const userPresets = forCurrentFormat.filter((p) => p.kind === "user");

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
          Format
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {FORMATS.map((f) => {
            const active = config.product === f.id;
            const locked = f.locked?.(canUseWristbands) ?? false;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => {
                  // Playbook format caps columns at 3; carry over from a wider
                  // call-sheet config by clamping rather than resetting.
                  const next = { ...config, product: f.id };
                  if (f.id === "playbook" && next.playsheetColumns > 3) {
                    next.playsheetColumns = 3;
                  }
                  onConfigChange(next);
                }}
                className={cn(
                  "rounded-lg border p-3 text-left transition-colors",
                  active
                    ? "border-primary bg-primary/5 ring-2 ring-primary/30"
                    : "border-border bg-surface-raised hover:bg-surface-inset",
                  locked && "opacity-70",
                )}
              >
                <div className="flex items-center gap-1.5">
                  {active ? (
                    <Check className="size-4 text-primary" aria-hidden />
                  ) : null}
                  <p className="text-sm font-semibold text-foreground">{f.title}</p>
                  {locked ? (
                    <Lock className="ml-auto size-3.5 text-muted" aria-hidden />
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-muted">{f.blurb}</p>
              </button>
            );
          })}
        </div>
      </div>


      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
            Presets
          </p>
          <p className="text-[11px] text-muted">
            Pick one to apply. Edits don't change the preset.
          </p>
        </div>
        {presets == null ? (
          <p className="text-xs text-muted">Loading presets…</p>
        ) : forCurrentFormat.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted">
            No presets for this format yet. Customize below and save one.
          </p>
        ) : (
          <div className="rounded-lg border border-border bg-surface-inset/40">
            <ul
              className="max-h-[min(40vh,260px)] space-y-1.5 overflow-y-auto p-1.5"
              data-preset-scroll
            >
              {systemPresets.map((p) => (
                <PresetRow
                  key={p.id}
                  preset={p}
                  onApply={() => applyPreset(p)}
                  onRemove={isSiteAdmin ? () => removeSystemPreset(p.id) : null}
                  onPromote={null}
                  badge="System"
                />
              ))}
              {userPresets.map((p) => (
                <PresetRow
                  key={p.id}
                  preset={p}
                  onApply={() => applyPreset(p)}
                  onRemove={() => removeUserPreset(p.id)}
                  onPromote={
                    isSiteAdmin ? () => onPromote(p.name, "", p.id) : null
                  }
                />
              ))}
            </ul>
            {forCurrentFormat.length > 4 && (
              <p className="border-t border-border px-3 py-1.5 text-[11px] text-muted">
                {forCurrentFormat.length} presets · scroll to see more
              </p>
            )}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-border bg-surface-inset p-3">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
          Save current settings as a preset
        </p>
        <div className="flex gap-2">
          <Input
            value={presetSaveName}
            onChange={(e) => setPresetSaveName(e.target.value)}
            placeholder='e.g. "Small wristbands"'
            className="flex-1"
          />
          <Button variant="secondary" leftIcon={Save} onClick={savePreset} loading={busy}>
            Save
          </Button>
          {isSiteAdmin && (
            <Button
              variant="secondary"
              leftIcon={ShieldCheck}
              onClick={() => onPromote(presetSaveName.trim() || "New system preset", "", null)}
              title="Promote current settings into a system preset"
            >
              System…
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function PresetRow({
  preset,
  onApply,
  onRemove,
  onPromote,
  badge,
}: {
  preset: PrintPreset;
  onApply: () => void;
  onRemove: (() => void) | null;
  onPromote: (() => void) | null;
  badge?: string;
}) {
  return (
    <li className="flex items-center gap-2 rounded-lg border border-border bg-surface-raised px-2 py-1.5">
      {preset.thumbnailUrl ? (
        <img
          src={preset.thumbnailUrl}
          alt=""
          title={preset.description ?? undefined}
          className="size-12 shrink-0 rounded border border-border bg-white object-cover"
        />
      ) : (
        <div className="size-12 shrink-0 rounded border border-dashed border-border" />
      )}
      <button
        type="button"
        onClick={onApply}
        title={preset.description ?? undefined}
        className="min-w-0 flex-1 truncate text-left text-sm font-medium text-foreground hover:text-primary"
      >
        {preset.name}
        {badge ? (
          <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
            {badge}
          </span>
        ) : null}
        {preset.description ? (
          <span className="block truncate text-xs font-normal text-muted">
            {preset.description}
          </span>
        ) : null}
      </button>
      <div className="flex shrink-0 items-center gap-1">
        {onPromote && (
          <button
            type="button"
            onClick={onPromote}
            className="rounded p-1.5 text-muted hover:bg-surface-inset hover:text-primary"
            aria-label="Promote to system preset"
            title="Make available to all coaches"
          >
            <ShieldCheck className="size-4" />
          </button>
        )}
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="rounded p-1.5 text-muted hover:bg-surface-inset hover:text-danger"
            aria-label="Delete preset"
          >
            <Trash2 className="size-4" />
          </button>
        )}
      </div>
    </li>
  );
}

// ── Customize panel ──────────────────────────────────────────────────

/**
 * Renders one collapsible group inside the Customize panel. Visually a thin
 * row with a chevron-style summary; the children render below when open.
 * Native `<details>` keeps state in the DOM with no React re-renders, which
 * keeps this panel cheap even with 25+ controls hiding behind it.
 */
function CustomizeGroup({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details
      open={defaultOpen}
      className="group rounded-lg border border-border bg-surface-raised [&[open]>summary>svg]:rotate-90"
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-semibold text-foreground hover:bg-surface-inset">
        <ChevronRight className="size-3.5 text-muted transition-transform" aria-hidden />
        {title}
      </summary>
      <div className="space-y-3 border-t border-border px-3 py-3">{children}</div>
    </details>
  );
}

function CustomizePanel({
  config,
  setConfig,
  canUseWristbands,
  canRemovePlaysheetWatermark,
  logoUrl,
}: {
  config: PlaybookPrintRunConfig;
  setConfig: (cfg: PlaybookPrintRunConfig) => void;
  canUseWristbands: boolean;
  canRemovePlaysheetWatermark: boolean;
  logoUrl: string | null;
}) {
  return (
    <div className="space-y-2">
      <CustomizeGroup title="Page setup" defaultOpen>
        <PlaybookPrintRunControls
          config={config}
          onChange={setConfig}
          section="layout"
          canUseWristbands={canUseWristbands}
          hideProductPicker
          embedded
        />
      </CustomizeGroup>

      <CustomizeGroup title="Style">
        <PlaybookPrintRunControls
          config={config}
          onChange={setConfig}
          section="visuals"
          canUseWristbands={canUseWristbands}
          hideProductPicker
          embedded
        />
      </CustomizeGroup>

      <CustomizeGroup title="Labels">
        <PlaybookPrintRunControls
          config={config}
          onChange={setConfig}
          section="labels"
          canUseWristbands={canUseWristbands}
          hideProductPicker
          embedded
        />
      </CustomizeGroup>

      {(config.product === "playsheet" || config.product === "playbook") && (
        <CustomizeGroup title="Notes">
          <PlaybookPrintRunControls
            config={config}
            onChange={setConfig}
            section="notes"
            canUseWristbands={canUseWristbands}
            hideProductPicker
            embedded
          />
        </CustomizeGroup>
      )}

      <CustomizeGroup title="Watermark">
        {!canRemovePlaysheetWatermark ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm text-foreground">
              Free playsheets include a tiled XO Gridmaker watermark. Upgrade to
              Coach to remove it or use your own logo.
            </p>
            <Link
              href="/pricing"
              data-web-only
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-hover"
            >
              <Lock className="size-3.5" /> Upgrade to remove watermark
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={config.watermarkEnabled}
                disabled={!logoUrl}
                onChange={(e) =>
                  setConfig({ ...config, watermarkEnabled: e.target.checked })
                }
              />
              Show playbook logo watermark
            </label>
            {!logoUrl && (
              <p className="text-xs text-muted">
                Upload a playbook logo on the playbook page to enable the watermark.
              </p>
            )}
            {config.watermarkEnabled && logoUrl && (
              <div>
                <label className="flex items-center justify-between text-xs text-muted">
                  <span>Opacity</span>
                  <span>{config.watermarkOpacityPct}%</span>
                </label>
                <input
                  type="range"
                  min={WATERMARK_MIN_PCT}
                  max={WATERMARK_MAX_PCT}
                  step={1}
                  value={config.watermarkOpacityPct}
                  onChange={(e) =>
                    setConfig({ ...config, watermarkOpacityPct: Number(e.target.value) })
                  }
                  className="mt-1 w-full accent-primary"
                />
                <label className="mt-2 flex items-center justify-between text-xs text-muted">
                  <span>Size</span>
                  <span>{Math.round((config.watermarkScale ?? 0.6) * 100)}%</span>
                </label>
                <input
                  type="range"
                  min={10}
                  max={100}
                  step={5}
                  value={Math.round((config.watermarkScale ?? 0.6) * 100)}
                  onChange={(e) =>
                    setConfig({ ...config, watermarkScale: Number(e.target.value) / 100 })
                  }
                  className="mt-1 w-full accent-primary"
                />
              </div>
            )}
          </div>
        )}
      </CustomizeGroup>
    </div>
  );
}

// ── Promote dialog ───────────────────────────────────────────────────

function PromoteDialog({
  state,
  onClose,
  onPromoted,
  config,
}: {
  state: {
    name: string;
    description: string;
    thumbnailDataUrl: string | null;
    presetId: string | null;
  };
  onClose: () => void;
  onPromoted: () => void;
  config: PlaybookPrintRunConfig;
}) {
  const { toast } = useToast();
  const [name, setName] = useState(state.name);
  const [description, setDescription] = useState(state.description);
  const [busy, startBusy] = useTransition();

  function submit() {
    const trimmed = name.trim();
    if (!trimmed) {
      toast("Name required", "error");
      return;
    }
    startBusy(async () => {
      const res = await promoteToSystemPresetAction({
        name: trimmed,
        description,
        config,
        thumbnailDataUrl: state.thumbnailDataUrl,
      });
      if (!res.ok) {
        toast(res.error, "error");
        return;
      }
      toast("System preset created", "success");
      onPromoted();
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-surface-raised shadow-elevated">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">
              Promote to system preset
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1.5 text-muted hover:bg-surface-inset hover:text-foreground"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="space-y-3 p-5">
          {state.thumbnailDataUrl ? (
            <img
              src={state.thumbnailDataUrl}
              alt="Preview thumbnail"
              className="mx-auto h-32 w-auto rounded border border-border bg-white"
            />
          ) : (
            <div className="mx-auto flex h-32 w-48 items-center justify-center rounded border border-dashed border-border text-xs text-muted">
              <ImagePlus className="size-5" />
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder='e.g. "Standard call sheet"'
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">
              Description (shows as tooltip)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
              placeholder="Brief note on when to pick this preset…"
            />
          </div>
          <div className="flex items-center justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" leftIcon={ShieldCheck} onClick={submit} loading={busy}>
              {state.presetId ? "Promote" : "Create"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Example print gate (unchanged) ───────────────────────────────────

function ExamplePrintGateModal({
  playbookId,
  attempt,
  product,
  onClose,
}: {
  playbookId: string;
  attempt: "print" | "pdf" | null;
  product: string;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="print-gate-title"
    >
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-surface-raised shadow-elevated">
        <div className="bg-gradient-to-br from-primary/15 via-surface-raised to-surface-raised px-6 pb-5 pt-6">
          <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary">
            <Sparkles className="size-3.5" aria-hidden /> One step away
          </span>
          <h2
            id="print-gate-title"
            className="mt-3 text-xl font-extrabold tracking-tight text-foreground"
          >
            {attempt === "pdf"
              ? "Export your own PDF — free."
              : "Print your own — free."}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            {product === "wristband"
              ? "Wrist coach exports come from your own playbook. Make this example yours and you'll have it on your wrist in minutes."
              : "You've configured the layout, visuals, and text exactly how you want them. Make this example yours and these settings come with it."}
          </p>
        </div>
        <div className="flex flex-col gap-2 px-6 pb-6 pt-2">
          <Link
            href={`/copy/example/${playbookId}`}
            onClick={() =>
              track({
                event: "example_cta_click",
                target: "claim_example_print_gate",
                metadata: {
                  surface: "example_print_gate_modal",
                  playbook_id: playbookId,
                  action: "claim",
                  attempted: attempt,
                },
              })
            }
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-primary-hover"
          >
            Make this mine — free
            <ArrowRight className="size-4" aria-hidden />
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-muted hover:bg-surface-inset hover:text-foreground"
          >
            Keep exploring
          </button>
        </div>
      </div>
    </div>
  );
}
