"use client";

import { useCallback, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ExternalLink, RotateCcw } from "lucide-react";
import {
  saveLibraryOverrideAction,
  deleteLibraryOverrideAction,
} from "@/app/actions/library-admin";
import type { PlayDocument } from "@/domain/play/types";
import type { PlaybookSettings } from "@/domain/playbook/settings";
import type { LibraryVariant } from "@/lib/learn/variant";
import { PlayEditorClient } from "@/features/editor/PlayEditorClient";

/** Client wrapper for the route override editor.
 *
 *  Routes are variant-agnostic, so this editor is simpler than the
 *  play/defense override editor: no variant-switcher dropdown, no
 *  metadata form. The override row is keyed on
 *  `(slug, DEFAULT_LIBRARY_VARIANT)` — one row per route family.
 *
 *  Save adapter routes through `saveLibraryOverrideAction` (same path
 *  the play override editor uses) — one row in
 *  `library_concept_overrides` per route. The route library page
 *  reads from the same key.
 */
export function RouteOverrideEditor({
  slug,
  variant,
  routeName,
  hasOverride,
  startingDoc,
  defaultDoc: _defaultDoc,
  playbookSettings,
}: {
  slug: string;
  variant: LibraryVariant;
  routeName: string;
  hasOverride: boolean;
  startingDoc: PlayDocument;
  /** Not currently used by the route editor — there is no metadata
   *  form to seed. Kept in the prop list for symmetry with the play
   *  editor in case route-level prose overrides arrive later. */
  defaultDoc: PlayDocument;
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
        setStatusMsg(`Saved · ${new Date().toLocaleTimeString()}`);
      }
      return res;
    },
    [slug, variant],
  );

  const handleResetToCatalog = useCallback(() => {
    if (!overrideExists) return;
    if (
      !window.confirm(
        `Delete the override for the ${routeName} route? The library page will revert to the catalog default. This cannot be undone.`,
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
  }, [overrideExists, routeName, slug, variant, router]);

  const libraryHref = `/learn/library/routes/${slug}`;

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
                ? "Delete the override and revert this route to the catalog default."
                : "No override exists — already on catalog default."
            }
          >
            <RotateCcw className="size-3" />
            {isResetting ? "Resetting…" : "Reset to catalog default"}
          </button>
        </div>
      </div>

      <header className="mb-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
          Library admin · Route override
        </p>
        <h1 className="mt-0.5 text-2xl font-extrabold tracking-tight">
          {routeName}{" "}
          <span className="text-lg font-semibold text-muted">route</span>
        </h1>
        <p className="mt-1 text-xs text-muted">
          {overrideExists ? (
            <>
              Editing the saved override for this route. Every change
              autosaves to{" "}
              <code className="rounded bg-surface-inset px-1">library_concept_overrides</code>
              ; the public page picks it up on next render.
            </>
          ) : (
            <>
              No override yet — you&apos;re editing the catalog skeleton.
              The first save will create the override row.
            </>
          )}
          {statusMsg && (
            <span className="ml-2 text-primary">· {statusMsg}</span>
          )}
        </p>
      </header>

      <PlayEditorClient
        playId={`library-override:routes:${slug}`}
        playbookId="library-override"
        playbookName="Library route override"
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
