"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileDown,
  Maximize2,
  Printer,
  Save,
  Trash2,
  X,
} from "lucide-react";
import type { PlaybookPrintPackRow } from "@/app/actions/plays";
import {
  applyExportPresentation,
  defaultPlaybookPrintRunConfig,
  sortNavPlaysForPrint,
  wristbandTilesPerBand,
  WATERMARK_MAX_PCT,
  WATERMARK_MIN_PCT,
  type PlaybookGroupRow,
  type PlaybookPrintRunConfig,
  type PlaysheetGrouping,
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
  listPrintPresetsAction,
  savePrintPresetAction,
  type PrintPreset,
} from "@/app/actions/printPresets";
import { Badge, Button, Card, Input, SegmentedControl, useToast } from "@/components/ui";
import { cn } from "@/lib/utils";

type Props = {
  playbookId: string;
  initialPack: PlaybookPrintPackRow[];
  initialGroups: PlaybookGroupRow[];
  loadError: string | null;
  team: PlaysheetHeader;
  logoUrl: string | null;
};

type TabKey = "plays" | "layout" | "visuals" | "presets";
type SortKey = "position" | "alpha" | "group" | "tag";
type TypeFilter = "all" | "offense" | "defense" | "special_teams";

function compareByWristbandNumber(a: PlaybookPrintPackRow, b: PlaybookPrintPackRow) {
  return a.nav.sort_order - b.nav.sort_order;
}

