"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronDown, ChevronRight, FileDown, Printer, Save, Trash2 } from "lucide-react";
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

  const groupNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of initialGroups) m.set(g.id, g.name);
    return m;
  }, [initialGroups]);

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
      const rows = [...filtered].sort((a, b) => a.nav.sort_order - b.nav.sort_order);
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

  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set());
  // Default-expand groups when searching, or when alpha sort (single node).
  useEffect(() => {
    if (!q.trim() && sortBy !== "alpha") return;
    setOpenGroups(new Set(tree.map((n) => n.key)));
  }, [q, tree, sortBy]);

  function toggleGroupOpen(k: string) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
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
      showLos: config.wristbandShowLos,
      showYardMarkers: config.wristbandShowYardMarkers,
      showPlayerLabels: config.wristbandShowPlayerLabels,
      playerOutline: config.wristbandPlayerOutline,
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
      iconSize: config.playsheetIconSize,
      routeWeight: config.playsheetRouteWeight,
      arrowSize: config.playsheetArrowSize,
      labelStyle: config.playsheetLabelStyle,
      labels: config.playsheetLabels,
      colorCoding: config.playsheetColorCoding,
      showLos: config.playsheetShowLos,
      showYardMarkers: config.playsheetShowYardMarkers,
      showPlayerLabels: config.playsheetShowPlayerLabels,
      playerOutline: config.playsheetPlayerOutline,
    }),
    [config],
  );

  const watermark: Watermark | null = useMemo(() => {
    if (!config.watermarkEnabled || !logoUrl) return null;
    const pct = Math.max(
      WATERMARK_MIN_PCT,
      Math.min(WATERMARK_MAX_PCT, config.watermarkOpacityPct),
    );
    return { logoUrl, opacity: pct / 100 };
  }, [config.watermarkEnabled, config.watermarkOpacityPct, logoUrl]);

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
        if (numberPlaysInOrder) {
          d.metadata = { ...d.metadata, wristbandCode: String(i + 1).padStart(2, "0") };
          d.printProfile.visibility.showWristbandCode = true;
        }
        return d;
      });
      if (docs.length === 0) return [];
      if (config.wristbandSheet === "sheet") {
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
        ? [...pool].sort((a, b) => a.nav.sort_order - b.nav.sort_order)
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
      if (numberPlaysInOrder) {
        d.metadata = { ...d.metadata, wristbandCode: String(i + 1).padStart(2, "0") };
        d.printProfile.visibility.showWristbandCode = true;
      }
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
  }, [initialPack, selected, typeFilter, sortBy, numberPlaysInOrder, config, wristbandGridOpts, playsheetOpts, team, watermark]);

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
        ? [...rows].sort((a, b) => a.nav.sort_order - b.nav.sort_order)
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
      if (numberPlaysInOrder) {
        d.metadata = { ...d.metadata, wristbandCode: String(i + 1).padStart(2, "0") };
        d.printProfile.visibility.showWristbandCode = true;
      }
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
      className="grid gap-6"
      style={{ gridTemplateColumns: "minmax(280px, 30%) 1fr" }}
    >
      <div
        className="space-y-4 sticky top-4 self-start overflow-y-auto pr-1"
        style={{ maxHeight: "calc(100vh - 2rem)" }}
      >
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
                                    {r.nav.wristband_code && (
                                      <Badge variant="primary">{r.nav.wristband_code}</Badge>
                                    )}
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

        <div className="grid grid-cols-2 gap-2">
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
      </div>

      <div className="space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
          {config.product === "wristband"
            ? `Live preview · ${config.wristbandWidthIn}" × ${config.wristbandHeightIn}"${config.wristbandSheet === "sheet" ? " · letter sheet" : ""}`
            : `Live preview · ${config.playsheetColumns} col${config.playsheetColumns === 1 ? "" : "s"} · ${config.sheetOrientation}${config.playsheetPageBreak === "group" ? " · per-group pages" : ""}`}
        </p>
        {previewPages.length > 0 ? (
          <div className="space-y-4">
            {previewPages.map((svg, i) => (
              <div
                key={i}
                className="overflow-auto rounded-xl border border-border bg-surface-raised p-4 [&_svg]:h-auto [&_svg]:w-full [&_svg]:max-w-full"
                dangerouslySetInnerHTML={{ __html: svg }}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">Select a play to preview.</p>
        )}
      </div>
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
