import type { PlaybookRoster } from "../team/roster";
import type { TeamTheme } from "../team/theme";

export type CoverPageInput = {
  playbookName: string;
  teamName: string;
  playTitle?: string;
  roster: PlaybookRoster;
  theme: TeamTheme;
};

const COVER_W = 216;
const COVER_H = 279;

function escXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function listColumn(title: string, items: string[], x: number, y0: number, ink: string, muted: string) {
  let y = y0 + 5;
  let block = `<text x="${x}" y="${y}" font-size="3.6" font-weight="600" fill="${ink}" font-family="system-ui,sans-serif">${escXml(title)}</text>`;
  y += 8;
  if (items.length === 0) {
    block += `<text x="${x}" y="${y}" font-size="3.2" fill="${muted}" font-family="system-ui,sans-serif">—</text>`;
    return block;
  }
  for (const item of items.slice(0, 18)) {
    block += `<text x="${x}" y="${y}" font-size="3.1" fill="${muted}" font-family="system-ui,sans-serif">• ${escXml(item)}</text>`;
    y += 5.2;
  }
  if (items.length > 18) {
    block += `<text x="${x}" y="${y}" font-size="2.8" fill="${muted}" font-family="system-ui,sans-serif">… +${items.length - 18} more</text>`;
  }
  return block;
}

/** Letter-size portrait cover for playbook / play package PDFs */
export function compileCoverPageSvg(input: CoverPageInput): {
  svgMarkup: string;
  width: number;
  height: number;
} {
  const { playbookName, teamName, playTitle, roster, theme } = input;
  const t = theme;
  const ink = t.ink;
  const accent = t.accent;
  const primary = t.primary;
  const surface = t.surface;
  const pageBg = t.pageBg;
  const muted = "#64748b";

  const colW = (COVER_W - 36) / 2;
  const leftX = 18;
  const rightX = leftX + colW + 8;
  const rosterY = COVER_H * 0.52;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${COVER_W}mm" height="${COVER_H}mm" viewBox="0 0 ${COVER_W} ${COVER_H}">
  <defs>
    <linearGradient id="coverBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${primary};stop-opacity:0.95" />
      <stop offset="55%" style="stop-color:${accent};stop-opacity:0.35" />
      <stop offset="100%" style="stop-color:${surface};stop-opacity:0.9" />
    </linearGradient>
    <filter id="softShadow" x="-5%" y="-5%" width="110%" height="110%">
      <feDropShadow dx="0" dy="1.5" stdDeviation="2" flood-color="${ink}" flood-opacity="0.12"/>
    </filter>
  </defs>
  <rect width="100%" height="100%" fill="url(#coverBg)"/>
  <rect x="14" y="14" width="${COVER_W - 28}" height="${COVER_H - 28}" rx="4" ry="4" fill="${pageBg}" fill-opacity="0.92" filter="url(#softShadow)"/>
  <rect x="14" y="14" width="${COVER_W - 28}" height="10" rx="4" ry="4" fill="${primary}" />
  <text x="${COVER_W / 2}" y="${COVER_H * 0.14}" text-anchor="middle" font-size="5.5" font-weight="700" fill="${ink}" font-family="system-ui,sans-serif" letter-spacing="0.04em">${escXml(playbookName)}</text>
  <text x="${COVER_W / 2}" y="${COVER_H * 0.2}" text-anchor="middle" font-size="3.4" fill="${accent}" font-family="system-ui,sans-serif" font-weight="600">${escXml(teamName)}</text>
  ${
    playTitle
      ? `<text x="${COVER_W / 2}" y="${COVER_H * 0.265}" text-anchor="middle" font-size="3" fill="${muted}" font-family="system-ui,sans-serif">${escXml(playTitle)}</text>`
      : ""
  }
  <line x1="28" y1="${COVER_H * 0.31}" x2="${COVER_W - 28}" y2="${COVER_H * 0.31}" stroke="${surface}" stroke-width="0.5" opacity="0.9"/>
  <text x="${COVER_W / 2}" y="${COVER_H * 0.36}" text-anchor="middle" font-size="2.6" fill="${muted}" font-family="system-ui,sans-serif" letter-spacing="0.25em">PLAYGRID</text>
  ${listColumn("Staff", roster.staff, leftX, rosterY, ink, muted)}
  ${listColumn("Players", roster.players, rightX, rosterY, ink, muted)}
  <text x="${COVER_W / 2}" y="${COVER_H - 16}" text-anchor="middle" font-size="2.5" fill="${muted}" font-family="system-ui,sans-serif">Official playbook · ${new Date().getFullYear()}</text>
</svg>`;

  return { svgMarkup: svg, width: COVER_W, height: COVER_H };
}
