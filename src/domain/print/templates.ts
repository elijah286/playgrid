import type { PlayDocument } from "../play/types";
import { routeToPathGeometry } from "../play/geometry";
import { resolveRouteStroke } from "../play/factory";
import {
  IN_TO_MM,
  type PlaysPerSheet,
  type WristbandGridLayout,
  type WristbandIconSize,
  type WristbandLabelMode,
  type WristbandLabelStyle,
  type WristbandPlayerShape,
  type WristbandRouteWeight,
  type WristbandZoom,
  wristbandGridDims,
} from "./playbookPrint";

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
    const d = geometry.segments
      .map((seg) => {
        const fx = fieldX + seg.from.x * fieldW;
        const fy = fieldY + (1 - seg.from.y) * fieldH;
        const tx = fieldX + seg.to.x * fieldW;
        const ty = fieldY + (1 - seg.to.y) * fieldH;
        if (seg.type === "line") {
          return `M ${fx} ${fy} L ${tx} ${ty}`;
        }
        const cx = fieldX + seg.control.x * fieldW;
        const cy = fieldY + (1 - seg.control.y) * fieldH;
        return `M ${fx} ${fy} Q ${cx} ${cy} ${tx} ${ty}`;
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
  <rect width="100%" height="100%" fill="#ffffff"/>
  <text x="${w / 2}" y="${h * 0.08}" text-anchor="middle" font-size="${fontTitle}" font-family="system-ui,sans-serif" fill="#111827">${title}</text>
  ${code ? `<text x="${w / 2}" y="${h * 0.12}" text-anchor="middle" font-size="${fontMeta}" font-family="system-ui,sans-serif" fill="#64748b">${code}</text>` : ""}
  <rect x="${fieldX}" y="${fieldY}" width="${fieldW}" height="${fieldH}" fill="#ffffff" stroke="#d1d5db" stroke-width="0.3"/>
  ${yardMarkersSvg(fieldX, fieldY, fieldW, fieldH)}
  ${playerCircles}
  ${routePaths}
  ${notes ? `<text x="${fieldX}" y="${fieldY + fieldH + 4}" font-size="${fontMeta}" font-family="system-ui,sans-serif" fill="#334155">${notes}</text>` : ""}
</svg>`;

  return { templateKind: kind, svgMarkup: svg, width: w, height: h };
}

function yardMarkersSvg(fx: number, fy: number, fw: number, fh: number): string {
  const lines: string[] = [];
  // Horizontal yard lines every ~10% of field height (approx every 2.5 yds in 25-yd view)
  for (let i = 1; i < 10; i++) {
    const y = fy + (fh * i) / 10;
    const bold = i === 5;
    lines.push(
      `<line x1="${fx}" y1="${y}" x2="${fx + fw}" y2="${y}" stroke="${bold ? "#cbd5e1" : "#e5e7eb"}" stroke-width="${bold ? 0.25 : 0.15}"/>`,
    );
  }
  // Thin vertical hash thirds
  for (let i = 1; i < 3; i++) {
    const x = fx + (fw * i) / 3;
    lines.push(
      `<line x1="${x}" y1="${fy}" x2="${x}" y2="${fy + fh}" stroke="#eef2f7" stroke-width="0.12"/>`,
    );
  }
  return lines.join("");
}

function gridLayoutForPlaysPerSheet(
  n: PlaysPerSheet,
  orientation: "portrait" | "landscape",
): { cols: number; rows: number } {
  // Portrait uses the first tuple (cols, rows); landscape swaps cols/rows.
  const portraitShapes: Record<PlaysPerSheet, [number, number]> = {
    1: [1, 1],
    2: [1, 2],
    3: [1, 3],
    4: [2, 2],
    5: [2, 3],
    6: [2, 3],
    7: [2, 4],
    8: [2, 4],
    9: [3, 3],
    10: [2, 5],
  };
  const [pc, pr] = portraitShapes[n];
  return orientation === "portrait"
    ? { cols: pc, rows: pr }
    : { cols: pr, rows: pc };
}

