import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ROUTE_TEMPLATES } from "@/domain/play/routeTemplates";
import type { RouteTemplate } from "@/domain/play/routeTemplates";
import type { PlaySpec } from "@/domain/play/spec";
import { PLAY_SPEC_SCHEMA_VERSION } from "@/domain/play/spec";
import { playSpecToCoachDiagram } from "@/domain/play/specRenderer";
import { coachDiagramToPlayDocument } from "@/features/coach-ai/coachDiagramConverter";
import { defaultSettingsForVariant } from "@/domain/playbook/settings";
import { isCurrentUserSiteAdmin } from "@/lib/learn/access";
import { loadLibraryOverride } from "@/lib/learn/overrides";
import { toLearnSlug } from "@/lib/learn/links";
import { DEFAULT_LIBRARY_VARIANT } from "@/lib/learn/variant";
import { RouteOverrideEditor } from "./RouteOverrideEditor";

// Admin-only — no public crawling, no static generation. The page
// reads the latest override on every request so admins always start
// from the live state of `library_concept_overrides`.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Edit library route (admin) · XO Gridmaker",
  robots: { index: false, follow: false },
};

function findRouteBySlug(slug: string): RouteTemplate | null {
  return ROUTE_TEMPLATES.find((r) => toLearnSlug(r.name) === slug) ?? null;
}

function defaultDepthFor(route: RouteTemplate): number {
  const range = route.constraints?.depthRangeYds;
  if (range) {
    return Math.round((range.min + range.max) / 2);
  }
  return 8;
}

/** Admin override-edit page for ROUTES. Routes are variant-agnostic
 *  (a Slant is a Slant in flag and tackle), so we key overrides on
 *  `(slug, DEFAULT_LIBRARY_VARIANT)` — one row per route. The library
 *  page reads the same key when applying overrides.
 *
 *  The editor renders the SAME `PlayEditorClient` the in-app builder
 *  uses (Rule 14: one render path). Admin can move the receiver,
 *  reshape the route, retitle, etc. Edits autosave through
 *  `saveLibraryOverrideAction` → the `library_concept_overrides` table. */
export default async function LibraryAdminEditRoutePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  if (!(await isCurrentUserSiteAdmin())) notFound();

  const { slug } = await params;
  const route = findRouteBySlug(slug);
  if (!route) notFound();

  // Routes use a canonical demo variant. 5v5 flag is the default
  // library backdrop and matches the public route page.
  const variant = DEFAULT_LIBRARY_VARIANT;
  const depth = defaultDepthFor(route);

  // Catalog default: a minimal Spread Doubles formation running ONLY
  // the route under edit, on @X. This mirrors the public route page
  // exactly so the editor opens with the same diagram a coach sees.
  const spec: PlaySpec = {
    schemaVersion: PLAY_SPEC_SCHEMA_VERSION,
    variant,
    title: `${route.name} demo`,
    playType: "offense",
    formation: { name: "Spread Doubles", strength: "right" },
    assignments: [
      {
        player: "X",
        confidence: "high",
        action: { kind: "route", family: route.name, depthYds: depth },
      },
    ],
  };

  const { diagram } = playSpecToCoachDiagram(spec);
  // Keep only @X and QB — the other receivers crowd the diagram and
  // aren't part of what we're teaching on a single-route page. The
  // admin edits the same trimmed diagram a coach sees.
  const KEEP = new Set(["QB", "X"]);
  const slimDiagram = {
    ...diagram,
    players: diagram.players.filter((p) => KEEP.has(p.id)),
    routes: (diagram.routes ?? []).filter((r) => KEEP.has(r.from)),
  };
  const defaultDoc = coachDiagramToPlayDocument(slimDiagram);
  const playbookSettings = defaultSettingsForVariant(variant);

  const override = await loadLibraryOverride(slug, variant);
  const baseDoc = override?.document ?? defaultDoc;
  const startingDoc = override?.coachNotes
    ? {
        ...baseDoc,
        metadata: { ...baseDoc.metadata, notes: override.coachNotes },
      }
    : baseDoc;

  return (
    <RouteOverrideEditor
      slug={slug}
      variant={variant}
      routeName={route.name}
      hasOverride={override != null}
      startingDoc={startingDoc}
      defaultDoc={defaultDoc}
      playbookSettings={playbookSettings}
    />
  );
}
