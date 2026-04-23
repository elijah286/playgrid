import type { PlayDocument, PlayerShape } from "../play/types";
import { routeToPathGeometry, routeToPrintGroups } from "../play/geometry";

/** Dash patterns come from the editor in pixel units (assuming ~2px stroke).
 *  In print the stroke is in mm (~0.3-1mm), so pixel dashes render huge.
 *  Rescale to tight, frequent patterns that stay readable on small tiles. */
function scaleDashForPrint(dash: string | undefined, strokeWidth: number): string | undefined {
  if (!dash) return undefined;
  const parts = dash.trim().split(/\s+/).map((n) => parseFloat(n));
  if (parts.length < 2 || parts.some((n) => !Number.isFinite(n))) return dash;
  const [on, off] = parts as [number, number];
  // Dotted (on << off, e.g. "1 7"): tiny dots with round linecap, small gap.
  if (on <= 2 && off / on >= 3) {
    const dot = Math.max(0.01, strokeWidth * 0.05);
    const gap = Math.max(0.3, strokeWidth * 1.2);
    return `${dot.toFixed(2)} ${gap.toFixed(2)}`;
  }
  // Dashed (roughly comparable on/off, e.g. "10 6"): short dashes, tight gaps.
  const ratio = off / on;
  const dashLen = Math.max(0.4, strokeWidth * 1.6);
  const gapLen = Math.max(0.25, dashLen * ratio);
  return `${dashLen.toFixed(2)} ${gapLen.toFixed(2)}`;
}
import { resolveRouteStroke } from "../play/factory";
import {
  IN_TO_MM,
  type ArrowSize,
  type PlaysheetColumns,
  type PlaysheetNoteLines,
  type PlaysheetPageBreak,
  type WristbandGridLayout,
  type WristbandIconSize,
  type PrintLabelToggles,
  type PrintNumberPosition,
  type PrintTextPosition,
  type WristbandRouteWeight,
  type WristbandZoom,
  wristbandGridDims,
} from "./playbookPrint";

/** Forces all <text> in a generated print SVG to render with the app's font
 *  stack. Inline as a <style> child of each <svg> root so CSS wins over the
 *  presentation `font-family` attribute across all SVG renderers. */
const SVG_FONT_STYLE =
  `<style>text{font-family:Inter,ui-sans-serif,system-ui,Helvetica,Arial,sans-serif;}</style>`;

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

function wrapText(text: string, maxChars: number): string[] {
  if (!text) return [];
  const out: string[] = [];
  for (const para of text.split(/\r?\n/)) {
    const words = para.split(/\s+/).filter(Boolean);
    let line = "";
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (next.length > maxChars && line) {
        out.push(line);
        line = w;
      } else {
        line = next;
      }
    }
    if (line) out.push(line);
  }
  return out;
}

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
      playerCircles += `<text x="${px}" y="${py + 0.9}" text-anchor="middle" font-size="${fontMeta}" fill="${p.style.labelColor}" font-family="Inter,ui-sans-serif,system-ui,Helvetica,Arial,sans-serif">${escSvgText(p.label)}</text>`;
    }
  }

  let routePaths = "";
  for (const r of doc.layers.routes) {
    const groups = routeToPrintGroups(r);
    const stroke = resolveRouteStroke(r, doc.layers.players);
    const sw = r.style.strokeWidth * 0.35;
    for (const grp of groups) {
      const d = grp.segments
        .map((seg) => {
          const fx = fieldX + seg.from.x * fieldW;
          const fy = fieldY + (1 - seg.from.y) * fieldH;
          const tx = fieldX + seg.to.x * fieldW;
          const ty = fieldY + (1 - seg.to.y) * fieldH;
          if (seg.type === "line") return `M ${fx} ${fy} L ${tx} ${ty}`;
          const cx = fieldX + seg.control.x * fieldW;
          const cy = fieldY + (1 - seg.control.y) * fieldH;
          return `M ${fx} ${fy} Q ${cx} ${cy} ${tx} ${ty}`;
        })
        .join(" ");
      const dash = scaleDashForPrint(grp.dash ?? r.style.dash, sw);
      routePaths += `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" ${dash ? `stroke-dasharray="${dash}"` : ""}/>`;
    }
  }

  const notes =
    vis.showNotes && doc.layers.annotations.length
      ? escSvgText(doc.layers.annotations.map((a) => a.text).join(" · "))
      : "";

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}">
  ${SVG_FONT_STYLE}
  <rect width="100%" height="100%" fill="#ffffff"/>
  <text x="${w / 2}" y="${h * 0.08}" text-anchor="middle" font-size="${fontTitle}" font-family="Inter,ui-sans-serif,system-ui,Helvetica,Arial,sans-serif" fill="#111827">${title}</text>
  ${code ? `<text x="${w / 2}" y="${h * 0.12}" text-anchor="middle" font-size="${fontMeta}" font-family="Inter,ui-sans-serif,system-ui,Helvetica,Arial,sans-serif" fill="#64748b">${code}</text>` : ""}
  <rect x="${fieldX}" y="${fieldY}" width="${fieldW}" height="${fieldH}" fill="#ffffff" stroke="#d1d5db" stroke-width="0.3"/>
  ${yardMarkersSvg(fieldX, fieldY, fieldW, fieldH)}
  ${playerCircles}
  ${routePaths}
  ${notes ? `<text x="${fieldX}" y="${fieldY + fieldH + 4}" font-size="${fontMeta}" font-family="Inter,ui-sans-serif,system-ui,Helvetica,Arial,sans-serif" fill="#334155">${notes}</text>` : ""}
