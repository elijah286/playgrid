"use client";

import { useMemo, useState, useTransition } from "react";
import { FileDown } from "lucide-react";
import type { PlaybookPrintPackRow } from "@/app/actions/plays";
import {
  applyExportPresentation,
  defaultPlaybookPrintRunConfig,
  sortNavPlaysForPrint,
  wristbandTilesPerBand,
  type PlaybookGroupRow,
  type PlaybookPrintRunConfig,
} from "@/domain/print/playbookPrint";
import {
  compilePlaysheetGridSvg,
  compilePlaysheetPdfPages,
  compileWristbandGridSvg,
  compileWristbandPdfPages,
  type WristbandGridOptions,
} from "@/domain/print/templates";
import { exportSvgsToMultiPagePdf } from "@/features/print/exportPdf";
import { PlaybookPrintRunControls } from "@/features/print/PlaybookPrintRunControls";
import { Badge, Button, Card, Input, useToast } from "@/components/ui";

type Props = {
  playbookId: string;
  initialPack: PlaybookPrintPackRow[];
  initialGroups: PlaybookGroupRow[];
  loadError: string | null;
};

export function PrintPlaybookClient({ playbookId, initialPack, initialGroups, loadError }: Props) {
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(initialPack.map((p) => p.id)),
  );
  const [config, setConfig] = useState<PlaybookPrintRunConfig>(defaultPlaybookPrintRunConfig);

  const groupNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of initialGroups) m.set(g.id, g.name);
    return m;
  }, [initialGroups]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return initialPack;
    return initialPack.filter((r) => {
      const n = r.nav;
      return (
        n.name.toLowerCase().includes(s) ||
        n.wristband_code.toLowerCase().includes(s) ||
        n.shorthand.toLowerCase().includes(s) ||
        n.formation_name.toLowerCase().includes(s) ||
        n.concept.toLowerCase().includes(s) ||
        n.tags.some((t) => t.toLowerCase().includes(s))
      );
    });
  }, [initialPack, q]);

  const allVisibleSelected =
    filtered.length > 0 && filtered.every((r) => selected.has(r.id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function setAllVisible(on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const r of filtered) {
        if (on) next.add(r.id);
        else next.delete(r.id);
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
      labelStyle: config.wristbandLabelStyle,
      labels: config.wristbandLabels,
      playerShape: config.wristbandPlayerShape,
      colorCoding: config.wristbandColorCoding,
      showLos: config.wristbandShowLos,
      showYardMarkers: config.wristbandShowYardMarkers,
      showPlayerLabels: config.wristbandShowPlayerLabels,
    }),
    [
      config.wristbandWidthIn,
      config.wristbandHeightIn,
      config.wristbandGridLayout,
      config.wristbandZoom,
      config.wristbandIconSize,
      config.wristbandRouteWeight,
      config.wristbandLabelStyle,
      config.wristbandLabels,
      config.wristbandPlayerShape,
      config.wristbandColorCoding,
      config.wristbandShowLos,
      config.wristbandShowYardMarkers,
      config.wristbandShowPlayerLabels,
    ],
  );

  const preview = useMemo(() => {
    if (config.product === "wristband") {
      const tiles = wristbandTilesPerBand(config.wristbandGridLayout);
      const chosen = initialPack.filter((r) => selected.has(r.id));
      const docs = (chosen.length > 0 ? chosen : initialPack.slice(0, 1))
        .slice(0, tiles)
        .map((r) => r.document);
      if (docs.length === 0) return null;
      return compileWristbandGridSvg(docs, wristbandGridOpts).svgMarkup;
    }
    const chosen = initialPack.filter((r) => selected.has(r.id));
    const pool = chosen.length > 0 ? chosen : initialPack.slice(0, 1);
    const docs = pool
      .slice(0, config.playsPerSheet)
      .map((r) => applyExportPresentation(r.document, config));
    if (docs.length === 0) return null;
    return compilePlaysheetGridSvg(docs, {
      playsPerSheet: config.playsPerSheet,
      orientation: config.sheetOrientation,
      showNotes: config.includeCommentsAndNotes,
    }).svgMarkup;
  }, [
    initialPack,
    selected,
    config,
    config.wristbandGridLayout,
    wristbandGridOpts,
  ]);

  function exportPdf() {
    startTransition(async () => {
      const rows = initialPack.filter((r) => selected.has(r.id));
      if (rows.length === 0) {
        toast("Select at least one play to print", "error");
        return;
      }
      const grouping =
        config.product === "playsheet" ? config.playsheetGrouping : config.wristbandGrouping;
      const navOrder = sortNavPlaysForPrint(
        rows.map((r) => r.nav),
        grouping,
      );
      const ordered = navOrder
        .map((n) => rows.find((r) => r.id === n.id))
        .filter((x): x is PlaybookPrintPackRow => x != null);
      const docs = ordered.map((r) => applyExportPresentation(r.document, config));

      let pages: string[];
      if (config.product === "playsheet") {
        pages = compilePlaysheetPdfPages(docs, {
          playsPerSheet: config.playsPerSheet,
          orientation: config.sheetOrientation,
          showNotes: config.includeCommentsAndNotes,
        });
      } else {
        pages = compileWristbandPdfPages(docs, wristbandGridOpts);
      }

      const label = config.product === "wristband" ? "wristband" : "playcard";
      const name = `${label}-${playbookId.slice(0, 8)}.pdf`;
      await exportSvgsToMultiPagePdf(pages, name);
      toast(`${config.product === "wristband" ? "Wrist coach" : "Playcard"} PDF exported`, "success");
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
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <div className="space-y-4">
        <PlaybookPrintRunControls config={config} onChange={setConfig} />

        <Card className="p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              Plays ({selected.size}/{initialPack.length})
            </p>
            <button
              type="button"
              className="text-xs font-medium text-primary hover:underline"
              onClick={() => setAllVisible(!allVisibleSelected)}
            >
              {allVisibleSelected ? "Clear shown" : "Select shown"}
            </button>
          </div>
          <div className="mt-3">
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filter plays…"
            />
          </div>
          <ul className="mt-3 max-h-[50vh] divide-y divide-border overflow-y-auto">
            {filtered.map((r) => {
              const on = selected.has(r.id);
              const group = r.nav.group_id ? groupNameById.get(r.nav.group_id) : null;
              return (
                <li key={r.id}>
                  <label className="flex cursor-pointer items-start gap-2 py-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-0.5 size-4 accent-primary"
                      checked={on}
                      onChange={() => toggle(r.id)}
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
                      <div className="mt-0.5 flex flex-wrap gap-1 text-xs text-muted">
                        {r.nav.formation_name && <span>{r.nav.formation_name}</span>}
                        {r.nav.concept && <span>· {r.nav.concept}</span>}
                        {group && <span>· {group}</span>}
                      </div>
                      {r.nav.tags.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {r.nav.tags.map((t) => (
                            <Badge key={t} variant="default">
                              {t}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </label>
                </li>
              );
            })}
            {filtered.length === 0 && (
              <li className="py-3 text-center text-xs text-muted">No plays match.</li>
            )}
          </ul>
        </Card>

        <Button
          variant="primary"
          leftIcon={FileDown}
          onClick={exportPdf}
          loading={pending}
          className="w-full"
        >
          Export {config.product === "wristband" ? "wrist coach" : "playcard"} PDF
        </Button>
      </div>

      <div className="space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
          {config.product === "wristband"
            ? `Live preview · ${config.wristbandWidthIn}" × ${config.wristbandHeightIn}"`
            : `Live preview · ${config.playsPerSheet}/sheet · ${config.sheetOrientation}`}
        </p>
        {preview ? (
          <div
            className="overflow-auto rounded-xl border border-border bg-surface-raised p-4 [&_svg]:h-auto [&_svg]:w-full [&_svg]:max-w-full"
            dangerouslySetInnerHTML={{ __html: preview }}
          />
        ) : (
          <p className="text-sm text-muted">Select a play to preview.</p>
        )}
      </div>
    </div>
  );
}
