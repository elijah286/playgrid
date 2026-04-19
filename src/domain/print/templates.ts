import type { PlayDocument } from "../play/types";
import { routeToPathGeometry } from "../play/geometry";
import { resolveRouteStroke } from "../play/factory";

export type PrintTemplateKind = "wristband" | "full_sheet";

export type PageSpec = {
  widthMm: number;
  heightMm: number;
  marginMm: number;
  orientation: "portrait" | "landscape";
};

export type PrintTemplateDefinition = {
  page: PageSpec;
  /** Diagram area as fraction of content box */
  diagramBox: { x: number; y: number; w: number; h: number };
  titleAboveDiagram: boolean;
  showCodeBesideTitle: boolean;
};

export const defaultWristbandTemplate: PrintTemplateDefinition = {
  page: { widthMm: 25, heightMm: 280, marginMm: 1.5, orientation: "portrait" },
  diagramBox: { x: 0.06, y: 0.18, w: 0.88, h: 0.62 },
  titleAboveDiagram: true,
  showCodeBesideTitle: true,
};

export const defaultFullSheetTemplate: PrintTemplateDefinition = {
  page: { widthMm: 216, heightMm: 279, marginMm: 12, orientation: "portrait" },
  diagramBox: { x: 0.08, y: 0.14, w: 0.84, h: 0.62 },
  titleAboveDiagram: true,
  showCodeBesideTitle: true,
};

export type CompiledPrintSvg = {
  templateKind: PrintTemplateKind;
  svgMarkup: string;
  width: number;
  height: number;
};

export type CompilePlaySvgOptions = {
  templatePatch?: Partial<PrintTemplateDefinition>;
};

function escSvgText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function mergeTemplate(
  kind: PrintTemplateKind,
  patch?: Partial<PrintTemplateDefinition>,
): PrintTemplateDefinition {
  const base = kind === "wristband" ? defaultWristbandTemplate : defaultFullSheetTemplate;
  if (!patch) return base;
  return {
    ...base,
    ...patch,
    page: { ...base.page, ...patch.page },
    diagramBox: { ...base.diagramBox, ...patch.diagramBox },
  };
}

/** Shared print compiler: structured play → SVG (not a screenshot) */
export function compilePlayToSvg(
  doc: PlayDocument,
  kind: PrintTemplateKind,
  options?: CompilePlaySvgOptions,
): CompiledPrintSvg {
  const def = mergeTemplate(kind, options?.templatePatch);
  const { page, diagramBox } = def;
  const w = page.orientation === "landscape" ? page.heightMm : page.widthMm;
  const h = page.orientation === "landscape" ? page.widthMm : page.heightMm;
  const scale = doc.printProfile.wristband.diagramScale * doc.printProfile.fontScale;
  const vis = doc.printProfile.visibility;

  const title = escSvgText(doc.metadata.coachName);
  const code = vis.showWristbandCode ? escSvgText(doc.metadata.wristbandCode) : "";
  const box = diagramBox;
  const fieldX = w * box.x;
  const fieldY = h * box.y;
  const fieldW = w * box.w * scale;
  const fieldH = h * box.h * scale;

  const fontTitle = 3.2 * doc.printProfile.fontScale;
  const fontMeta = 2.4 * doc.printProfile.fontScale;

  let playerCircles = "";
  for (const p of doc.layers.players) {
    const px = fieldX + p.position.x * fieldW;
    const py = fieldY + (1 - p.position.y) * fieldH;
    const pr = Math.max(1.8, 2.2 * doc.printProfile.fontScale);
    playerCircles += `<circle cx="${px}" cy="${py}" r="${pr}" fill="${p.style.fill}" stroke="${p.style.stroke}" stroke-width="0.35"/>`;
    if (vis.showPlayerLabels) {
      playerCircles += `<text x="${px}" y="${py + 0.9}" text-anchor="middle" font-size="${fontMeta}" fill="${p.style.labelColor}" font-family="system-ui,sans-serif">${escSvgText(p.label)}</text>`;
    }
  }

  let routePaths = "";
  for (const r of doc.layers.routes) {
    // Convert node-based route to PathGeometry for rendering
    const geometry = routeToPathGeometry(r);
    const segments = geometry.segments;
    const d = segments
      .map((seg, i) => {
        if (seg.type === "line") {
          const fx = fieldX + seg.from.x * fieldW;
          const fy = fieldY + (1 - seg.from.y) * fieldH;
          const tx = fieldX + seg.to.x * fieldW;
          const ty = fieldY + (1 - seg.to.y) * fieldH;
          return i === 0 ? `M ${fx} ${fy} L ${tx} ${ty}` : `L ${tx} ${ty}`;
        }
        const fx = fieldX + seg.from.x * fieldW;
        const fy = fieldY + (1 - seg.from.y) * fieldH;
        const cx = fieldX + seg.control.x * fieldW;
        const cy = fieldY + (1 - seg.control.y) * fieldH;
        const tx = fieldX + seg.to.x * fieldW;
        const ty = fieldY + (1 - seg.to.y) * fieldH;
        return i === 0
          ? `M ${fx} ${fy} Q ${cx} ${cy} ${tx} ${ty}`
          : `Q ${cx} ${cy} ${tx} ${ty}`;
      })
      .join(" ");
    routePaths += `<path d="${d}" fill="none" stroke="${resolveRouteStroke(r, doc.layers.players)}" stroke-width="${r.style.strokeWidth * 0.35}" ${r.style.dash ? `stroke-dasharray="${r.style.dash}"` : ""}/>`;
  }

  const notes =
    vis.showNotes && doc.layers.annotations.length
      ? escSvgText(doc.layers.annotations.map((a) => a.text).join(" · "))
      : "";

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}">
  <rect width="100%" height="100%" fill="#fafafa"/>
  <text x="${w / 2}" y="${h * 0.08}" text-anchor="middle" font-size="${fontTitle}" font-family="system-ui,sans-serif" fill="#111827">${title}</text>
  ${code ? `<text x="${w / 2}" y="${h * 0.12}" text-anchor="middle" font-size="${fontMeta}" font-family="system-ui,sans-serif" fill="#64748b">${code}</text>` : ""}
  <rect x="${fieldX}" y="${fieldY}" width="${fieldW}" height="${fieldH}" fill="#ecfdf5" stroke="#94a3b8" stroke-width="0.4"/>
  ${playerCircles}
  ${routePaths}
  ${notes ? `<text x="${fieldX}" y="${fieldY + fieldH + 4}" font-size="${fontMeta}" font-family="system-ui,sans-serif" fill="#334155">${notes}</text>` : ""}