</svg>`;

  return { templateKind: kind, svgMarkup: svg, width: w, height: h };
}

/** Real 5-yard lines, placed in true yardage coordinates off the LOS.
 *  Every 10yd line is slightly thicker; intensity fades the stroke/opacity. */
function realYardLinesSvg(
  doc: PlayDocument,
  fx: number,
  fy: number,
  fw: number,
  fh: number,
  intensity: number,
  fieldMin: number,
  baseWidth = 0.004,
): string {
  if (intensity <= 0) return "";
  const total = doc.sportProfile.fieldLengthYds;
  const losY = doc.lineOfScrimmageY ?? 0.5;
  if (!Number.isFinite(total) || total <= 0) return "";
  const backYd = losY * total;
  const fwdYd = (1 - losY) * total;
  const step = 5;
  let out = "";
  const draw = (yardsFromLos: number) => {
    const yNorm = losY + yardsFromLos / total;
    if (yNorm <= 0 || yNorm >= 1) return;
    const gy = fy + (1 - yNorm) * fh;
    const isTen = Math.abs(yardsFromLos) % 10 === 0;
    const w = Math.max(0.08, fieldMin * baseWidth * intensity * (isTen ? 1.35 : 1));
    const op = intensity * (isTen ? 1 : 0.7);
    out += `<line x1="${fx}" y1="${gy}" x2="${fx + fw}" y2="${gy}" stroke="#94a3b8" stroke-width="${w}" opacity="${op}"/>`;
  };
  for (let y = step; y <= backYd + 0.01; y += step) draw(-y);
  for (let y = step; y <= fwdYd + 0.01; y += step) draw(y);
  return out;
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

export type PlayTileLookOptions = {
  iconSize: WristbandIconSize;
  routeWeight: WristbandRouteWeight;
  arrowSize: ArrowSize;
  labels: PrintLabelToggles;
  /** Multiplier applied to base header font sizes (1 = default). */
  headerFontSize: number;
  /** Number chip size multiplier (1 = default). */
  numberSize: number;
  /** Where to render the play-number chip. */
  numberPosition: PrintNumberPosition;
  /** Formation label size multiplier (1 = default). */
  formationSize: number;
  /** Where to render the formation label. */
  formationPosition: PrintTextPosition;
  /** Play name label size multiplier (1 = default). */
  nameSize: number;
  /** Where to render the play name label. */
  namePosition: PrintTextPosition;
  /** Wrap long formation/name labels onto a second line. */
  labelWrap: boolean;
  colorCoding: boolean;
  /** 0 = hide LOS, 1 = full stroke/opacity. */
  losIntensity: number;
  /** 0 = hide yard-line guides, 1 = full stroke/opacity. */
  yardMarkersIntensity: number;
  /** Play-tile border thickness multiplier (0 = invisible, 1 = default). */
  borderThickness: number;
  showPlayerLabels: boolean;
  playerOutline: boolean;
};

function arrowSizeScale(size: ArrowSize): number {
  if (size === "small") return 0.45;
  if (size === "large") return 1;
  return 0.65;
}

/** Scale content around center (0.5, 0.5) so the bounding box of players + route
 *  nodes fills the tile (leaving a small margin). Returns 1 if no zoom needed. */
function computeFitScale(doc: PlayDocument, margin = 0.05, maxScale = 1.75): number {
  let minX = 0.5;
  let maxX = 0.5;
  let minY = 0.5;
  let maxY = 0.5;
  let any = false;
  const upd = (x: number, y: number) => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    any = true;
  };
  for (const p of doc.layers.players) upd(p.position.x, p.position.y);
  for (const r of doc.layers.routes) {
    for (const n of r.nodes) upd(n.position.x, n.position.y);
  }
  if (!any) return 1;
  const half = Math.max(0.5 - minX, maxX - 0.5, 0.5 - minY, maxY - 0.5, 0.01);
  const scale = (0.5 - margin) / half;
  return Math.max(1, Math.min(maxScale, scale));
}

function fitX(x: number, scale: number): number {
  return 0.5 + (x - 0.5) * scale;
}
function fitY(y: number, scale: number): number {
  return 0.5 + (y - 0.5) * scale;
}

export type PlaysheetOptions = PlayTileLookOptions & {
  columns: PlaysheetColumns;
  orientation: "portrait" | "landscape";
  pageBreak: PlaysheetPageBreak;
  showNotes: boolean;
  noteLines: PlaysheetNoteLines;
  /** 0 = cells flush together with no internal padding, 1 = default. */
  cellPadding?: number;
};

export type PlaysheetHeader = {
  teamName: string;
  subtext: string;
  logoUrl: string | null;
  accentColor: string;
};

const PLAYSHEET_HEADER_H = 14;

function hexLum(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return 0.5;
  const n = parseInt(m[1]!, 16);
  const r = ((n >> 16) & 0xff) / 255;
  const g = ((n >> 8) & 0xff) / 255;
  const b = (n & 0xff) / 255;
  const toLin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b);
}

function renderPlaysheetHeaderBanner(w: number, header: PlaysheetHeader, margin: number): string {
  const accent = header.accentColor || "#134e2a";
  const isLight = hexLum(accent) > 0.55;
  const textColor = isLight ? "#0f172a" : "#ffffff";
  const mutedColor = isLight ? "#334155" : "rgba(255,255,255,0.82)";
  const badgeFill = isLight ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.22)";
  const badgeStroke = isLight ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.35)";
  const hH = PLAYSHEET_HEADER_H;
  const logoSize = 10;
  const logoX = margin;
  const logoY = (hH - logoSize) / 2;
  const textX = logoX + logoSize + 4;
  const name = escSvgText(header.teamName || "");
  const sub = escSvgText(header.subtext || "");
  const initial = (header.teamName || "").trim().charAt(0).toUpperCase() || "?";
  const logoMarkup = header.logoUrl
    ? `<image href="${escSvgText(header.logoUrl)}" x="${logoX + 1}" y="${logoY + 1}" width="${logoSize - 2}" height="${logoSize - 2}" preserveAspectRatio="xMidYMid meet"/>`
    : `<text x="${logoX + logoSize / 2}" y="${logoY + logoSize / 2 + 2.2}" text-anchor="middle" font-size="6" font-weight="bold" font-family="Inter,ui-sans-serif,system-ui,Helvetica,Arial,sans-serif" fill="${textColor}">${escSvgText(initial)}</text>`;
  return `
  <g>
    <rect x="0" y="0" width="${w}" height="${hH}" fill="${accent}"/>
    <rect x="${logoX}" y="${logoY}" width="${logoSize}" height="${logoSize}" rx="1.8" fill="${badgeFill}" stroke="${badgeStroke}" stroke-width="0.2"/>
    ${logoMarkup}
    <text x="${textX}" y="${hH / 2 - 0.2}" font-size="5" font-weight="bold" font-family="Inter,ui-sans-serif,system-ui,Helvetica,Arial,sans-serif" fill="${textColor}">${name}</text>
    ${sub ? `<text x="${textX}" y="${hH / 2 + 4.2}" font-size="3" font-family="Inter,ui-sans-serif,system-ui,Helvetica,Arial,sans-serif" fill="${mutedColor}">${sub}</text>` : ""}
  </g>`;
}

/** Render playsheet pages. When pageBreak === "group" and groupKeys is supplied,
 *  each run of consecutive matching keys starts a new page. */
export function compilePlaysheetPdfPages(
  docs: PlayDocument[],
  opts: PlaysheetOptions,
  groupKeys?: readonly (string | null)[],
  header?: PlaysheetHeader | null,
  watermark?: Watermark | null,
  freeTier?: boolean,
): string[] {
  if (docs.length === 0) return [];
  const basePage = defaultFullSheetTemplate.page;
  const w = opts.orientation === "landscape" ? basePage.heightMm : basePage.widthMm;
  const h = opts.orientation === "landscape" ? basePage.widthMm : basePage.heightMm;
  const margin = 8;
  const headerH = header ? PLAYSHEET_HEADER_H : 0;
  const topOffset = header ? PLAYSHEET_HEADER_H + 4 : margin;
  const innerW = w - margin * 2;
  const innerH = h - topOffset - margin;
  const cellW = innerW / opts.columns;
  const notesH = opts.showNotes ? opts.noteLines * 3.2 + 3 : 0;
  const cellH = cellW * 0.72 + notesH;
  const rows = Math.max(1, Math.floor(innerH / cellH));
  const perPage = rows * opts.columns;

  const chunks: PlayDocument[][] = [];
  if (opts.pageBreak === "group" && groupKeys && groupKeys.length === docs.length) {
    let start = 0;
    for (let i = 1; i <= docs.length; i++) {
      if (i === docs.length || groupKeys[i] !== groupKeys[start]) {
        const groupDocs = docs.slice(start, i);
        for (let j = 0; j < groupDocs.length; j += perPage) {
          chunks.push(groupDocs.slice(j, j + perPage));
        }
        start = i;
      }
    }
  } else {
    for (let i = 0; i < docs.length; i += perPage) {
      chunks.push(docs.slice(i, i + perPage));
    }
  }

  return chunks.map((chunk) =>
    renderPlaysheetPage(chunk, {
      w,
      h,
      margin,
      topOffset,
      cellW,
      cellH,
      notesH,
      rows,
      opts,
      header: header ?? null,
      watermark: watermark ?? null,
      freeTier: freeTier ?? false,
    }),
  );
}

function renderPlaysheetPage(
  docs: PlayDocument[],
  layout: {
    w: number;
    h: number;
    margin: number;
    topOffset: number;
    cellW: number;
    cellH: number;
    notesH: number;
    rows: number;
    opts: PlaysheetOptions;
    header: PlaysheetHeader | null;
    watermark: Watermark | null;
    freeTier: boolean;
  },
): string {
  const { w, h, margin, topOffset, cellW, cellH, notesH, opts, header, watermark, freeTier } = layout;
  const pad = opts.cellPadding ?? 1;
  let body = "";
  for (let i = 0; i < docs.length; i++) {
    const col = i % opts.columns;
    const row = Math.floor(i / opts.columns);
    const ox = margin + col * cellW;
    const oy = topOffset + row * cellH;
    body += renderPlaysheetCell(docs[i]!, ox, oy, cellW, cellH, notesH, opts, pad, freeTier);
  }
  const headerSvg = header ? renderPlaysheetHeaderBanner(w, header, margin) : "";
  const freeWm = freeTier ? freeTierWatermarkSvg(w, h) : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}">
  ${SVG_FONT_STYLE}
  <rect width="100%" height="100%" fill="#ffffff"/>
  ${freeWm}
  ${headerSvg}
  ${body}
  ${watermarkSvg(w, h, watermark)}
  ${freeTier ? playsheetFooterSvg(w, h) : ""}
</svg>`;
}

