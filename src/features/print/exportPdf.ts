"use client";

import { jsPDF } from "jspdf";
import { svg2pdf } from "svg2pdf.js";

/** svg2pdf resolves font-family against jsPDF's built-in PDF fonts, which are
 *  only Helvetica/Times/Courier. Any other family (Inter, system-ui) falls
 *  back to Times, producing serif text in the exported PDF. Rewrite the font
 *  stacks to lead with helvetica and drop the embedded <style> block so the
 *  PDF exporter picks the sans-serif built-in. Browser previews are
 *  unaffected — this runs only on the export path. */
function sanitizeSvgForPdf(svgMarkup: string): string {
  return svgMarkup
    .replace(
      /<style>[\s\S]*?<\/style>/g,
      "<style>text{font-family:helvetica;}</style>",
    )
    .replace(/font-family="[^"]*"/g, 'font-family="helvetica"')
    .replace(/font-family:\s*[^;"']+/g, "font-family:helvetica");
}

/** Belt-and-braces: after parsing, explicitly set font-family on every <text>
 *  and <tspan> so svg2pdf never has to resolve a missing family via CSS. */
function forceHelveticaOnTextNodes(svg: Element) {
  const nodes = svg.querySelectorAll("text, tspan");
  nodes.forEach((n) => {
    (n as Element).setAttribute("font-family", "helvetica");
    const style = (n as HTMLElement).getAttribute("style");
    if (style) {
      (n as HTMLElement).setAttribute(
        "style",
        style.replace(/font-family\s*:\s*[^;]+;?/g, ""),
      );
    }
  });
}

export async function exportSvgToPdf(svgMarkup: string, filename: string) {
  const parser = new DOMParser();
  const parsed = parser.parseFromString(sanitizeSvgForPdf(svgMarkup), "image/svg+xml");
  const svg = parsed.documentElement;
  forceHelveticaOnTextNodes(svg);
  const width = Number(svg.getAttribute("width")?.replace("mm", "") ?? 216);
  const height = Number(svg.getAttribute("height")?.replace("mm", "") ?? 279);

  const pdf = new jsPDF({
    orientation: width > height ? "landscape" : "portrait",
    unit: "mm",
    format: [Math.max(width, 10), Math.max(height, 10)],
  });
  pdf.setFont("helvetica", "normal");

  await svg2pdf(svg, pdf, { x: 0, y: 0, width, height });
  pdf.save(filename);
}

export async function exportSvgsToMultiPagePdf(svgPages: string[], filename: string) {
  if (svgPages.length === 0) return;

  const parser = new DOMParser();
  let pdf: jsPDF | null = null;

  for (const svgMarkup of svgPages) {
    const parsed = parser.parseFromString(sanitizeSvgForPdf(svgMarkup), "image/svg+xml");
    const svg = parsed.documentElement;
    forceHelveticaOnTextNodes(svg);
    const width = Number(svg.getAttribute("width")?.replace("mm", "") ?? 216);
    const height = Number(svg.getAttribute("height")?.replace("mm", "") ?? 279);
    const orientation = width > height ? "landscape" : "portrait";
    const fmt: [number, number] = [Math.max(width, 10), Math.max(height, 10)];

    if (!pdf) {
      pdf = new jsPDF({ orientation, unit: "mm", format: fmt });
      pdf.setFont("helvetica", "normal");
      await svg2pdf(svg, pdf, { x: 0, y: 0, width, height });
    } else {
      pdf.addPage(fmt, orientation);
      pdf.setFont("helvetica", "normal");
      await svg2pdf(svg, pdf, { x: 0, y: 0, width, height });
    }
  }

  pdf!.save(filename);
}

/** Open the compiled PDF in a new tab and trigger the browser print dialog. */
export async function openSvgsInPrintTab(svgPages: string[]) {
  if (svgPages.length === 0) return;
  const parser = new DOMParser();
  let pdf: jsPDF | null = null;
  for (const svgMarkup of svgPages) {
    const parsed = parser.parseFromString(sanitizeSvgForPdf(svgMarkup), "image/svg+xml");
    const svg = parsed.documentElement;
    forceHelveticaOnTextNodes(svg);
    const width = Number(svg.getAttribute("width")?.replace("mm", "") ?? 216);
    const height = Number(svg.getAttribute("height")?.replace("mm", "") ?? 279);
    const orientation = width > height ? "landscape" : "portrait";
    const fmt: [number, number] = [Math.max(width, 10), Math.max(height, 10)];
    if (!pdf) {
      pdf = new jsPDF({ orientation, unit: "mm", format: fmt });
      pdf.setFont("helvetica", "normal");
      await svg2pdf(svg, pdf, { x: 0, y: 0, width, height });
    } else {
      pdf.addPage(fmt, orientation);
      pdf.setFont("helvetica", "normal");
      await svg2pdf(svg, pdf, { x: 0, y: 0, width, height });
    }
  }
  const blobUrl = pdf!.output("bloburl");
  const win = window.open(blobUrl as unknown as string, "_blank");
  if (win) {
    win.addEventListener("load", () => {
      try {
        win.focus();
        win.print();
      } catch {
        // swallow — user can Cmd+P manually
      }
    });
  }
}