</svg>`;

  return { templateKind: kind, svgMarkup: svg, width: w, height: h };
}

function gridLayoutForPlaysPerSheet(n: 1 | 2 | 4): { cols: number; rows: number } {
  if (n === 1) return { cols: 1, rows: 1 };
  if (n === 2) return { cols: 2, rows: 1 };
  return { cols: 2, rows: 2 };
}

/** One letter-style page with multiple plays in a grid (full_sheet only). */
export function compilePlaysheetGridSvg(
  docs: PlayDocument[],
  opts: { playsPerSheet: 1 | 2 | 4; orientation: "portrait" | "landscape" },
): CompiledPrintSvg {
  const { cols, rows } = gridLayoutForPlaysPerSheet(opts.playsPerSheet);
  const basePage = { ...defaultFullSheetTemplate.page, orientation: opts.orientation };
  const w = basePage.orientation === "landscape" ? basePage.heightMm : basePage.widthMm;
  const h = basePage.orientation === "landscape" ? basePage.widthMm : basePage.heightMm;

  const margin = 6;
  const cellW = (w - margin * 2) / cols;
  const cellH = (h - margin * 2) / rows;

  let body = "";
  for (let i = 0; i < docs.length && i < cols * rows; i++) {
    const doc = docs[i]!;
    const col = i % cols;
    const row = Math.floor(i / cols);
    const ox = margin + col * cellW;
    const oy = margin + row * cellH;
    const inner = renderPlayCellSvg(doc, ox, oy, cellW, cellH);
    body += inner;
  }

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}">
  <rect width="100%" height="100%" fill="#fafafa"/>
  ${body}
</svg>`;
  return { templateKind: "full_sheet", svgMarkup: svg, width: w, height: h };
}