/** One letter-style page with multiple plays in a grid (full_sheet only). */
export function compilePlaysheetGridSvg(
  docs: PlayDocument[],
  opts: {
    playsPerSheet: PlaysPerSheet;
    orientation: "portrait" | "landscape";
    showNotes?: boolean;
  },
): CompiledPrintSvg {
  const { cols, rows } = gridLayoutForPlaysPerSheet(opts.playsPerSheet, opts.orientation);
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
    body += renderPlayCellSvg(doc, ox, oy, cellW, cellH, opts.showNotes ?? false);
  }

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}">
  <rect width="100%" height="100%" fill="#ffffff"/>
  ${body}
</svg>`;
  return { templateKind: "full_sheet", svgMarkup: svg, width: w, height: h };
}

function renderPlayCellSvg(
  doc: PlayDocument,
  ox: number,
  oy: number,
  cw: number,
  ch: number,
  showNotes: boolean,
): string {
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
  // Leave more room below the field when notes are on.
  const fieldHFrac = showNotes ? 0.52 : 0.68;
  const fieldW = cw * 0.88 * scale;
  const fieldH = ch * fieldHFrac * scale;

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
      .map((seg) => {
        const fx = fieldX + seg.from.x * fieldW;
        const fy = fieldY + (1 - seg.from.y) * fieldH;
        const tx = fieldX + seg.to.x * fieldW;
        const ty = fieldY + (1 - seg.to.y) * fieldH;
        if (seg.type === "line") {
          return `M ${fx} ${fy} L ${tx} ${ty}`;
        }
        const cx = fieldX + seg.control.x * fieldW;
        const cy = fieldY + (1 - seg.control.y) * fieldH;
        return `M ${fx} ${fy} Q ${cx} ${cy} ${tx} ${ty}`;
      })
      .join(" ");
    routePaths += `<path d="${d}" fill="none" stroke="${resolveRouteStroke(r, doc.layers.players)}" stroke-width="${r.style.strokeWidth * 0.28}" ${r.style.dash ? `stroke-dasharray="${r.style.dash}"` : ""}/>`;
  }

  const noteLines =
    showNotes && vis.showNotes
      ? doc.layers.annotations.map((a) => a.text).filter((t) => t.trim().length > 0)
      : [];
  const notesSvg = noteLines.length
    ? noteLines
        .map(
          (line, i) =>
            `<text x="${fieldX}" y="${fieldY + fieldH + 4 + i * (fontMeta * 1.25)}" font-size="${fontMeta}" font-family="system-ui,sans-serif" fill="#334155">${escSvgText(line)}</text>`,
        )
        .join("")
    : "";

  return `
  <g>
    <text x="${ox + cw / 2}" y="${titleY}" text-anchor="middle" font-size="${fontTitle}" font-family="system-ui,sans-serif" fill="#111827">${title}</text>
    ${code ? `<text x="${ox + cw / 2}" y="${codeY}" text-anchor="middle" font-size="${fontMeta}" font-family="system-ui,sans-serif" fill="#64748b">${code}</text>` : ""}
    <rect x="${fieldX}" y="${fieldY}" width="${fieldW}" height="${fieldH}" fill="#ffffff" stroke="#d1d5db" stroke-width="0.25"/>
    ${yardMarkersSvg(fieldX, fieldY, fieldW, fieldH)}
    ${playerCircles}
    ${routePaths}
    ${notesSvg}
  </g>`;
}

export function compilePlaysheetPdfPages(
  docs: PlayDocument[],
  opts: {
    playsPerSheet: PlaysPerSheet;
    orientation: "portrait" | "landscape";
    showNotes?: boolean;
  },
): string[] {
  if (docs.length === 0) return [];
  const cap = opts.playsPerSheet;
  const pages: string[] = [];
  for (let i = 0; i < docs.length; i += cap) {
    const chunk = docs.slice(i, i + cap);
    pages.push(
      compilePlaysheetGridSvg(chunk, {
        playsPerSheet: cap,
        orientation: opts.orientation,
        showNotes: opts.showNotes,
      }).svgMarkup,
    );
  }
  return pages;
}

export type WristbandGridOptions = {
  widthIn: number;
  heightIn: number;
  layout: WristbandGridLayout;
  zoom: WristbandZoom;
  iconSize: WristbandIconSize;
  routeWeight: WristbandRouteWeight;
  labelStyle: WristbandLabelStyle;
  labels: WristbandLabelMode;
  playerShape: WristbandPlayerShape;
  colorCoding: boolean;
  showLos: boolean;
  showYardMarkers: boolean;
  showPlayerLabels: boolean;
  playerOutline: boolean;
};

function iconRadius(size: WristbandIconSize): number {
  if (size === "small") return 0.65;
  if (size === "large") return 1.3;
  return 0.95;
}

function routeStrokeMm(weight: WristbandRouteWeight): number {
  if (weight === "thin") return 0.35;
  if (weight === "thick") return 0.9;
  return 0.6;
}

function labelFontMm(style: WristbandLabelStyle): { title: number; meta: number } {
  if (style === "prominent") return { title: 3.4, meta: 2.4 };
  return { title: 2.4, meta: 1.8 };
}

function groupLabelColor(doc: PlayDocument): string {
  const tag = (doc.metadata.tags ?? [])[0]?.toLowerCase() ?? "";
  if (tag.includes("run")) return "#b45309";
  if (tag.includes("pass")) return "#1d4ed8";
  if (tag.includes("rpo")) return "#7c3aed";
  if (tag.includes("screen")) return "#0f766e";
  if (tag.includes("trick") || tag.includes("reverse")) return "#be185d";
  return "#111827";
}

function playerMarkerSvg(
  shape: WristbandPlayerShape,
  cx: number,
  cy: number,
  r: number,
  fill: string,
  stroke: string,
  outline: boolean,
): string {
  if (shape === "x") {
    const d = r * 0.9;
    return `<path d="M ${cx - d} ${cy - d} L ${cx + d} ${cy + d} M ${cx + d} ${cy - d} L ${cx - d} ${cy + d}" stroke="${stroke}" stroke-width="${Math.max(0.4, r * 0.45)}" stroke-linecap="round" fill="none"/>`;
  }
  const strokeAttrs = outline ? `stroke="${stroke}" stroke-width="0.3"` : `stroke="none"`;
  if (shape === "diamond") {
    const d = r * 1.15;
    return `<path d="M ${cx} ${cy - d} L ${cx + d} ${cy} L ${cx} ${cy + d} L ${cx - d} ${cy} Z" fill="${fill}" ${strokeAttrs}/>`;
  }
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" ${strokeAttrs}/>`;
}

