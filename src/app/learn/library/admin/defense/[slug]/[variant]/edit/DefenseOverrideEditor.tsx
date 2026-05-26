"use client";

import { useCallback, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ExternalLink, RotateCcw } from "lucide-react";
import {
  saveLibraryOverrideAction,
  saveLibraryMetadataAction,
  deleteLibraryOverrideAction,
} from "@/app/actions/library-admin";
import type { PlayDocument } from "@/domain/play/types";
import type { PlaybookSettings } from "@/domain/playbook/settings";
import type { LibraryVariant } from "@/lib/learn/variant";
import { PlayEditorClient } from "@/features/editor/PlayEditorClient";
import { MetadataEditor } from "@/app/learn/library/admin/plays/[slug]/[variant]/edit/MetadataEditor";

/** Client wrapper for the admin defense override editor. Parallel to
 *  `LibraryOverrideEditor` (the offense edit page), with the same
 *  contract:
 *
 *  - Routes saves through the same `saveLibraryOverrideAction` /
 *    `saveLibraryMetadataAction` server actions (one override table
 *    serves both offense + defense — distinguished by slug).
 *  - PlayEditor is the SAME `PlayEditorClient` the in-app builder
 *    uses (Rule 14: one render path), libraryMode=false so the
 *    full editor chrome is available.
 *  - Edits flow to Cal via `resolveDefensiveAlignment` in
 *    src/lib/learn/defense-resolver.ts — admin moves a CB and the
 *    next `compose_defense` call sees the moved CB.
 *
 *  The metadata editor (description, when-to-use, weaknesses) is
 *  the same component plays use; the labels read "Description" /
 *  "When to call it" / "Known weaknesses" via the prop overrides
 *  below to match the public defense page's section headings.
 */
export function DefenseOverrideEditor({
  slug,
  variant,
  variantSlug,
  defenseName,
  variantLabel,
  libraryVariantSlugs,
  hasOverride,
  startingDoc,
  defaultDoc,
  catalogDefaults,
  initialMetadata,
  playbookSettings,
}: {
  slug: string;
  variant: LibraryVariant;
  variantSlug: string;
  defenseName: string;
  variantLabel: string;
  libraryVariantSlugs: Array<{ variant: LibraryVariant; slug: string; label: string }>;
  hasOverride: boolean;
  startingDoc: PlayDocument;
  defaultDoc: PlayDocument;
  catalogDefaults: {
    description: string;
    body: string;
    whenToUse: string;
    commonMistakes: string[];
  };
  initialMetadata: {
    descriptionOverride: string | null;
    bodyOverride: string | null;
    whenToUseOverride: string | null;
    commonMistakesOverride: string[] | null;
  };
  playbookSettings: PlaybookSettings;
}) {
  const router = useRouter();
  const [overrideExists, setOverrideExists] = useState(hasOverride);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [isResetting, startReset] = useTransition();

  const saveAdapter = useCallback(
    async (doc: PlayDocument) => {
      const notes = doc.metadata.notes?.trim() || null;
      const res = await saveLibraryOverrideAction({
        slug,
        variant,
        document: doc,
        coachNotes: notes,
      });
      if (res.ok) {
        setOverrideExists(true);
        setStatusMsg(`Saved override · ${new Date().toLocaleTimeString()}`);
      }
      return res;
    },
    [slug, variant],
  );

  const saveMetadata = useCallback(
    async (metadata: {
      descriptionOverride: string | null;
      bodyOverride: string | null;
      whenToUseOverride: string | null;
      commonMistakesOverride: string[] | null;
    }) => {
      const res = await saveLibraryMetadataAction({
        slug,
        variant,
        metadata,
        seedDocument: defaultDoc,
      });
      if (res.ok) {
        setOverrideExists(true);
        setStatusMsg(`Saved metadata · ${new Date().toLocaleTimeString()}`);
        router.refresh();
      }
      return res;
    },
    [slug, variant, defaultDoc, router],
  );

  const handleResetToCatalog = useCallback(() => {
    if (!overrideExists) return;
    if (
      !window.confirm(
        `Delete the override for ${defenseName} (${variantLabel})? The library page will revert to the catalog default. This cannot be undone.`,
      )
    )
      return;
    startReset(async () => {
      const res = await deleteLibraryOverrideAction({ slug, variant });
      if (res.ok) {
        setOverrideExists(false);
        setStatusMsg("Reverted to catalog default. Reloading…");
        router.refresh();
        setTimeout(() => window.location.reload(), 200);
      } else {
        setStatusMsg(`Reset failed: ${res.error}`);
      }
    });
  }, [overrideExists, defenseName, variantLabel, slug, variant, router]);

  const libraryHref = `/learn/library/defense/${slug}`;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 text-foreground">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link
          href={libraryHref}
          className="inline-flex items-center gap-1 text-xs text-muted hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Back to public page
        </Link>
        <div className="flex items-center gap-2">
          {libraryVariantSlugs.length > 1 && (
            <select
              defaultValue={variantSlug}
              onChange={(e) => {
                const next = e.target.value;
                if (next !== variantSlug) {
                  router.push(`/learn/library/admin/defense/${slug}/${next}/edit`);
                }
              }}
              className="rounded-md border border-border bg-surface-raised px-2 py-1 text-xs"
              aria-label="Switch variant"
            >
              {libraryVariantSlugs.map((v) => (
                <option key={v.slug} value={v.slug}>
                  {v.label}
                </option>
              ))}
            </select>
          )}
          <Link
            href={libraryHref}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-raised px-2 py-1 text-xs hover:bg-surface-inset"
          >
            View public
            <ExternalLink className="size-3" />
          </Link>
          <button
            type="button"
            onClick={handleResetToCatalog}
            disabled={!overrideExists || isResetting}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-raised px-2 py-1 text-xs text-muted hover:bg-surface-inset disabled:cursor-not-allowed disabled:opacity-40"
            title={
              overrideExists
                ? "Delete the override and revert this variant to the catalog default."
                : "No override exists — already on catalog default."
            }
          >
            <RotateCcw className="size-3" />
            {isResetting ? "Resetting…" : "Reset to catalog default"}
          </button>
        </div>
      </div>

      <header className="mb-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-600">
          Library admin · Defense override
        </p>
        <h1 className="mt-0.5 text-2xl font-extrabold tracking-tight">
          {defenseName}
          <span className="ml-2 text-lg font-semibold text-muted">
            · {variantLabel}
          </span>
        </h1>
        <p className="mt-1 text-xs text-muted">
          {overrideExists ? (
            <>
              Editing the saved override for this defense. Every change
              autosaves to{" "}
              <code className="rounded bg-surface-inset px-1">library_concept_overrides</code>
              ; the public defense page AND Cal&apos;s defense tools pick it up on
              next render.
            </>
          ) : (
            <>
              No override yet — you&apos;re editing the catalog alignment.
              The first save will create the override row.
            </>
          )}
          {statusMsg && <span className="ml-2 text-primary">· {statusMsg}</span>}
        </p>
      </header>

      <MetadataEditor
        catalogDefaults={catalogDefaults}
        initialMetadata={initialMetadata}
        onSave={saveMetadata}
      />

      <PlayEditorClient
        playId={`library-override:defense:${slug}:${variant}`}
        playbookId="library-override"
        playbookName="Library override"
        playbookVariant={variant}
        initialDocument={startingDoc}
        initialNav={[]}
        initialGroups={[]}
        allFormations={[]}
        opponentFormations={[]}
        playbookSettings={playbookSettings}
        canEdit={true}
        libraryMode={false}
        saveAdapter={saveAdapter}
      />
    </div>
  );
}