function renderPlaysheetCell(
  doc: PlayDocument,
  ox: number,
  oy: number,
  cw: number,
  ch: number,
  notesH: number,
  opts: PlaysheetOptions,
  padScale: number = 1,
  freeTier: boolean = false,
): string {
  const padX = 2 * padScale;
  const padTop = 1.5 * padScale;
  const padBelowField = 1.5 * padScale;
  const tileH = ch - notesH;
  const vis = doc.printProfile.visibility;
  const toggles: PrintLabelToggles = {
    showNumber: opts.labels.showNumber && vis.showWristbandCode,
    showFormation: opts.labels.showFormation,
    showName: opts.labels.showName,
  };
  const labelColor = opts.colorCoding ? groupLabelColor(doc) : "#111827";

  const baseTitle = 2.6;
  const innerW = cw - padX * 2;
  const topMetrics = computeTopHeaderMetrics({
    doc,
    toggles,
    formationPosition: opts.formationPosition,
    formationSize: opts.formationSize,
    namePosition: opts.namePosition,
    nameSize: opts.nameSize,
    baseTitle,
    fontScale: opts.headerFontSize,
    innerW,
    labelWrap: opts.labelWrap,
  });
  const headerH = topHeaderHeight(topMetrics);
  const fieldX = ox + padX;
  const fieldY = oy + padTop + headerH;
  const fieldW = cw - padX * 2;
  const fieldH = Math.max(4, tileH - padTop - headerH - padBelowField);

  const hdr = renderTileTextHeader({
    doc,
    toggles,
    fontScale: opts.headerFontSize,
    labelWrap: opts.labelWrap,
    colorCoding: opts.colorCoding,
    labelColor,
    numberSize: opts.numberSize,
    numberPosition: opts.numberPosition,
    formationSize: opts.formationSize,
    formationPosition: opts.formationPosition,
    nameSize: opts.nameSize,
    namePosition: opts.namePosition,
    ox,
    oy,
    cw,
    padX,
    padTop,
    fieldX,
    fieldY,
    fieldW,
    fieldH,
    baseTitle,
  });
  const header = hdr.headerSvg;
  const overlay = hdr.overlaySvg;

  const fieldWm = freeTier
    ? renderFieldFreeTierWatermark(fieldX, fieldY, fieldW, fieldH)
    : "";
  const field = renderFieldContents(doc, fieldX, fieldY, fieldW, fieldH, opts);

  let notes = "";
  if (opts.showNotes && notesH > 0) {
    const ny = oy + tileH;
    const lineH = 3.2;
    const fontNote = 2.3;
    const raw = vis.showNotes ? (doc.metadata.notes ?? "").trim() : "";
    const innerW = cw - padX * 2;
    const charsPerLine = Math.max(10, Math.floor(innerW / (fontNote * 0.48)));
    const wrapped = wrapText(raw, charsPerLine).slice(0, opts.noteLines);
    const clipId = `nc-${Math.random().toString(36).slice(2, 9)}`;
    notes += `<defs><clipPath id="${clipId}"><rect x="${ox + padX}" y="${ny}" width="${innerW}" height="${notesH - 1}"/></clipPath></defs>`;
    notes += `<g clip-path="url(#${clipId})">`;
    wrapped.forEach((line, i) => {
      notes += `<text x="${ox + padX}" y="${ny + lineH * (i + 1)}" font-size="${fontNote}" font-family="Inter,ui-sans-serif,system-ui,Helvetica,Arial,sans-serif" fill="#334155">${escSvgText(line)}</text>`;
    });
    notes += `</g>`;
    notes += `<line x1="${ox + padX}" y1="${ny + notesH - 0.5}" x2="${ox + cw - padX}" y2="${ny + notesH - 0.5}" stroke="#e5e7eb" stroke-width="0.2"/>`;
  }

  const bt = Math.max(0, Math.min(2, opts.borderThickness ?? 1));
  const outerStroke = bt === 0 ? "none" : "#e2e8f0";
  const outerW = bt === 0 ? 0 : padScale > 0 ? 0.3 * bt : 0.15 * bt;
  const outerBorder =
    padScale > 0
      ? `<rect x="${ox + 0.5}" y="${oy + 0.5}" width="${cw - 1}" height="${ch - 1}" fill="#ffffff" stroke="${outerStroke}" stroke-width="${outerW}" rx="1.2"/>`
      : `<rect x="${ox}" y="${oy}" width="${cw}" height="${ch}" fill="#ffffff" stroke="${outerStroke}" stroke-width="${outerW}"/>`;
  const innerStroke = bt === 0 ? "none" : "#e5e7eb";
  return `
  <g>
    ${outerBorder}
    ${header}
    <rect x="${fieldX}" y="${fieldY}" width="${fieldW}" height="${fieldH}" fill="#ffffff" stroke="${innerStroke}" stroke-width="${0.25 * bt}"/>
    ${fieldWm}
    ${field}
    ${overlay}
    ${notes}
  </g>`;
}

