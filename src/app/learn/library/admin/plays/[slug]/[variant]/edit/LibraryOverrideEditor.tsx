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

/** Client wrapper for the admin override editor. Owns:
 *
 *  - The override status (`hasOverride`) so the "Reset to catalog
 *    default" button can flip between enabled / disabled.
 *  - The save adapter, which routes through `saveLibraryOverrideAction`
 *    instead of the default `savePlayVersionAction` — same autosave
 *    behaviour, different persistence target.
 *  - The variant-switcher dropdown, so an admin walking the concept
 *    catalog can jump between (5v5, 7v7, etc.) without bouncing back
 *    to the public page.
 *
 *  The editor itself stays the SAME `PlayEditorClient` the in-app
 *  builder uses (Rule 14: one render path). `libraryMode={false}` so
 *  full chrome (toolbar, sidebar, header) is available — the admin
 *  needs every editing affordance, not the read-only library shell.
 */
export function LibraryOverrideEditor({
  slug,
  variant,
  variantSlug,
  conceptName,
  variantLabel,
  libraryVariantSlugs,
  hasOverride,
  startingDoc,
  playbookSettings,
}: {
  slug: string;
  variant: LibraryVariant;
  variantSlug: string;
  conceptName: string;
  variantLabel: string;
  libraryVariantSlugs: Array<{ variant: LibraryVariant; slug: string; label: string }>;
  hasOverride: boolean;
  /** Document to render initially — either the override (when one
   *  exists for this slug+variant) or the catalog skeleton. The
   *  document's `metadata.notes` field is the source of truth for
   *  the override row's `coach_notes` column, so we don't need to
   *  pass the notes separately. */
  startingDoc: PlayDocument;
  playbookSettings: PlaybookSettings;
}) {
  const router = useRouter();
  const [overrideExists, setOverrideExists] = useState(hasOverride);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [isResetting, startReset] = useTransition();

  // Save adapter — every autosave from PlayEditorClient routes through
  // this instead of `savePlayVersionAction`. The PlayDocument-level
  // notes live on `doc.metadata.notes`, so we hoist them onto the
  // override row's separate `coach_notes` column (kept distinct from
  // the doc so the library page can read notes without parsing the
  // whole document for that single field).
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

  const handleResetToCatalog = useCallback(() => {
    if (!overrideExists) return;
    if (
      !window.confirm(
        `Delete the override for ${conceptName} (${variantLabel})? The library page will revert to the catalog default. This cannot be undone.`,
      )
    )
      return;
    startReset(async () => {
      const res = await deleteLibraryOverrideAction({ slug, variant });
      if (res.ok) {
        setOverrideExists(false);
        setStatusMsg("Reverted to catalog default. Reloading…");
        // Hard reload so the editor re-fetches the catalog skeleton
        // — the autosave wouldn't pick it up automatically because
        // the in-memory doc still reflects the deleted override.
        router.refresh();
        // router.refresh() re-runs the server component but doesn't
        // remount the client doc. Force a full reload so the doc
        // resets visually too.
        setTimeout(() => window.location.reload(), 200);
      } else {
        setStatusMsg(`Reset failed: ${res.error}`);
      }
    });
  }, [overrideExists, conceptName, variantLabel, slug, variant, router]);

  const libraryHref = `/learn/library/plays/${slug}/${variantSlug}`;

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
                  router.push(`/learn/library/admin/plays/${slug}/${next}/edit`);
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
        <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
          Library admin · Override editor
        </p>
        <h1 className="mt-0.5 text-2xl font-extrabold tracking-tight">
          {conceptName}
          <span className="ml-2 text-lg font-semibold text-muted">
            · {variantLabel}
          </span>
        </h1>
        <p className="mt-1 text-xs text-muted">
          {overrideExists ? (
            <>
              Editing the saved override for this variant. Every change
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

      {/* Canonical play editor. `libraryMode={false}` so the admin
          sees the full editing chrome. `playId` uses a stable
          library-keyed synthetic — Cal's live-doc store ignores
          playIds it doesn't know, so this never pollutes Cal's view
          of real coach drafts. */}
      <PlayEditorClient
        playId={`library-override:${slug}:${variant}`}
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