function renderPlayCellSvg(doc: PlayDocument, ox: number, oy: number, cw: number, ch: number): string {
  const vis = doc.printProfile.visibility;
  const scale = doc.printProfile.wristband.diagramScale * doc.printProfile.fontScale * 0.72;
  const title = escSvgText(doc.metadata.coachName);
  const code = vis.showWristbandCode ? escSvgText(doc.metadata.wristbandCode) : "";
  const fontTitle = Math.max(2, 2.6 * doc.printProfile.fontScale * (cw / 100));
  const fontMeta = Math.max(1.6, 2 * doc.printProfile.fontScale * (cw / 100));
  const titleY = oy + ch * 0.08;
  const codeY = oy + ch * 0.13;
  const fieldX = ox + cw * 0.06;
  const fieldY = oy + ch * 0.18;
  const fieldW = cw * 0.88 * scale;
  const fieldH = ch * 0.55 * scale;

  let playerCircles = "";
  for (const p of doc.layers.players) {
    const px = fieldX + p.position.x * fieldW;
    const py = fieldY + (1 - p.position.y) * fieldH;
    const pr = Math.max(1.2, 1.6 * doc.printProfile.fontScale);
    playerCircles += `<circle cx="${px}" cy="${py}" r="${pr}" fill="${p.style.fill}" stroke="${p.style.stroke}" stroke-width="0.25"/>`;
    if (vis.showPlayerLabels) {
      playerCircles += `<text x="${px}" y="${py + 0.7}" text-anchor="middle" font-size="${fontMeta}" fill="${p.style.labelColor}" font-family="system-ui,sans-serif">${escSvgText(p.label)}</text>`;
    }
  }

  let routePaths = "";
  for (const r of doc.layers.routes) {
    const geometry = routeToPathGeometry(r);
    const segments = geometry.segments;
    const d = segments
      .map((seg, i) => {
        if (seg.type === "line") {
          const fx = fieldX + seg.from.x * fieldW;
          const fy = fieldY + (1 - seg.from.y) * fieldH;
          const tx = fieldX + seg.to.x * fieldW;
          const ty = fieldY + (1 - seg.to.y) * fieldH;
          return i === 0 ? `M ${fx} ${fy} L ${tx} ${ty}` : `L ${tx} ${ty}`;
        }
        const fx = fieldX + seg.from.x * fieldW;
        const fy = fieldY + (1 - seg.from.y) * fieldH;
        const cx = fieldX + seg.control.x * fieldW;
        const cy = fieldY + (1 - seg.control.y) * fieldH;
        const tx = fieldX + seg.to.x * fieldW;
        const ty = fieldY + (1 - seg.to.y) * fieldH;
        return i === 0
          ? `M ${fx} ${fy} Q ${cx} ${cy} ${tx} ${ty}`
          : `Q ${cx} ${cy} ${tx} ${ty}`;
      })
      .join(" ");
    routePaths += `<path d="${d}" fill="none" stroke="${resolveRouteStroke(r, doc.layers.players)}" stroke-width="${r.style.strokeWidth * 0.28}" ${r.style.dash ? `stroke-dasharray="${r.style.dash}"` : ""}/>`;
  }

  const notes =
    vis.showNotes && doc.layers.annotations.length
      ? escSvgText(doc.layers.annotations.map((a) => a.text).join(" · "))
      : "";

  return `
  <g>
    <text x="${ox + cw / 2}" y="${titleY}" text-anchor="middle" font-size="${fontTitle}" font-family="system-ui,sans-serif" fill="#111827">${title}</text>
    ${code ? `<text x="${ox + cw / 2}" y="${codeY}" text-anchor="middle" font-size="${fontMeta}" font-family="system-ui,sans-serif" fill="#64748b">${code}</text>` : ""}
    <rect x="${fieldX}" y="${fieldY}" width="${fieldW}" height="${fieldH}" fill="#ecfdf5" stroke="#94a3b8" stroke-width="0.3"/>
    ${playerCircles}
    ${routePaths}
    ${notes ? `<text x="${fieldX}" y="${fieldY + fieldH + 3}" font-size="${fontMeta}" font-family="system-ui,sans-serif" fill="#334155">${notes}</text>` : ""}
  </g>`;
}

export function compilePlaysheetPdfPages(
  docs: PlayDocument[],
  opts: { playsPerSheet: 1 | 2 | 4; orientation: "portrait" | "landscape" },
): string[] {
  if (docs.length === 0) return [];
  const per = opts.playsPerSheet;
  if (per === 1) {
    return docs.map((d) =>
      compilePlayToSvg(d, "full_sheet", {
        templatePatch: {
          page: { ...defaultFullSheetTemplate.page, orientation: opts.orientation },
        },
      }).svgMarkup,
    );
  }
  const pages: string[] = [];
  const cap = per;
  for (let i = 0; i < docs.length; i += cap) {
    const chunk = docs.slice(i, i + cap);
    pages.push(compilePlaysheetGridSvg(chunk, { playsPerSheet: per, orientation: opts.orientation }).svgMarkup);
  }
  return pages;
}

export function compileWristbandPdfPages(
  docs: PlayDocument[],
  opts: { orientation: "portrait" | "landscape"; wristbandWidthMm: number },
): string[] {
  const patch: Partial<PrintTemplateDefinition> = {
    page: {
      ...defaultWristbandTemplate.page,
      widthMm: opts.wristbandWidthMm,
      orientation: opts.orientation,
    },
  };
  return docs.map((d) => compilePlayToSvg(d, "wristband", { templatePatch: patch }).svgMarkup);
}