/** Shared inner-field contents (guides + players + routes + arrows). */
function renderFieldContents(
  doc: PlayDocument,
  fieldX: number,
  fieldY: number,
  fieldW: number,
  fieldH: number,
  look: PlayTileLookOptions,
): string {
  const vis = doc.printProfile.visibility;
  const fieldMin = Math.min(fieldW, fieldH);
  const pr = iconRadiusProportional(look.iconSize, fieldMin);
  const strokeW = routeStrokeProportional(look.routeWeight, fieldMin);
  const fit = computeFitScale(doc);

  const ymI = Math.max(0, Math.min(1, look.yardMarkersIntensity));
  const losI = Math.max(0, Math.min(1, look.losIntensity));
  let guides = realYardLinesSvg(doc, fieldX, fieldY, fieldW, fieldH, ymI, fieldMin);
  if (losI > 0) {
    const losY = doc.lineOfScrimmageY ?? 0.5;
    const ly = fieldY + (1 - losY) * fieldH;
    guides += `<line x1="${fieldX}" y1="${ly}" x2="${fieldX + fieldW}" y2="${ly}" stroke="#475569" stroke-width="${Math.max(0.2, fieldMin * 0.008 * losI)}" opacity="${losI}"/>`;
  }

  const routes = renderRoutesAndArrows(doc, fieldX, fieldY, fieldW, fieldH, strokeW, fieldMin, look.arrowSize, fit);

  let players = "";
  for (const p of doc.layers.players) {
    const px = fieldX + fitX(p.position.x, fit) * fieldW;
    const py = fieldY + (1 - fitY(p.position.y, fit)) * fieldH;
    players += playerMarkerSvg(p.shape, px, py, pr, p.style.fill, p.style.stroke, look.playerOutline);
    if (look.showPlayerLabels && vis.showPlayerLabels) {
      players += `<text x="${px}" y="${py + pr * 0.35}" text-anchor="middle" font-size="${Math.max(1.2, pr * 1.05)}" fill="${p.style.labelColor}" font-family="Inter,ui-sans-serif,system-ui,Helvetica,Arial,sans-serif" font-weight="bold">${escSvgText(p.label)}</text>`;
    }
  }

  return guides + routes + players;
}

/** Arrow rendered at each terminal segment's tip (matches editor logic). */
function renderRoutesAndArrows(
  doc: PlayDocument,
  fieldX: number,
  fieldY: number,
  fieldW: number,
  fieldH: number,
  strokeW: number,
  fieldMin: number,
  arrowSize: ArrowSize,
  fit: number,
): string {
  const aScale = arrowSizeScale(arrowSize);
  const sx = (x: number) => fieldX + fitX(x, fit) * fieldW;
  const sy = (y: number) => fieldY + (1 - fitY(y, fit)) * fieldH;
  let out = "";
  for (const r of doc.layers.routes) {
    const groups = routeToPrintGroups(r);
    const stroke = resolveRouteStroke(r, doc.layers.players);
    for (const grp of groups) {
      const d = grp.segments
        .map((seg) => {
          const fx = sx(seg.from.x);
          const fy = sy(seg.from.y);
          const tx = sx(seg.to.x);
          const ty = sy(seg.to.y);
          if (seg.type === "line") return `M ${fx} ${fy} L ${tx} ${ty}`;
          const cx = sx(seg.control.x);
          const cy = sy(seg.control.y);
          return `M ${fx} ${fy} Q ${cx} ${cy} ${tx} ${ty}`;
        })
        .join(" ");
      const dash = scaleDashForPrint(grp.dash ?? r.style.dash, strokeW);
      out += `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${strokeW}" stroke-linecap="round" stroke-linejoin="round" ${dash ? `stroke-dasharray="${dash}"` : ""}/>`;
    }

    const deco = r.endDecoration ?? "arrow";
    if (deco === "none") continue;

    const fromIds = new Set(r.segments.map((s) => s.fromNodeId));
    const terminals = r.segments.filter((s) => !fromIds.has(s.toNodeId));
    const nodeMap = new Map(r.nodes.map((n) => [n.id, n]));
    for (const seg of terminals) {
      const from = nodeMap.get(seg.fromNodeId);
      const to = nodeMap.get(seg.toNodeId);
      if (!from || !to) continue;
      const refFrom =
        seg.shape === "curve" && seg.controlOffset ? seg.controlOffset : from.position;
      const tipX = sx(to.position.x);
      const tipY = sy(to.position.y);
      const fromX = sx(refFrom.x);
      const fromY = sy(refFrom.y);
      const dxS = tipX - fromX;
      const dyS = tipY - fromY;
      const len = Math.hypot(dxS, dyS);
      if (len <= 1e-4) continue;
      const ux = dxS / len;
      const uy = dyS / len;
      if (deco === "arrow") {
        const aLen = Math.max(strokeW * 2, Math.min(strokeW * 4.5, fieldMin * 0.07)) * aScale;
        const cos = Math.cos(Math.PI / 6);
        const sin = Math.sin(Math.PI / 6);
        const bx = -ux;
        const by = -uy;
        const r1x = cos * bx - sin * by;
        const r1y = sin * bx + cos * by;
        const r2x = cos * bx + sin * by;
        const r2y = -sin * bx + cos * by;
        out += `<line x1="${tipX}" y1="${tipY}" x2="${tipX + aLen * r1x}" y2="${tipY + aLen * r1y}" stroke="${stroke}" stroke-width="${strokeW}" stroke-linecap="round"/>`;
        out += `<line x1="${tipX}" y1="${tipY}" x2="${tipX + aLen * r2x}" y2="${tipY + aLen * r2y}" stroke="${stroke}" stroke-width="${strokeW}" stroke-linecap="round"/>`;
      } else if (deco === "t") {
        const half = Math.max(strokeW * 1.5, Math.min(strokeW * 3.5, fieldMin * 0.055)) * aScale;
        const perpX = -uy;
        const perpY = ux;
        out += `<line x1="${tipX + perpX * half}" y1="${tipY + perpY * half}" x2="${tipX - perpX * half}" y2="${tipY - perpY * half}" stroke="${stroke}" stroke-width="${strokeW}" stroke-linecap="round"/>`;
      }
    }
  }
  return out;
}

function iconRadiusProportional(size: WristbandIconSize, fieldMin: number): number {
  const frac = size === "small" ? 0.035 : size === "large" ? 0.07 : 0.05;
  return Math.max(0.5, fieldMin * frac);
}

function routeStrokeProportional(weight: WristbandRouteWeight, fieldMin: number): number {
  const frac = weight === "thin" ? 0.009 : weight === "thick" ? 0.026 : 0.018;
  return Math.max(0.12, fieldMin * frac);
}

