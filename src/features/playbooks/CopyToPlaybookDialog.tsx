"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { listCopyTargetPlaybooksAction, type PlaybookRow } from "@/app/actions/playbooks";
import { copyPlayAction, type CopyPlayFormationMode } from "@/app/actions/plays";
import {
  copyFormationAction,
  listFormationsForPlaybookAction,
  type SavedFormation,
} from "@/app/actions/formations";

export type CopyTarget =
  | {
      kind: "play";
      playId: string;
      playName: string;
      hasFormation: boolean;
      sourceFormationName: string | null;
    }
  | {
      kind: "plays";
      playIds: string[];
      anyHasFormation: boolean;
    }
  | {
      kind: "formation";
      formationId: string;
      formationName: string;
    };

/**
 * Shared "Copy to playbook" dialog for plays and formations. The current
 * playbook is always the top (pre-selected) option; destination playbooks
 * are listed below, filtered by "Only same game type" unless the coach
 * opts out. For plays crossing into a different playbook, the coach picks
 * how the formation travels (copy / unlink / pick).
 */
export function CopyToPlaybookDialog({
  open,
  onClose,
  currentPlaybookId,
  currentPlaybookName,
  currentSportVariant,
  target,
  onCopied,
  toast,
  onPlayCapHit,
}: {
  open: boolean;
  onClose: () => void;
  currentPlaybookId: string;
  /** Optional — falls back to the fetched list if omitted. */
  currentPlaybookName?: string;
  /** Optional — falls back to the fetched list if omitted. */
  currentSportVariant?: string;
  target: CopyTarget;
  /** Called with the destination playbook id + new item id after a successful copy. */
  onCopied: (result: {
    playbookId: string;
    playId?: string;
    formationId?: string;
    droppedRouteCount?: number;
    formationRenamed?: boolean;
  }) => void;
  toast?: (msg: string, kind?: "success" | "error") => void;
  /** Routed when the copy fails because the destination playbook is at the
   *  free-tier play cap. Lets the parent surface the same in-page upgrade
   *  modal it uses for create-play, instead of a dead-end toast. The raw
   *  server error is passed through so the parent can echo the configured
   *  cap number (admin-tunable) without re-fetching it. If omitted, the
   *  error falls back to a toast. */
  onPlayCapHit?: (serverError: string) => void;
}) {
  // Initial state seeded from props — the parent conditionally mounts this
  // dialog, so each open is a fresh instance (no effect-based reset needed).
  const [playbooks, setPlaybooks] = useState<PlaybookRow[]>([]);
  const [loadingPlaybooks, setLoadingPlaybooks] = useState(true);
  const [destinationId, setDestinationId] = useState<string>(currentPlaybookId);
  const [sameVariantOnly, setSameVariantOnly] = useState(true);
  const [formationMode, setFormationMode] = useState<CopyPlayFormationMode>("copy");
  const [destFormations, setDestFormations] = useState<SavedFormation[]>([]);
  // The playbook id whose formations are currently loaded into `destFormations`.
  // Lets us compute "is this fetch stale?" without setting loading state
  // synchronously in an effect body.
  const [destFormationsFor, setDestFormationsFor] = useState<string | null>(null);
  const [destFormationId, setDestFormationId] = useState<string>("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    listCopyTargetPlaybooksAction().then((res) => {
      if (cancelled) return;
      setLoadingPlaybooks(false);
      if (res.ok) setPlaybooks(res.playbooks);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const currentFromList = useMemo(
    () => playbooks.find((p) => p.id === currentPlaybookId),
    [playbooks, currentPlaybookId],
  );
  const effectiveCurrentName = currentPlaybookName ?? currentFromList?.name ?? "This playbook";
  const effectiveCurrentVariant =
    currentSportVariant ?? currentFromList?.sport_variant ?? "";

  const otherPlaybooks = useMemo(
    () => playbooks.filter((p) => p.id !== currentPlaybookId),
    [playbooks, currentPlaybookId],
  );
  const filteredOthers = useMemo(
    () =>
      sameVariantOnly && effectiveCurrentVariant
        ? otherPlaybooks.filter((p) => p.sport_variant === effectiveCurrentVariant)
        : otherPlaybooks,
    [otherPlaybooks, sameVariantOnly, effectiveCurrentVariant],
  );

  const destinationIsCurrent = destinationId === currentPlaybookId;
  const destinationPlaybook = useMemo(
    () => playbooks.find((p) => p.id === destinationId),
    [playbooks, destinationId],
  );
  const variantMismatch =
    !!destinationPlaybook &&
    !!effectiveCurrentVariant &&
    destinationPlaybook.sport_variant !== effectiveCurrentVariant;

  // Load destination formations when "pick" is chosen (or destination changes
  // while in "pick" mode). `loadingDestFormations` is derived — true whenever
  // we need a fetch but `destFormationsFor` hasn't caught up yet.
  const needsDestFormationFetch =
    (target.kind === "play" || target.kind === "plays") &&
    !destinationIsCurrent &&
    formationMode === "pick" &&
    destFormationsFor !== destinationId;
  const loadingDestFormations = needsDestFormationFetch;

  useEffect(() => {
    if (!needsDestFormationFetch) return;
    let cancelled = false;
    listFormationsForPlaybookAction(destinationId).then((res) => {
      if (cancelled) return;
      if (res.ok) {
        setDestFormations(res.formations);
        setDestFormationId(res.formations[0]?.id || "");
      } else {
        setDestFormations([]);
        setDestFormationId("");
      }
      setDestFormationsFor(destinationId);
    });
    return () => {
      cancelled = true;
    };
  }, [needsDestFormationFetch, destinationId]);

  function handleCopy() {
    startTransition(async () => {
      if (target.kind === "formation") {
        if (destinationIsCurrent) {
          // Duplicate within current playbook — reuse copyFormationAction.
          const res = await copyFormationAction({
            formationId: target.formationId,
            destinationPlaybookId: currentPlaybookId,
          });
          if (!res.ok) {
            toast?.(res.error, "error");
            return;
          }
          toast?.(
            res.renamed
              ? `Copied as "${res.newName}".`
              : `Formation duplicated.`,
            "success",
          );
          onCopied({ playbookId: currentPlaybookId, formationId: res.formationId });
          onClose();
          return;
        }
        const res = await copyFormationAction({
          formationId: target.formationId,
          destinationPlaybookId: destinationId,
        });
        if (!res.ok) {
          toast?.(res.error, "error");
          return;
        }
        toast?.(
          res.renamed
            ? `Copied to "${destinationPlaybook?.name}" as "${res.newName}".`
            : `Copied to "${destinationPlaybook?.name}".`,
          "success",
        );
        onCopied({
          playbookId: destinationId,
          formationId: res.formationId,
          formationRenamed: res.renamed,
        });
        onClose();
        return;
      }

      // Play(s)
      // Same playbook: link to the existing formation (no deep-clone).
      // Cross-playbook: user picks copy/unlink/pick in the dialog. Bulk
      // applies the same formation mode to every selected play and loops
      // — failures abort early so a play-cap miss doesn't half-finish.
      const mode: CopyPlayFormationMode = destinationIsCurrent ? "link" : formationMode;
      const playIds = target.kind === "plays" ? target.playIds : [target.playId];
      let copiedCount = 0;
      let totalDropped = 0;
      let anyFormationRenamed = false;
      let lastFormationNewName: string | null = null;
      let lastNewPlayId: string | undefined;
      let failError: string | null = null;
      for (const pid of playIds) {
        const res = await copyPlayAction({
          playId: pid,
          destinationPlaybookId: destinationId,
          formationMode: mode,
          destinationFormationId: mode === "pick" ? destFormationId : undefined,
        });
        if (!res.ok) {
          failError = res.error;
          break;
        }
        copiedCount++;
        totalDropped += res.droppedRouteCount;
        if (res.formationRenamed) {
          anyFormationRenamed = true;
          if (res.formationNewName) lastFormationNewName = res.formationNewName;
        }
        lastNewPlayId = res.playId;
      }
      if (failError) {
        if (onPlayCapHit && /Free tier|capped at/i.test(failError)) {
          onClose();
          onPlayCapHit(failError);
        } else {
          toast?.(
            copiedCount > 0
              ? `Copied ${copiedCount} of ${playIds.length}, then stopped: ${failError}`
              : failError,
            "error",
          );
        }
        return;
      }
      const isBulk = target.kind === "plays";
      const parts: string[] = [];
      if (destinationIsCurrent) {
        parts.push(
          isBulk
            ? `${copiedCount} ${copiedCount === 1 ? "play" : "plays"} duplicated.`
            : "Play duplicated.",
        );
      } else {
        parts.push(
          isBulk
            ? `Copied ${copiedCount} ${copiedCount === 1 ? "play" : "plays"} to "${destinationPlaybook?.name}".`
            : `Copied to "${destinationPlaybook?.name}".`,
        );
      }
      if (totalDropped > 0) {
        parts.push(`${totalDropped} route${totalDropped === 1 ? "" : "s"} dropped (no matching label in destination formation).`);
      }
      if (anyFormationRenamed && lastFormationNewName) {
        parts.push(
          isBulk
            ? `Some formations were saved with a numeric suffix (names already existed).`
            : `Formation saved as "${lastFormationNewName}" (name already existed).`,
        );
      }
      toast?.(parts.join(" "), "success");
      onCopied({
        playbookId: destinationId,
        // Single-play: hand back the new id so the parent can jump to /edit.
        // Bulk: omit so the parent refreshes the list instead.
        playId: isBulk ? undefined : lastNewPlayId,
        droppedRouteCount: totalDropped,
        formationRenamed: anyFormationRenamed,
      });
      onClose();
    });
  }

  const showFormationMode =
    !destinationIsCurrent &&
    ((target.kind === "play" && target.hasFormation) ||
      (target.kind === "plays" && target.anyHasFormation));

  const pickDisabledReason =
    (target.kind === "play" || target.kind === "plays") &&
    formationMode === "pick" &&
    !destFormationId
      ? "Pick a destination formation."
      : null;

  const title =
    target.kind === "formation"
      ? "Copy formation"
      : target.kind === "plays"
        ? `Copy ${target.playIds.length} ${target.playIds.length === 1 ? "play" : "plays"}`
        : "Copy play";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleCopy}
            disabled={pending || !!pickDisabledReason || !destinationId}
          >
            {pending ? "Copying…" : "Copy"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-sm">
        <div className="text-muted">
          {target.kind === "plays" ? (
            <>
              Copying{" "}
              <span className="font-medium text-foreground">
                {target.playIds.length} {target.playIds.length === 1 ? "play" : "plays"}
              </span>
              .
            </>
          ) : (
            <>
              Copying{" "}
              <span className="font-medium text-foreground">
                {target.kind === "play" ? target.playName : target.formationName}
              </span>
              .
            </>
          )}
        </div>

        <fieldset className="flex flex-col gap-1.5">
          <legend className="sr-only">Destination playbook</legend>
          <label className="flex items-start gap-2 rounded-md border border-border bg-surface-inset/50 px-3 py-2 hover:bg-surface-inset">
            <input
              type="radio"
              name="copy-dest"
              className="mt-0.5"
              checked={destinationId === currentPlaybookId}
              onChange={() => setDestinationId(currentPlaybookId)}
            />
            <span className="flex flex-col">
              <span className="font-medium text-foreground">{effectiveCurrentName}</span>
              <span className="text-xs text-muted">This playbook</span>
            </span>
          </label>

          <div className="mt-1 flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-muted">
              Or copy to another playbook
            </span>
            <label className="flex items-center gap-1.5 text-xs text-muted">
              <input
                type="checkbox"
                checked={sameVariantOnly}
                onChange={(e) => setSameVariantOnly(e.target.checked)}
              />
              Only same game type
            </label>
          </div>

          <div className="max-h-56 overflow-y-auto rounded-md border border-border">
            {loadingPlaybooks ? (
              <div className="px-3 py-2 text-xs text-muted">Loading…</div>
            ) : filteredOthers.length === 0 ? (
              <div className="px-3 py-2 text-xs text-muted">
                {otherPlaybooks.length === 0
                  ? "No other playbooks to copy to."
                  : "No matching playbooks. Uncheck the filter to see all."}
              </div>
            ) : (
              filteredOthers.map((pb) => (
                <label
                  key={pb.id}
                  className="flex items-start gap-2 border-b border-border px-3 py-2 last:border-b-0 hover:bg-surface-inset"
                >
                  <input
                    type="radio"
                    name="copy-dest"
                    className="mt-0.5"
                    checked={destinationId === pb.id}
                    onChange={() => setDestinationId(pb.id)}
                  />
                  <span className="flex flex-col">
                    <span className="font-medium text-foreground">{pb.name}</span>
                    <span className="text-xs text-muted">{labelForVariant(pb.sport_variant)}</span>
                  </span>
                </label>
              ))
            )}
          </div>
        </fieldset>

        {showFormationMode && (
          <fieldset className="mt-2 flex flex-col gap-2 rounded-md border border-border bg-surface-inset/50 p-3">
            <legend className="px-1 text-xs font-medium uppercase tracking-wide text-muted">
              Formation
            </legend>

            {variantMismatch && (
              <div className="rounded bg-amber-500/10 px-2 py-1.5 text-xs text-amber-700 dark:text-amber-400">
                Destination is a different game type — copying the formation
                as-is may produce unexpected results. Consider picking a
                destination formation instead.
              </div>
            )}

            <label className="flex items-start gap-2">
              <input
                type="radio"
                name="copy-formation-mode"
                className="mt-0.5"
                checked={formationMode === "copy"}
                onChange={() => setFormationMode("copy")}
              />
              <span className="flex flex-col">
                <span className="text-sm text-foreground">Copy formation</span>
                <span className="text-xs text-muted">
                  {target.kind === "plays" ? (
                    <>
                      Deep-clones each play&rsquo;s source formation into the
                      destination. Duplicates are saved with a numeric suffix.
                    </>
                  ) : (
                    <>
                      Deep-clones{" "}
                      <span className="font-medium text-foreground">
                        {target.kind === "play"
                          ? target.sourceFormationName ?? "the formation"
                          : ""}
                      </span>{" "}
                      into the destination. If a formation with that name
                      already exists, the copy is saved with a numeric suffix.
                    </>
                  )}
                </span>
              </span>
            </label>

            <label className="flex items-start gap-2">
              <input
                type="radio"
                name="copy-formation-mode"
                className="mt-0.5"
                checked={formationMode === "unlink"}
                onChange={() => setFormationMode("unlink")}
              />
              <span className="flex flex-col">
                <span className="text-sm text-foreground">No formation</span>
                <span className="text-xs text-muted">
                  Keep the players and routes as-is, but don&apos;t link the
                  copy to any formation.
                </span>
              </span>
            </label>

            <label className="flex items-start gap-2">
              <input
                type="radio"
                name="copy-formation-mode"
                className="mt-0.5"
                checked={formationMode === "pick"}
                onChange={() => setFormationMode("pick")}
              />
              <span className="flex flex-col flex-1">
                <span className="text-sm text-foreground">Use formation from destination</span>
                <span className="text-xs text-muted">
                  Players are replaced with the destination formation&apos;s
                  players. Routes are remapped to players with matching labels;
                  routes whose label has no match in the destination are
                  dropped.
                </span>
                {formationMode === "pick" && (
                  <div className="mt-1.5">
                    {loadingDestFormations ? (
                      <span className="text-xs text-muted">Loading formations…</span>
                    ) : destFormations.length === 0 ? (
                      <span className="text-xs text-amber-600 dark:text-amber-400">
                        Destination has no formations.
                      </span>
                    ) : (
                      <select
                        className="w-full rounded border border-border bg-surface px-2 py-1 text-sm"
                        value={destFormationId}
                        onChange={(e) => setDestFormationId(e.target.value)}
                      >
                        <option value="">Pick a formation…</option>
                        {destFormations.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.displayName}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
              </span>
            </label>
          </fieldset>
        )}
      </div>
    </Modal>
  );
}

function labelForVariant(v: string): string {
  switch (v) {
    case "flag_7v7":
      return "7v7 flag";
    case "flag_5v5":
      return "5v5 flag";
    case "11_man":
      return "11-man";
    case "8_man":
      return "8-man";
    case "9_man":
      return "9-man";
    case "other":
      return "Other";
    default:
      return v;
  }
}
