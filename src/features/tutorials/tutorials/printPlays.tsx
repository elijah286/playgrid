import type { TutorialDef } from "../engine/types";

export const PRINT_PLAYS_TUTORIAL: TutorialDef = {
  id: "print_v1",
  title: "Print plays",
  summary:
    "Send any selection of plays to a print-ready page — wristband, call sheet, full playbook PDF, or a single-play coach card. ~2 minutes.",
  supportedVariants: ["flag_5v5", "flag_6v6", "flag_7v7", "tackle_11"],
  steps: [
    {
      id: "welcome",
      title: "Get plays off the screen",
      body: () =>
        "The print page produces a printable PDF in any of three formats: a multi-column call sheet for the sideline binder, a one-or-two-per-page playbook PDF for the install, or a compact wrist coach for player armbands. Same plays, same data — different layout.",
      anchor: { kind: "center" },
      advance: { kind: "next" },
    },
    {
      id: "pick-format",
      title: "Pick a format",
      body: () =>
        "Open the Format & preset section to choose Call sheet, Playbook, or Wrist coach. Each one has its own preview and its own customize options. Wrist coaches are gated to Team Coach tier — call sheets and playbook PDFs are free.",
      anchor: { kind: "anchor", key: "print-format-section" },
      advance: { kind: "next" },
      dimBackground: false,
    },
    {
      id: "preview",
      title: "Live preview",
      body: () =>
        "Every change in the panels updates the preview on the right in real time. Click the preview to open it fullscreen, or use the page arrows above it when the doc spans multiple pages.",
      anchor: { kind: "anchor", key: "print-preview" },
      advance: { kind: "next" },
      dimBackground: false,
    },
    {
      id: "customize",
      title: "Customize (advanced)",
      body: () =>
        "Open the Customize section to tune diagram scale, columns, page break behavior, and which labels show up (player letters, hash marks, yard numbers, routes, notes). Settings persist as a preset you can reuse — or save a system preset (admins only) for the whole team.",
      anchor: { kind: "anchor", key: "print-customize-section" },
      advance: { kind: "next" },
      dimBackground: false,
    },
    {
      id: "export",
      title: "Print or download PDF",
      body: () =>
        "Print opens your browser's print dialog — pick \"Save as PDF\" there for a one-shot export. PDF downloads a multi-page file directly. Wristband formats need a Team Coach subscription; everything else is free.",
      anchor: { kind: "anchor", key: "print-export-buttons" },
      advance: { kind: "next" },
      dimBackground: false,
    },
    {
      id: "done",
      title: "You're set",
      body: () =>
        "Pick plays, pick format, customize, export. Settings stick as presets per coach — open this page again for a different game and your last setup is ready.",
      anchor: { kind: "center" },
      advance: { kind: "next" },
      nextLabel: "Got it",
    },
  ],
};