export type WristbandGridOptions = {
  widthIn: number;
  heightIn: number;
  layout: WristbandGridLayout;
  zoom: WristbandZoom;
  iconSize: WristbandIconSize;
  routeWeight: WristbandRouteWeight;
  arrowSize: ArrowSize;
  labels: PrintLabelToggles;
  /** Multiplier applied to base header font sizes (1 = default). */
  headerFontSize: number;
  /** Number chip size multiplier (1 = default). */
  numberSize: number;
  /** Where to render the play-number chip. */
  numberPosition: PrintNumberPosition;
  /** Formation label size multiplier (1 = default). */
  formationSize: number;
  /** Where to render the formation label. */
  formationPosition: PrintTextPosition;
  /** Play name label size multiplier (1 = default). */
  nameSize: number;
  /** Where to render the play name label. */
  namePosition: PrintTextPosition;
  /** Wrap long formation/name labels onto a second line. */
  labelWrap: boolean;
  colorCoding: boolean;
  /** 0 = hide LOS, 1 = full stroke/opacity. */
  losIntensity: number;
  /** 0 = hide yard-line guides, 1 = full stroke/opacity. */
  yardMarkersIntensity: number;
  /** Tile border thickness multiplier (0 = invisible, 1 = default). */
  borderThickness: number;
  showPlayerLabels: boolean;
  playerOutline: boolean;
  /** 0 = tiles flush together with no internal padding, 1 = default. */
  cellPadding?: number;
};

/** Optional page-level watermark rendered behind the print content. */
export type Watermark = {
  logoUrl: string;
  /** 0–1 opacity. Callers should clamp to the UI's 5–20% range. */
  opacity: number;
  /** 0.1–1 fraction of min(width, height) used to size the logo. */
  scale?: number;
};

/**
 * Tiled orange xogridmaker watermark for free-tier playsheets. Draws diagonally
 * across the page behind the play cells. Not configurable — always same look.
 */
function freeTierWatermarkSvg(w: number, h: number): string {
  const tileX = 60;
  const tileY = 26;
  const fontSize = 10;
  const diag = Math.ceil(Math.hypot(w, h)) + tileY * 2;
  const cols = Math.ceil(diag / tileX) + 1;
  const rows = Math.ceil(diag / tileY) + 1;
  const startX = -diag / 2;
  const startY = -diag / 2;
  let cells = "";
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = startX + c * tileX + (r % 2 === 0 ? 0 : tileX / 2);
      const y = startY + r * tileY;
      cells += `<text x="${x.toFixed(2)}" y="${y.toFixed(2)}" font-family="Inter,ui-sans-serif,system-ui,Helvetica,Arial,sans-serif" font-size="${fontSize}" font-weight="800" fill="#f97316" fill-opacity="0.18" letter-spacing="0.5">xogridmaker</text>`;
    }
  }
  return `<g transform="translate(${(w / 2).toFixed(2)} ${(h / 2).toFixed(2)}) rotate(-45)" style="pointer-events:none">${cells}</g>`;
}

/**
 * Tiled xogridmaker watermark for a single play's field area on free-tier
 * playsheets. Clipped to the field rect so letters don't bleed into the header
 * or notes. Rendered behind the routes/players.
 */
function renderFieldFreeTierWatermark(
  fx: number,
  fy: number,
  fw: number,
  fh: number,
): string {
  const fontSize = Math.max(3, Math.min(7, Math.min(fw, fh) * 0.18));
  const tileX = fontSize * 5;
  const tileY = fontSize * 2.2;
  const diag = Math.ceil(Math.hypot(fw, fh)) + tileY * 2;
  const cols = Math.ceil(diag / tileX) + 2;
  const rows = Math.ceil(diag / tileY) + 2;
  const startX = -diag / 2;
  const startY = -diag / 2;
  const clipId = `fwm-${Math.random().toString(36).slice(2, 9)}`;
  let cells = "";
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = startX + c * tileX + (r % 2 === 0 ? 0 : tileX / 2);
      const y = startY + r * tileY;
      cells += `<text x="${x.toFixed(2)}" y="${y.toFixed(2)}" font-family="Inter,ui-sans-serif,system-ui,Helvetica,Arial,sans-serif" font-size="${fontSize.toFixed(2)}" font-weight="800" fill="#f97316" fill-opacity="0.18" letter-spacing="0.3">xogridmaker</text>`;
    }
  }
  return `<defs><clipPath id="${clipId}"><rect x="${fx}" y="${fy}" width="${fw}" height="${fh}"/></clipPath></defs><g clip-path="url(#${clipId})" style="pointer-events:none"><g transform="translate(${(fx + fw / 2).toFixed(2)} ${(fy + fh / 2).toFixed(2)}) rotate(-45)">${cells}</g></g>`;
}

function watermarkSvg(w: number, h: number, wm: Watermark | null): string {
  if (!wm || !wm.logoUrl) return "";
  const scale = Math.max(0.1, Math.min(1, wm.scale ?? 0.6));
  const size = Math.min(w, h) * scale;
  const x = (w - size) / 2;
  const y = (h - size) / 2;
  return `<g opacity="${wm.opacity}"><image href="${escSvgText(wm.logoUrl)}" x="${x}" y="${y}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet"/></g>`;
}

function playsheetFooterSvg(w: number, h: number): string {
  const bandH = 4.2;
  const y = h - bandH;
  return `<g>
    <rect x="0" y="${y}" width="${w}" height="${bandH}" fill="#f97316" opacity="0.95"/>
    <text x="${w / 2}" y="${y + bandH / 2 + 1}" text-anchor="middle" font-family="Inter,ui-sans-serif,system-ui,Helvetica,Arial,sans-serif" font-size="2.2" fill="#ffffff" font-weight="bold" letter-spacing="0.2">Powered by xogridmaker · xogridmaker.com · © 2026</text>
  </g>`;
}

function iconRadius(size: WristbandIconSize): number {
  if (size === "small") return 0.65;
  if (size === "large") return 1.3;
  return 0.95;
}

function routeStrokeMm(weight: WristbandRouteWeight): number {
  if (weight === "thin") return 0.18;
  if (weight === "thick") return 0.6;
  return 0.35;
}

/**
 * Build the top-header block (formation + name text, and a number chip that
 * overlaps the top-left of the field). Shared across playsheet and wristband.
 *
 * baseFont: starting font size in mm. Multiplied by `scale` from the user's
 * header-font-size slider.
 */
type TopHeaderMetrics = {
  /** Number of lines consumed at the top of the tile by formation/name labels. */
  lines: number;
  /** Effective font size used to size the reserved header band. */
  lineFont: number;
  /** True when formation and name share a top slot and fit on one line together. */
  combined: boolean;
  formationFont: number;
  nameFont: number;
  formation: string;
  name: string;
  hasTopFormation: boolean;
  hasTopName: boolean;
  formationLines: string[];
  nameLines: string[];
};

function isTopPos(p: PrintTextPosition): boolean {
  return p === "top-left" || p === "top-center";
}

