/**
 * Rewrite a Coach Cal assistant message for clipboard / social-paste use.
 *
 * Cal embeds plays as ```play``` fences carrying raw `CoachDiagram` JSON.
 * In the chat surface those render as visual diagrams; in plain-text
 * targets (Facebook's composer, Twitter, plain email) the JSON pastes
 * through verbatim, which is unusable.
 *
 * This helper walks each fence, parses it back into a `CoachDiagram`,
 * derives a `PlaySpec`, and runs the deterministic `projectSpecToNotes`
 * projector — producing the same coach prose Cal would write by hand.
 * Surrounding markdown is left untouched.
 *
 * `play-ref` fences (saved-play citations by id) collapse to a short
 * "Play: <name>" placeholder; the actual diagram lives behind a login.
 */

import type { CoachDiagram } from "@/features/coach-ai/coachDiagramConverter";
import { coachDiagramToPlaySpec } from "@/domain/play/specParser";
import { projectSpecToNotes } from "./notes-from-spec";

const PLAY_FENCE_RE = /```play\r?\n([\s\S]*?)```/g;
const PLAY_REF_FENCE_RE = /```play-ref\r?\n([\s\S]*?)```/g;

export function rewritePlayFencesForCopy(markdown: string): string {
  let out = markdown.replace(PLAY_REF_FENCE_RE, (_match, body: string) => {
    const trimmed = body.trim();
    if (!trimmed) return "";
    try {
      const obj = JSON.parse(trimmed) as { id?: string; name?: string };
      const label = obj.name || obj.id || "Play";
      return `**Play: ${label}**`;
    } catch {
      return "**Play**";
    }
  });

  out = out.replace(PLAY_FENCE_RE, (_match, body: string) => {
    const trimmed = body.trim();
    if (!trimmed) return "";
    let title = "Play";
    try {
      const diagram = JSON.parse(trimmed) as CoachDiagram;
      if (typeof diagram.title === "string" && diagram.title.length > 0) {
        title = diagram.title;
      }
      const spec = coachDiagramToPlaySpec(diagram);
      const notes = projectSpecToNotes(spec).trim();
      if (notes) return notes;
    } catch {
      // Fall through to the title-only fallback below.
    }
    return `**Play: ${title}**`;
  });

  return out;
}