function renderWristbandTile(
  doc: PlayDocument,
  ox: number,
  oy: number,
  cw: number,
  ch: number,
  opts: WristbandGridOptions,
): string {
  const vis = doc.printProfile.visibility;
  const zoom = opts.zoom / 100;
  const fonts = labelFontMm(opts.labelStyle);
  const showName = opts.labels !== "number";
  const showCode = opts.labels !== "name" && vis.showWristbandCode;
  const labelColor = opts.colorCoding ? groupLabelColor(doc) : "#111827";

  const headerH = showName || showCode ? (opts.labelStyle === "prominent" ? 5 : 3.6) : 0;
  const fieldPadX = cw * 0.04;
  const fieldPadTop = headerH;
  const fieldPadBottom = cw * 0.03;
  const fieldOuterW = cw - fieldPadX * 2;
  const fieldOuterH = ch - fieldPadTop - fieldPadBottom;
  const fieldW = fieldOuterW * zoom;
  const fieldH = fieldOuterH * zoom;
  const fieldX = ox + fieldPadX + (fieldOuterW - fieldW) / 2;
  const fieldY = oy + fieldPadTop + (fieldOuterH - fieldH) / 2;

  const pr = iconRadius(opts.iconSize);
  const strokeW = routeStrokeMm(opts.routeWeight);

  let header = "";
  if (showName) {
    const name = escSvgText(doc.metadata.coachName || "");
    header += `<text x="${ox + cw / 2}" y="${oy + fonts.title * 0.95}" text-anchor="middle" font-size="${fonts.title}" font-weight="${opts.labelStyle === "prominent" ? 700 : 500}" font-family="system-ui,sans-serif" fill="${labelColor}">${name}</text>`;
  }
  if (showCode) {
    const code = escSvgText(doc.metadata.wristbandCode || "");
    const cy = showName ? oy + fonts.title * 0.95 + fonts.meta * 1.1 : oy + fonts.meta * 1.1;
    header += `<text x="${ox + cw / 2}" y="${cy}" text-anchor="middle" font-size="${fonts.meta}" font-family="system-ui,sans-serif" fill="${opts.colorCoding ? labelColor : "#64748b"}">${code}</text>`;
  }

  let players = "";
  for (const p of doc.layers.players) {
    const px = fieldX + p.position.x * fieldW;
    const py = fieldY + (1 - p.position.y) * fieldH;
    players += playerMarkerSvg(opts.playerShape, px, py, pr, p.style.fill, p.style.stroke, opts.playerOutline);
    if (opts.showPlayerLabels && vis.showPlayerLabels) {
      players += `<text x="${px}" y="${py + pr * 0.35}" text-anchor="middle" font-size="${Math.max(1, pr * 0.95)}" fill="${p.style.labelColor}" font-family="system-ui,sans-serif" font-weight="600">${escSvgText(p.label)}</text>`;
    }
  }

  let routes = "";
  for (const r of doc.layers.routes) {
    const geometry = routeToPathGeometry(r);
    const segs = geometry.segments;
    const d = segs
      .map((seg) => {
        const fx = fieldX + seg.from.x * fieldW;
        const fy = fieldY + (1 - seg.from.y) * fieldH;
        const tx = fieldX + seg.to.x * fieldW;
        const ty = fieldY + (1 - seg.to.y) * fieldH;
        if (seg.type === "line") {
          return `M ${fx} ${fy} L ${tx} ${ty}`;
        }
        const cx = fieldX + seg.control.x * fieldW;
        const cy = fieldY + (1 - seg.control.y) * fieldH;
        return `M ${fx} ${fy} Q ${cx} ${cy} ${tx} ${ty}`;
      })
      .join(" ");
    const stroke = resolveRouteStroke(r, doc.layers.players);
    routes += `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${strokeW}" stroke-linecap="round" stroke-linejoin="round" ${r.style.dash ? `stroke-dasharray="${r.style.dash}"` : ""}/>`;

    const deco = r.endDecoration ?? "arrow";
    const last = segs[segs.length - 1];
    if (deco !== "none" && last) {
      const tipX = fieldX + last.to.x * fieldW;
      const tipY = fieldY + (1 - last.to.y) * fieldH;
      const refFrom = last.type === "quadratic" ? last.control : last.from;
      const fromX = fieldX + refFrom.x * fieldW;
      const fromY = fieldY + (1 - refFrom.y) * fieldH;
      const dxS = tipX - fromX;
      const dyS = tipY - fromY;
      const len = Math.hypot(dxS, dyS);
      if (len > 1e-4) {
        const ux = dxS / len;
        const uy = dyS / len;
        if (deco === "arrow") {
          const aLen = Math.max(1.4, strokeW * 4.5);
          const cos = Math.cos(Math.PI / 6);
          const sin = Math.sin(Math.PI / 6);
          const bx = -ux;
          const by = -uy;
          const r1x = cos * bx - sin * by;
          const r1y = sin * bx + cos * by;
          const r2x = cos * bx + sin * by;
          const r2y = -sin * bx + cos * by;
          routes += `<line x1="${tipX}" y1="${tipY}" x2="${tipX + aLen * r1x}" y2="${tipY + aLen * r1y}" stroke="${stroke}" stroke-width="${strokeW}" stroke-linecap="round"/>`;
          routes += `<line x1="${tipX}" y1="${tipY}" x2="${tipX + aLen * r2x}" y2="${tipY + aLen * r2y}" stroke="${stroke}" stroke-width="${strokeW}" stroke-linecap="round"/>`;
        } else if (deco === "t") {
          const half = Math.max(1.1, strokeW * 3.5);
          const perpX = -uy;
          const perpY = ux;
          routes += `<line x1="${tipX + perpX * half}" y1="${tipY + perpY * half}" x2="${tipX - perpX * half}" y2="${tipY - perpY * half}" stroke="${stroke}" stroke-width="${strokeW}" stroke-linecap="round"/>`;
        }
      }
    }
  }

  let guides = "";
  if (opts.showYardMarkers) {
    for (let i = 1; i < 5; i++) {
      const gy = fieldY + (fieldH * i) / 5;
      guides += `<line x1="${fieldX}" y1="${gy}" x2="${fieldX + fieldW}" y2="${gy}" stroke="#e5e7eb" stroke-width="0.15"/>`;
    }
  }
  if (opts.showLos) {
    const losY = doc.lineOfScrimmageY ?? 0.5;
    const ly = fieldY + (1 - losY) * fieldH;
    guides += `<line x1="${fieldX}" y1="${ly}" x2="${fieldX + fieldW}" y2="${ly}" stroke="#94a3b8" stroke-width="0.35"/>`;
  }

  return `
  <g>
    <rect x="${ox}" y="${oy}" width="${cw}" height="${ch}" fill="#ffffff" stroke="#cbd5e1" stroke-width="0.25"/>
    ${header}
    <rect x="${fieldX}" y="${fieldY}" width="${fieldW}" height="${fieldH}" fill="#ffffff" stroke="#e2e8f0" stroke-width="0.25"/>
    ${guides}
    ${routes}
    ${players}
  </g>`;
}