function computeTopHeaderMetrics(args: {
  doc: PlayDocument;
  toggles: PrintLabelToggles;
  formationPosition: PrintTextPosition;
  formationSize: number;
  namePosition: PrintTextPosition;
  nameSize: number;
  baseTitle: number;
  fontScale: number;
  innerW: number;
  labelWrap: boolean;
}): TopHeaderMetrics {
  const formationFont = args.baseTitle * args.fontScale * Math.max(0.3, args.formationSize);
  const nameFont = args.baseTitle * args.fontScale * Math.max(0.3, args.nameSize);
  const lineFont = Math.max(formationFont, nameFont);
  const formation = args.toggles.showFormation ? (args.doc.metadata.formation || "").trim() : "";
  const name = args.toggles.showName ? (args.doc.metadata.coachName || "").trim() : "";
  const hasTopFormation = formation.length > 0 && isTopPos(args.formationPosition);
  const hasTopName = name.length > 0 && isTopPos(args.namePosition);
  const charsPerLineFor = (font: number) =>
    Math.max(6, Math.floor(args.innerW / (font * 0.52)));
  const wrapSingle = (text: string, font: number): string[] => {
    const chars = charsPerLineFor(font);
    if (!args.labelWrap || text.length <= chars) return [text];
    return wrapText(text, chars).slice(0, 2);
  };
  const base = {
    lineFont,
    formationFont,
    nameFont,
    formation,
    name,
    hasTopFormation,
    hasTopName,
    formationLines: [] as string[],
    nameLines: [] as string[],
  };
  if (!hasTopFormation && !hasTopName) {
    return { ...base, lines: 0, combined: false };
  }
  if (hasTopFormation && hasTopName && args.formationPosition === args.namePosition) {
    const combinedText = `${formation}  ·  ${name}`;
    if (combinedText.length <= charsPerLineFor(lineFont)) {
      return { ...base, lines: 1, combined: true };
    }
    // Same top slot, can't fit — stack formation line 1, name line 2.
    return {
      ...base,
      lines: 2,
      combined: false,
      formationLines: [formation],
      nameLines: [name],
    };
  }
  const fLines = hasTopFormation ? wrapSingle(formation, formationFont) : [];
  const nLines = hasTopName ? wrapSingle(name, nameFont) : [];
  const lines = Math.max(fLines.length, nLines.length);
  return {
    ...base,
    lines,
    combined: false,
    formationLines: fLines,
    nameLines: nLines,
  };
}

function topHeaderHeight(m: TopHeaderMetrics): number {
  if (m.lines === 0) return 0;
  return m.lineFont * 0.3 + m.lineFont * 1.15 * m.lines;
}