export function PrintPlaybookClient({
  playbookId,
  initialPack,
  initialGroups,
  loadError,
  team,
  logoUrl,
}: Props) {
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [printing, startPrint] = useTransition();
  const searchParams = useSearchParams();

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
  const [tab, setTab] = useState<TabKey>("plays");
  const [q, setQ] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("position");
  const [numberPlaysInOrder, setNumberPlaysInOrder] = useState<boolean>(false);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [previewPage, setPreviewPage] = useState(0);
  const [wristbandPreviewMode, setWristbandPreviewMode] = useState<
    "card" | "sheet"
  >("card");
  const [fullscreen, setFullscreen] = useState(false);


  // Grouped tree for Plays tab — group ID (or null for ungrouped) → plays.
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

    // sortBy === "group"
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
      labelStyle: config.wristbandLabelStyle,
      labels: config.wristbandLabels,
      colorCoding: config.wristbandColorCoding,
      losIntensity: config.wristbandShowLos ? 0.5 : 0,
      yardMarkersIntensity: config.wristbandShowYardMarkers ? 0.3 : 0,
      borderThickness: 1,
      showPlayerLabels: config.wristbandShowPlayerLabels,
      playerOutline: config.wristbandPlayerOutline,
      cellPadding: config.wristbandCellPadding,
    }),
    [config],
  );

  const playsheetOpts: PlaysheetOptions = useMemo(
    () => ({
      columns: config.playsheetColumns,
      orientation: config.sheetOrientation,
      pageBreak: config.playsheetPageBreak,
      showNotes: config.playsheetShowNotes,
      noteLines: config.playsheetNoteLines,
      cellPadding: config.playsheetCellPadding,
      iconSize: config.playsheetIconSize,
      routeWeight: config.playsheetRouteWeight,
      arrowSize: config.playsheetArrowSize,
      labelStyle: config.playsheetLabelStyle,
      labels: config.playsheetLabels,
      colorCoding: config.playsheetColorCoding,
      losIntensity: config.playsheetLosIntensity,
      yardMarkersIntensity: config.playsheetYardMarkersIntensity,
      borderThickness: config.playsheetBorderThickness,
      showPlayerLabels: config.playsheetShowPlayerLabels,
      playerOutline: config.playsheetPlayerOutline,
    }),
    [config],
  );

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
    config.watermarkEnabled,
    config.watermarkOpacityPct,
    config.watermarkScale,
    alphaKeyedLogoUrl,
    logoUrl,
  ]);

  // Playbook-position (1..N) for each play, matching the orange glyph on the
  // playbook detail page. Used as the "Number" label on tiles.
  const playbookPositionById = useMemo(() => {
    const sorted = [...initialPack].sort((a, b) => a.nav.sort_order - b.nav.sort_order);
    const m = new Map<string, number>();
    sorted.forEach((r, i) => m.set(r.id, i + 1));
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
      const docs = pool.map((r, i) => {
        const d = applyExportPresentation(r.document, config);
        const pos = playbookPositionById.get(r.id);
        const label = numberPlaysInOrder
          ? String(i + 1).padStart(2, "0")
          : pos != null
            ? String(pos).padStart(2, "0")
            : d.metadata.wristbandCode;
        d.metadata = { ...d.metadata, wristbandCode: label };
        if (d.metadata.coachName !== "\u200b") {
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
    const docs = ordered.map((r, i) => {
      const d = applyExportPresentation(r.document, config);
      const pos = playbookPositionById.get(r.id);
      const label = numberPlaysInOrder
        ? String(i + 1).padStart(2, "0")
        : pos != null
          ? String(pos).padStart(2, "0")
          : d.metadata.wristbandCode;
      d.metadata = { ...d.metadata, wristbandCode: label };
      if (d.metadata.coachName !== "\u200b") {
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
    );
  }, [initialPack, selected, typeFilter, sortBy, numberPlaysInOrder, config, wristbandGridOpts, playsheetOpts, team, watermark, playbookPositionById, wristbandPreviewMode]);

  const pageCount = previewPages.length;
  const currentPageIdx = Math.min(previewPage, Math.max(0, pageCount - 1));
  const stripXmlProlog = (s: string) => s.replace(/^\s*<\?xml[^?]*\?>\s*/, "");
  // Strip the intrinsic width/height on the root <svg> so CSS can size the
  // preview. Without this, the SVG renders at its mm-based natural size
  // (~816×1056px for Letter portrait) which is usually taller than the
  // preview column — producing a vertical gap when combined with
  // `items-center justify-center`. The viewBox is preserved so content
  // still scales correctly via preserveAspectRatio="xMidYMid meet".
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
    const docs = ordered.map((r, i) => {
      const d = applyExportPresentation(r.document, config);
      const pos = playbookPositionById.get(r.id);
      const label = numberPlaysInOrder
        ? String(i + 1).padStart(2, "0")
        : pos != null
          ? String(pos).padStart(2, "0")
          : d.metadata.wristbandCode;
      d.metadata = { ...d.metadata, wristbandCode: label };
      if (d.metadata.coachName !== "\u200b") {
        d.metadata = { ...d.metadata, coachName: r.nav.name };
      }
      if (numberPlaysInOrder) d.printProfile.visibility.showWristbandCode = true;
      return d;
    });

    if (config.product === "playsheet") {
      const groupKeys = ordered.map((r) => r.nav.group_id ?? null);
      return compilePlaysheetPdfPages(
        docs,
        playsheetOpts,
        groupKeys,
        config.playsheetIncludeHeader ? team : null,
        watermark,
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

  function exportPdf() {
    startTransition(async () => {
      const pages = await compileForExport();
      if (!pages) return;
      const label = config.product === "wristband" ? "wristband" : "playcard";
      const name = `${label}-${playbookId.slice(0, 8)}.pdf`;
      await exportSvgsToMultiPagePdf(pages, name);
      toast(`${config.product === "wristband" ? "Wrist coach" : "Playcard"} PDF exported`, "success");
    });
  }

  function printNow() {
    startPrint(async () => {
      const pages = await compileForExport();
      if (!pages) return;
      await openSvgsInPrintTab(pages);
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
    <div
      className="flex flex-col gap-3"
      style={{ height: "calc(100vh - 180px)", minHeight: "520px" }}
    >
      <Card className="flex items-center gap-3 p-2">
        <div className="flex-1 min-w-0">
          <SegmentedControl
            options={[
              { value: "plays" as const, label: `Plays (${selected.size})` },
              { value: "layout" as const, label: "Layout" },
              { value: "visuals" as const, label: "Visuals" },
              { value: "presets" as const, label: "Presets" },
            ]}
            value={tab}
            onChange={setTab}
          />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="secondary"
            leftIcon={Printer}
            onClick={printNow}
            loading={printing}
          >
            Print
          </Button>
          <Button
            variant="primary"
            leftIcon={FileDown}
            onClick={exportPdf}
            loading={pending}
          >
            PDF
          </Button>
        </div>
      </Card>

      <div
        className="grid min-h-0 flex-1 gap-4"
        style={{ gridTemplateColumns: "minmax(340px, 38%) 1fr" }}
      >
      <div className="min-h-0 overflow-y-auto pr-1">
        <div className="space-y-4">

        {tab === "plays" && (
          <Card className="p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                {selected.size}/{initialPack.length} selected
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
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Filter plays…"
              />
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
                        onClick={() => toggleGroupOpen(node.key)}
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
                        onClick={() => toggleGroupOpen(node.key)}
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
                        {node.rows.map((r) => {
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
                                      const pos = playbookPositionById.get(r.id);
                                      const label =
                                        pos != null
                                          ? String(pos).padStart(2, "0")
                                          : r.nav.wristband_code;
                                      return label ? (
                                        <Badge variant="primary">{label}</Badge>
                                      ) : null;
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
          </Card>
        )}

        {tab === "layout" && (
          <PlaybookPrintRunControls config={config} onChange={setConfig} section="layout" />
        )}

        {tab === "visuals" && (
          <div className="space-y-4">
            <PlaybookPrintRunControls config={config} onChange={setConfig} section="visuals" />
            <Card className="space-y-3 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                Watermark
              </p>
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
            </Card>
          </div>
        )}

        {tab === "presets" && (
          <PresetsPanel
            config={config}
            onLoad={(c) => {
              setConfig({ ...defaultPlaybookPrintRunConfig, ...c });
              toast("Preset loaded", "success");
            }}
          />
        )}

        </div>
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
                className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-muted hover:bg-surface-raised"
                onClick={() => setFullscreen(true)}
                aria-label="Expand preview"
              >
                <Maximize2 className="size-3.5" />
                Expand
              </button>
            </div>
          )}
        </div>
        {pageCount > 0 ? (
          <div className="flex min-h-0 flex-1 items-start justify-center">
            <button
              type="button"
              className="block w-full max-h-full overflow-hidden bg-white text-left shadow-elevated ring-1 ring-black/10 [&_svg]:block [&_svg]:h-full [&_svg]:w-full"
              style={{ aspectRatio: pageAspect }}
              onClick={() => setFullscreen(true)}
              aria-label="Open preview fullscreen"
              dangerouslySetInnerHTML={{
                __html: previewHtml(
                  previewPages[currentPageIdx] ?? previewPages[0] ?? "",
                ),
              }}
            />
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
  );
}

function PresetsPanel({
  config,
  onLoad,
}: {
  config: PlaybookPrintRunConfig;
  onLoad: (cfg: PlaybookPrintRunConfig) => void;
}) {
  const { toast } = useToast();
  const [presets, setPresets] = useState<PrintPreset[] | null>(null);
  const [name, setName] = useState("");
  const [busy, startBusy] = useTransition();

  useEffect(() => {
    (async () => {
      const res = await listPrintPresetsAction();
      if (res.ok) setPresets(res.presets);
      else setPresets([]);
    })();
  }, []);

  function save() {
    const n = name.trim();
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
      setName("");
      const list = await listPrintPresetsAction();
      if (list.ok) setPresets(list.presets);
      toast("Preset saved", "success");
    });
  }

  function remove(id: string) {
    startBusy(async () => {
      const res = await deletePrintPresetAction(id);
      if (!res.ok) {
        toast(res.error, "error");
        return;
      }
      setPresets((prev) => (prev ?? []).filter((p) => p.id !== id));
    });
  }

  return (
    <Card className="space-y-3 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
        Saved configurations
      </p>
      <div className="flex gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder='e.g. "Small wristbands"'
          className="flex-1"
        />
        <Button variant="secondary" leftIcon={Save} onClick={save} loading={busy}>
          Save
        </Button>
      </div>
      {presets == null ? (
        <p className="text-xs text-muted">Loading…</p>
      ) : presets.length === 0 ? (
        <p className="text-xs text-muted">No saved configurations yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {presets.map((p) => (
            <li key={p.id} className="flex items-center gap-2 py-2 text-sm">
              <button
                type="button"
                className={cn(
                  "flex-1 truncate text-left font-medium text-foreground hover:text-primary",
                )}
                onClick={() => onLoad(p.config)}
              >
                {p.name}
              </button>
              <button
                type="button"
                className="text-muted hover:text-danger"
                onClick={() => remove(p.id)}
                aria-label="Delete preset"
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
