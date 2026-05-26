// Concept resolver — the single async surface that says "for this
// concept name + variant, what's the canonical PlaySpec?"
//
// Architecture (after 2026-05-26):
//
//   library page  ──┐
//                   ├─► resolveConceptSkeleton(name, {variant, strength})
//   Cal compose_play┘         │
//                              │
//                              ▼
//          ┌──────────────────────────────────────┐
//          │ 1. library_concept_overrides hit?    │
//          │    → derive spec from override.document │
//          │    → use override.coach_notes if set │
//          │    → return spec, notes, isOverride=true │
//          │                                      │
//          │ 2. otherwise:                        │
//          │    → generateConceptSkeleton(...)    │
//          │    → return spec, notes, isOverride=false │
//          └──────────────────────────────────────┘
//
// Why we route both surfaces through here: when an admin saves an
// override via the library editor, that edit should BE the truth
// for every future read — public library page, Cal's compose_play,
// Cal's chat-time concept citations. Before this resolver Cal
// imported `generateConceptSkeleton` directly and never saw the
// override.
//
// Strength caveat. Overrides are saved at a single strength (the
// admin editor renders the catalog default at strength="right"
// before letting the admin edit). When the caller requests
// strength="left", we fall through to `generateConceptSkeleton`
// which mirrors the skeleton geometrically. Mirroring an arbitrary
// admin-edited document is not yet implemented — flipping player
// IDs / route waypoints across the y-axis is non-trivial. Audit
// fixes that need to apply to BOTH strengths should be done at the
// skeleton-generator code level, not via the override.

import "server-only";

import {
  generateConceptSkeleton,
  type ConceptSkeletonOptions,
  type SkeletonResult,
} from "@/domain/play/conceptSkeleton";
import { loadLibraryOverride } from "@/lib/learn/overrides";
import { coachDiagramToPlaySpec } from "@/domain/play/specParser";
import { playDocumentToCoachDiagram } from "@/lib/coach-ai/play-tools";
import { projectSpecToNotes } from "@/lib/coach-ai/notes-from-spec";
import { toLearnSlug } from "@/lib/learn/links";

export type ResolvedSkeleton =
  | (Extract<SkeletonResult, { ok: true }> & { isOverride: boolean })
  | Extract<SkeletonResult, { ok: false }>;

/** Resolve a concept's PlaySpec, preferring the saved override.
 *
 *  Returns the same `SkeletonResult` shape `generateConceptSkeleton`
 *  returns (so callers can swap in without other changes), plus an
 *  `isOverride` flag on the success branch so the caller can show a
 *  "served from override" badge or skip a downstream cap (e.g. an
 *  override may already include per-playbook depth caps the auto-cap
 *  step would re-apply harmlessly).
 *
 *  Returns the synchronous skeleton when:
 *  - No override row exists for (slug, variant)
 *  - The strength requested is not the override's strength (today:
 *    overrides are right-strength only; left strength falls through)
 *  - The override row exists but its document failed to parse
 *    (loadLibraryOverride already logged the malformation) */
export async function resolveConceptSkeleton(
  conceptName: string,
  opts: ConceptSkeletonOptions,
): Promise<ResolvedSkeleton> {
  const strength = opts.strength ?? "right";
  // Overrides are saved at right-strength only for now. See file
  // header.
  if (strength === "right") {
    const slug = toLearnSlug(conceptName);
    const override = await loadLibraryOverride(slug, opts.variant);
    if (override) {
      try {
        const diagram = playDocumentToCoachDiagram(
          override.document,
          conceptName,
        );
        const spec = coachDiagramToPlaySpec(diagram, {
          variant: opts.variant,
        });
        const notes =
          override.coachNotes ?? projectSpecToNotes(spec);
        return {
          ok: true,
          concept: conceptName,
          spec,
          notes,
          isOverride: true,
        };
      } catch (err) {
        // Override exists but can't be derived to a PlaySpec. Log
        // and fall through to the code-generated skeleton so the
        // caller still gets a valid result. The admin can revisit
        // the override (or delete it) from the library admin page.
        console.warn(
          `[concept-resolver] override for ${slug}:${opts.variant} failed to derive spec — falling back to skeleton`,
          err,
        );
      }
    }
  }
  // Synchronous code-generated path. Return as-is plus
  // isOverride=false on the success branch; preserve the failure
  // branch's shape verbatim.
  const result = generateConceptSkeleton(conceptName, opts);
  if (result.ok) {
    return { ...result, isOverride: false };
  }
  return result;
}