function renderTileTextHeader(params: {
  doc: PlayDocument;
  toggles: PrintLabelToggles;
  fontScale: number;
  labelWrap: boolean;
  colorCoding: boolean;
  labelColor: string;
  numberSize: number;
  numberPosition: PrintNumberPosition;
  formationSize: number;
  formationPosition: PrintTextPosition;
  nameSize: number;
  namePosition: PrintTextPosition;
  // Tile bounds
  ox: number;
  oy: number;
  cw: number;
  padX: number;
  padTop: number;
  // Field rect (for corner chip placement)
  fieldX: number;
  fieldY: number;
  fieldW: number;
  fieldH: number;
  // Base title font in mm (before scale)
  baseTitle: number;
}): { headerSvg: string; overlaySvg: string; headerH: number } {
  const {
    doc,
    toggles,
    fontScale,
    labelWrap,
    colorCoding,
    labelColor,
    numberSize,
    numberPosition,
    formationSize,
    formationPosition,
    nameSize,
    namePosition,
    ox,
    oy,
    cw,
    padX,
    padTop,
    fieldX,
    fieldY,
    fieldW,
    fieldH,
    baseTitle,
  } = params;

  const innerW = cw - padX * 2;
  const metrics = computeTopHeaderMetrics({
    doc,
    toggles,
    formationPosition,
    formationSize,
    namePosition,
    nameSize,
    baseTitle,
    fontScale,
    innerW,
    labelWrap,
  });
  const { formation, name, hasTopFormation, hasTopName, combined, formationFont, nameFont, lineFont, formationLines, nameLines } = metrics;
  const headerH = topHeaderHeight(metrics);
  const lineH = lineFont * 1.15;
  const topBaselineY = oy + padTop + lineFont * 0.95;
  const fontWeight = colorCoding ? "600" : "500";

  function textAttrs(pos: PrintTextPosition): { x: number; anchor: string } {
    if (pos === "top-left") return { x: ox + padX, anchor: "start" };
    return { x: ox + cw / 2, anchor: "middle" };
  }

  let headerSvg = "";
  if (combined) {
    const { x, anchor } = textAttrs(formationPosition);
    headerSvg += `<text x="${x}" y="${topBaselineY}" text-anchor="${anchor}" font-size="${lineFont}" font-weight="${fontWeight}" font-family="Inter,ui-sans-serif,system-ui,Helvetica,Arial,sans-serif" fill="${labelColor}">${escSvgText(`${formation}  ·  ${name}`)}</text>`;
  } else {
    if (hasTopFormation) {
      const { x, anchor } = textAttrs(formationPosition);
      formationLines.forEach((line, i) => {
        headerSvg += `<text x="${x}" y="${topBaselineY + i * lineH}" text-anchor="${anchor}" font-size="${formationFont}" font-weight="${fontWeight}" font-family="Inter,ui-sans-serif,system-ui,Helvetica,Arial,sans-serif" fill="${labelColor}">${escSvgText(line)}</text>`;
      });
    }
    if (hasTopName) {
      const { x, anchor } = textAttrs(namePosition);
      const sameSlot =
        hasTopFormation && formationPosition === namePosition;
      // When both labels share the same top slot, stack formation on line 1 and
      // name on line 2. Otherwise the name label uses its own top row.
      const nameRowOffset = sameSlot ? formationLines.length : 0;
      nameLines.forEach((line, i) => {
        headerSvg += `<text x="${x}" y="${topBaselineY + (nameRowOffset + i) * lineH}" text-anchor="${anchor}" font-size="${nameFont}" font-weight="${fontWeight}" font-family="Inter,ui-sans-serif,system-ui,Helvetica,Arial,sans-serif" fill="${labelColor}">${escSvgText(line)}</text>`;
      });
    }
  }

  // Bottom-center labels are painted over the bottom of the field rect.
  let bottomSvg = "";
  const bottomInset = 0.6;
  const hasBottomFormation =
    formation.length > 0 && formationPosition === "bottom-center";
  const hasBottomName = name.length > 0 && namePosition === "bottom-center";
  if (hasBottomFormation && hasBottomName) {
    // Stack formation above name, flush to the bottom of the field.
    const nameBaselineY = fieldY + fieldH - bottomInset;
    const formationBaselineY = nameBaselineY - nameFont * 1.15;
    bottomSvg += `<text x="${ox + cw / 2}" y="${formationBaselineY}" text-anchor="middle" font-size="${formationFont}" font-weight="${fontWeight}" font-family="Inter,ui-sans-serif,system-ui,Helvetica,Arial,sans-serif" fill="${labelColor}">${escSvgText(formation)}</text>`;
    bottomSvg += `<text x="${ox + cw / 2}" y="${nameBaselineY}" text-anchor="middle" font-size="${nameFont}" font-weight="${fontWeight}" font-family="Inter,ui-sans-serif,system-ui,Helvetica,Arial,sans-serif" fill="${labelColor}">${escSvgText(name)}</text>`;
  } else if (hasBottomFormation) {
    bottomSvg += `<text x="${ox + cw / 2}" y="${fieldY + fieldH - bottomInset}" text-anchor="middle" font-size="${formationFont}" font-weight="${fontWeight}" font-family="Inter,ui-sans-serif,system-ui,Helvetica,Arial,sans-serif" fill="${labelColor}">${escSvgText(formation)}</text>`;
  } else if (hasBottomName) {
    bottomSvg += `<text x="${ox + cw / 2}" y="${fieldY + fieldH - bottomInset}" text-anchor="middle" font-size="${nameFont}" font-weight="${fontWeight}" font-family="Inter,ui-sans-serif,system-ui,Helvetica,Arial,sans-serif" fill="${labelColor}">${escSvgText(name)}</text>`;
  }

  let numberBoxSvg = "";
  if (toggles.showNumber) {
    const code = (doc.metadata.wristbandCode || "").trim();
    if (code) {
      const baseChipFont = baseTitle * fontScale;
      const chipFont = baseChipFont * 1.05 * Math.max(0.3, numberSize);
      const boxH = Math.max(3.2 * numberSize, chipFont * 1.3);
      const boxPad = 0.8;
      const approxCharW = chipFont * 0.66;
      const boxW = Math.max(boxH * 0.9, code.length * approxCharW + boxPad * 2);
      let bx = fieldX;
      let by = fieldY;
      if (numberPosition === "top-left") {
        bx = fieldX;
        by = fieldY;
      } else if (numberPosition === "bottom-left") {
        bx = fieldX;
        by = fieldY + fieldH - boxH;
      } else if (numberPosition === "bottom-center") {
        bx = fieldX + (fieldW - boxW) / 2;
        by = fieldY + fieldH - boxH;
      } else if (numberPosition === "below-name") {
        // Centered across the tile, directly below the last top-label line.
        bx = ox + (cw - boxW) / 2;
        by =
          metrics.lines > 0
            ? topBaselineY + lineH * (metrics.lines - 1) + lineFont * 0.4
            : fieldY;
      }
      numberBoxSvg = `
  <g>
    <rect x="${bx}" y="${by}" width="${boxW}" height="${boxH}" fill="#0f172a" rx="0.6"/>
    <text x="${bx + boxW / 2}" y="${by + boxH * 0.72}" text-anchor="middle" font-size="${chipFont}" font-weight="700" font-family="Inter,ui-sans-serif,system-ui,Helvetica,Arial,sans-serif" fill="#ffffff">${escSvgText(code)}</text>
  </g>`;
    }
  }

  return { headerSvg, overlaySvg: bottomSvg + numberBoxSvg, headerH };
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

function isLightFill(hex: string): boolean {
  const s = hex.trim().toLowerCase();
  if (s === "white" || s === "#fff" || s === "#ffffff") return true;
  const m = /^#([0-9a-f]{6})$/i.exec(s);
  if (!m) return false;
  const n = parseInt(m[1]!, 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return lum > 0.82;
}

function playerMarkerSvg(
  shape: PlayerShape | undefined,
  cx: number,
  cy: number,
  r: number,
  fill: string,
  stroke: string,
  outline: boolean,
): string {
  const effectiveOutline = outline || isLightFill(fill);
  const outlineStroke = outline ? stroke : "#64748b";
  const strokeAttrs = effectiveOutline
    ? `stroke="${outlineStroke}" stroke-width="${outline ? 0.3 : 0.22}"`
    : `stroke="none"`;
  if (shape === "diamond") {
    const d = r * 1.15;
    return `<path d="M ${cx} ${cy - d} L ${cx + d} ${cy} L ${cx} ${cy + d} L ${cx - d} ${cy} Z" fill="${fill}" ${strokeAttrs}/>`;
  }
  if (shape === "square") {
    const d = r * 0.95;
    return `<rect x="${cx - d}" y="${cy - d}" width="${d * 2}" height="${d * 2}" fill="${fill}" ${strokeAttrs}/>`;
  }
  if (shape === "triangle") {
    const d = r * 1.15;
    return `<path d="M ${cx} ${cy - d} L ${cx + d} ${cy + d * 0.85} L ${cx - d} ${cy + d * 0.85} Z" fill="${fill}" ${strokeAttrs}/>`;
  }
  if (shape === "star") {
    const outer = r * 1.2;
    const inner = outer * 0.45;
    let d = "";
    for (let i = 0; i < 10; i++) {
      const rad = (Math.PI / 5) * i - Math.PI / 2;
      const rr = i % 2 === 0 ? outer : inner;
      const x = cx + Math.cos(rad) * rr;
      const y = cy + Math.sin(rad) * rr;
      d += `${i === 0 ? "M" : "L"} ${x} ${y} `;
    }
    d += "Z";
    return `<path d="${d}" fill="${fill}" ${strokeAttrs}/>`;
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
  watermark?: Watermark | null,
): string {
  const vis = doc.printProfile.visibility;
  const zoom = opts.zoom / 100;
  const toggles: PrintLabelToggles = {
    showNumber: opts.labels.showNumber && vis.showWristbandCode,
    showFormation: opts.labels.showFormation,
    showName: opts.labels.showName,
  };
  const labelColor = opts.colorCoding ? groupLabelColor(doc) : "#111827";

  const padScale = opts.cellPadding ?? 1;
  const baseTitle = 2.6;
  const fieldPadX = cw * 0.04 * padScale;
  const innerW = cw - fieldPadX * 2;
  const topMetrics = computeTopHeaderMetrics({
    doc,
    toggles,
    formationPosition: opts.formationPosition,
    formationSize: opts.formationSize,
    namePosition: opts.namePosition,
    nameSize: opts.nameSize,
    baseTitle,
    fontScale: opts.headerFontSize,
    innerW,
    labelWrap: opts.labelWrap,
  });
  const headerH = topHeaderHeight(topMetrics);
  const fieldPadTop = headerH;
  const fieldPadBottom = cw * 0.03 * padScale;
  const fieldOuterW = cw - fieldPadX * 2;
  const fieldOuterH = ch - fieldPadTop - fieldPadBottom;
  const fieldW = fieldOuterW * zoom;
  const fieldH = fieldOuterH * zoom;
  const fieldX = ox + fieldPadX + (fieldOuterW - fieldW) / 2;
  const fieldY = oy + fieldPadTop + (fieldOuterH - fieldH) / 2;

  const pr = iconRadius(opts.iconSize);
  const strokeW = routeStrokeMm(opts.routeWeight);

  const hdr = renderTileTextHeader({
    doc,
    toggles,
    fontScale: opts.headerFontSize,
    labelWrap: opts.labelWrap,
    colorCoding: opts.colorCoding,
    labelColor,
    numberSize: opts.numberSize,
    numberPosition: opts.numberPosition,
    formationSize: opts.formationSize,
    formationPosition: opts.formationPosition,
    nameSize: opts.nameSize,
    namePosition: opts.namePosition,
    ox,
    oy,
    cw,
    padX: fieldPadX,
    padTop: 0,
    fieldX,
    fieldY,
    fieldW,
    fieldH,
    baseTitle,
  });
  const header = hdr.headerSvg;
  const overlay = hdr.overlaySvg;

  const fit = computeFitScale(doc);

  let players = "";
  for (const p of doc.layers.players) {
    const px = fieldX + fitX(p.position.x, fit) * fieldW;
    const py = fieldY + (1 - fitY(p.position.y, fit)) * fieldH;
    players += playerMarkerSvg(p.shape, px, py, pr, p.style.fill, p.style.stroke, opts.playerOutline);
    if (opts.showPlayerLabels && vis.showPlayerLabels) {
      players += `<text x="${px}" y="${py + pr * 0.35}" text-anchor="middle" font-size="${Math.max(1, pr * 0.95)}" fill="${p.style.labelColor}" font-family="Inter,ui-sans-serif,system-ui,Helvetica,Arial,sans-serif" font-weight="bold">${escSvgText(p.label)}</text>`;
    }
  }

  const routes = renderRoutesAndArrows(doc, fieldX, fieldY, fieldW, fieldH, strokeW, Math.min(fieldW, fieldH), opts.arrowSize, fit);

  const ymI = Math.max(0, Math.min(1, opts.yardMarkersIntensity));
  const losI = Math.max(0, Math.min(1, opts.losIntensity));
  let guides = realYardLinesSvg(doc, fieldX, fieldY, fieldW, fieldH, ymI, Math.min(fieldW, fieldH), 0.0035);
  if (losI > 0) {
    const losY = doc.lineOfScrimmageY ?? 0.5;
    const ly = fieldY + (1 - losY) * fieldH;
    guides += `<line x1="${fieldX}" y1="${ly}" x2="${fieldX + fieldW}" y2="${ly}" stroke="#475569" stroke-width="${0.35 * losI}" opacity="${losI}"/>`;
  }

  const bt = Math.max(0, Math.min(2, opts.borderThickness ?? 1));
  const outerStroke = bt === 0 ? "none" : "#cbd5e1";
  const innerStroke = bt === 0 ? "none" : "#e2e8f0";
  return `
  <g>
    <rect x="${ox}" y="${oy}" width="${cw}" height="${ch}" fill="#ffffff" stroke="${outerStroke}" stroke-width="${0.25 * bt}"/>
    ${header}
    <rect x="${fieldX}" y="${fieldY}" width="${fieldW}" height="${fieldH}" fill="#ffffff" stroke="${innerStroke}" stroke-width="${0.25 * bt}"/>
    ${guides}
    ${routes}
    ${players}
    ${overlay}
  </g>`;
}

/** One wristband page tiled as a grid. Returns a single SVG. */
export function compileWristbandGridSvg(
  docs: PlayDocument[],
  opts: WristbandGridOptions,
  watermark?: Watermark | null,
): CompiledPrintSvg {
  const w = opts.widthIn * IN_TO_MM;
  const h = opts.heightIn * IN_TO_MM;
  const { rows, cols } = wristbandGridDims(opts.layout);
  const pad = 1.5 * (opts.cellPadding ?? 1);
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
      body += renderWristbandTile(doc, ox, oy, cellW, cellH, opts, watermark ?? null);
    } else {
      body += `<rect x="${ox}" y="${oy}" width="${cellW}" height="${cellH}" fill="#ffffff" stroke="#e2e8f0" stroke-width="0.25" stroke-dasharray="1 1"/>`;
    }
  }

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}">
  ${SVG_FONT_STYLE}
  <rect width="100%" height="100%" fill="#f1f5f9"/>
  ${body}
  ${watermarkSvg(w, h, watermark ?? null)}
</svg>`;

  return { templateKind: "wristband", svgMarkup: svg, width: w, height: h };
}

/** One PDF page per wristband (tiled with N plays each). */
export function compileWristbandPdfPages(
  docs: PlayDocument[],
  opts: WristbandGridOptions,
  watermark?: Watermark | null,
): string[] {
  if (docs.length === 0) return [];
  const per = wristbandGridDims(opts.layout).rows * wristbandGridDims(opts.layout).cols;
  const pages: string[] = [];
  for (let i = 0; i < docs.length; i += per) {
    const chunk = docs.slice(i, i + per);
    pages.push(compileWristbandGridSvg(chunk, opts, watermark ?? null).svgMarkup);
  }
  return pages;
}

/**
 * Letter-size "sheet" of wristband strips, laid out side-by-side top-aligned.
 * Each strip contains the full tile grid for its chunk of plays. Copies per
 * sheet auto-fits by default to maximize paper use. Users cut strips apart
 * with scissors.
 */
export function compileWristbandSheetPdfPages(
  docs: PlayDocument[],
  opts: WristbandGridOptions,
  copies: "auto" | number,
  watermark?: Watermark | null,
): string[] {
  if (docs.length === 0) return [];
  const pageW = 216;
  const pageH = 279;
  const margin = 8;
  const gutter = 3;
  const stripW = opts.widthIn * IN_TO_MM;
  const stripH = opts.heightIn * IN_TO_MM;

  // Each strip is one wristband tile-grid (holds `per` plays).
  const per = wristbandGridDims(opts.layout).rows * wristbandGridDims(opts.layout).cols;
  const strips: PlayDocument[][] = [];
  for (let i = 0; i < docs.length; i += per) {
    strips.push(docs.slice(i, i + per));
  }

  const autoFit = Math.max(1, Math.floor((pageW - margin * 2 + gutter) / (stripW + gutter)));
  const perRow = copies === "auto" ? autoFit : Math.min(autoFit, Math.max(1, copies));
  const perCol = Math.max(1, Math.floor((pageH - margin * 2 + gutter) / (stripH + gutter)));
  const stripsPerSheet = perRow * perCol;

  const pages: string[] = [];
  for (let i = 0; i < strips.length; i += stripsPerSheet) {
    const chunk = strips.slice(i, i + stripsPerSheet);
    let body = "";
    chunk.forEach((stripDocs, idx) => {
      const col = idx % perRow;
      const row = Math.floor(idx / perRow);
      const x = margin + col * (stripW + gutter);
      const y = margin + row * (stripH + gutter);
      const inner = compileWristbandGridSvg(stripDocs, opts, watermark ?? null).svgMarkup;
      // Extract the <svg> children from the inner strip and translate into place.
      const match = /<svg[^>]*>([\s\S]*?)<\/svg>/.exec(inner);
      const innerBody = match ? match[1] : "";
      body += `<g transform="translate(${x} ${y})">
  <svg width="${stripW}" height="${stripH}" viewBox="0 0 ${stripW} ${stripH}">
    ${innerBody}
  </svg>
</g>`;
    });
    pages.push(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${pageW}mm" height="${pageH}mm" viewBox="0 0 ${pageW} ${pageH}">
  ${SVG_FONT_STYLE}
  <rect width="100%" height="100%" fill="#ffffff"/>
  ${body}
</svg>`);
  }
  return pages;
}