/** One wristband page tiled as a grid. Returns a single SVG. */
export function compileWristbandGridSvg(
  docs: PlayDocument[],
  opts: WristbandGridOptions,
): CompiledPrintSvg {
  const w = opts.widthIn * IN_TO_MM;
  const h = opts.heightIn * IN_TO_MM;
  const { rows, cols } = wristbandGridDims(opts.layout);
  const pad = 1.5;
  const cellW = (w - pad * 2) / cols;
  const cellH = (h - pad * 2) / rows;

  let body = "";
  for (let i = 0; i < rows * cols; i++) {
    const doc = docs[i];
    const col = i % cols;
    const row = Math.floor(i / cols);
    const ox = pad + col * cellW;
    const oy = pad + row * cellH;
    if (doc) {
      body += renderWristbandTile(doc, ox, oy, cellW, cellH, opts);
    } else {
      body += `<rect x="${ox}" y="${oy}" width="${cellW}" height="${cellH}" fill="#ffffff" stroke="#e2e8f0" stroke-width="0.25" stroke-dasharray="1 1"/>`;
    }
  }

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}">
  <rect width="100%" height="100%" fill="#f1f5f9"/>
  ${body}
</svg>`;

  return { templateKind: "wristband", svgMarkup: svg, width: w, height: h };
}

/** One PDF page per wristband (tiled with N plays each). */
export function compileWristbandPdfPages(
  docs: PlayDocument[],
  opts: WristbandGridOptions,
): string[] {
  if (docs.length === 0) return [];
  const per = wristbandGridDims(opts.layout).rows * wristbandGridDims(opts.layout).cols;
  const pages: string[] = [];
  for (let i = 0; i < docs.length; i += per) {
    const chunk = docs.slice(i, i + per);
    pages.push(compileWristbandGridSvg(chunk, opts).svgMarkup);
  }
  return pages;
}
