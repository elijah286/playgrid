import type { PlayDocument } from "../play/types";
import { pathGeometryToSvgD, routeToPathGeometry } from "../play/geometry";

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

/** Shared print compiler: structured play → SVG (not a screenshot) */
export function compilePlayToSvg(
  doc: PlayDocument,
  kind: PrintTemplateKind,
): CompiledPrintSvg {
  const def =
    kind === "wristband" ? defaultWristbandTemplate : defaultFullSheetTemplate;
  const { page, diagramBox } = def;
  const w = page.orientation === "landscape" ? page.heightMm : page.widthMm;
  const h = page.orientation === "landscape" ? page.widthMm : page.heightMm;
  const scale = doc.printProfile.wristband.diagramScale * doc.printProfile.fontScale;
  const vis = doc.printProfile.visibility;

  const title = doc.metadata.coachName;
  const code = vis.showWristbandCode ? doc.metadata.wristbandCode : "";
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
      playerCircles += `<text x="${px}" y="${py + 0.9}" text-anchor="middle" font-size="${fontMeta}" fill="${p.style.labelColor}" font-family="system-ui,sans-serif">${p.label}</text>`;
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
    routePaths += `<path d="${d}" fill="none" stroke="${r.style.stroke}" stroke-width="${r.style.strokeWidth * 0.35}" ${r.style.dash ? `stroke-dasharray="${r.style.dash}"` : ""}/>`;
  }

  const notes =
    vis.showNotes && doc.layers.annotations.length
      ? doc.layers.annotations.map((a) => a.text).join(" · ")
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
