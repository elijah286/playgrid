"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button, Modal, useToast } from "@/components/ui";
import { UpgradeModal } from "@/components/billing/UpgradeModal";
import { useOfflineGate } from "@/components/offline/OfflineGate";
import { createPlayAction } from "@/app/actions/plays";
import { listFormationsAction, type SavedFormation } from "@/app/actions/formations";
import {
  defaultDefendersForVariant,
  defaultPlayersForVariant,
  defenseTemplatesForVariant,
  specialTeamsTemplates,
  sportProfileForVariant,
} from "@/domain/play/factory";
import type { Player, SpecialTeamsUnit, SportVariant } from "@/domain/play/types";
import { openCoachCal } from "@/features/coach-ai/openCoachCal";
import {
  CreatePlaySheet,
  type CreatePlayLevel,
  type DrawPlayType,
} from "./CreatePlaySheet";

export type UseCreatePlayConfig = {
  playbookId: string;
  variant: SportVariant;
  /** Offense player count for this playbook (variant default when absent). */
  playbookPlayerCount?: number;
  /** Read-only viewer — the create control diverts to a hint instead. */
  isViewer: boolean;
  /** Example-preview visitor — creates go to the scratch editor, not the DB. */
  isPreview: boolean;
  blockIfPreview: (msg: string) => void;
  /** Show the "Generate with Coach Cal" card (coachAiAvailable || promo). */
  showCoachCal: boolean;
  /** Free-tier per-playbook play cap, for the cap-upgrade modal copy. */
  freeMaxPlays: number;
  /** Show the "Import from a photo" method card. True only where the
   *  photo_play_import beta is available (admin-only today). */
  photoImportAvailable?: boolean;
  /** Optional resolver for a nicer sequential name on template plays
   *  (e.g. "Cover 2 3"). Falls back to the template name when absent. */
  resolvePlayName?: (base: string) => string;
};

type CreateOpts = {
  playType?: DrawPlayType;
  specialTeamsUnit?: SpecialTeamsUnit | null;
  initialPlayers?: Player[];
  formationName?: string;
  playName?: string;
};

/**
 * The single choke point for creating a play. Every "New play" entry point
 * calls `openCreatePlay()` and renders `sheet`. The hook owns:
 *   - viewer → hint, preview → scratch, offline → fail-loud diverts,
 *   - the Level-1/Level-2 sheet state,
 *   - the actual create call + navigation,
 *   - cap / downgrade-lock modals (with native-safe copy).
 *
 * This mirrors the legacy `openFormationPicker` role, but self-contained so
 * it works identically from the playbook grid and from inside the editor.
 */
export function useCreatePlay(config: UseCreatePlayConfig): {
  /** Open the create surface. Pass `{ startAtDraw: true }` to skip the
   *  method chooser and land directly on the draw step (e.g. the first-play
   *  hero, whose own buttons already imply the method). */
  openCreatePlay: (opts?: { startAtDraw?: boolean }) => void;
  sheet: ReactNode;
} {
  const {
    playbookId,
    variant,
    playbookPlayerCount,
    isViewer,
    isPreview,
    blockIfPreview,
    showCoachCal,
    freeMaxPlays,
    resolvePlayName,
    photoImportAvailable = false,
  } = config;

  const router = useRouter();
  const { toast } = useToast();
  const { isGated: offlineGated } = useOfflineGate();

  const [open, setOpen] = useState(false);
  const [level, setLevel] = useState<CreatePlayLevel>("method");
  const [playType, setPlayType] = useState<DrawPlayType>("offense");
  const [creating, setCreating] = useState(false);
  const [formations, setFormations] = useState<SavedFormation[]>([]);
  const [loadingFormations, setLoadingFormations] = useState(false);

  const [showViewerHint, setShowViewerHint] = useState(false);
  const [capOpen, setCapOpen] = useState(false);
  const [lockOpen, setLockOpen] = useState(false);

  const profile = useMemo(() => sportProfileForVariant(variant), [variant]);
  const expectedOffenseCount = playbookPlayerCount ?? profile.offensePlayerCount;
  const defaultOffensePlayers = useMemo(
    () => defaultPlayersForVariant(variant, playbookPlayerCount),
    [variant, playbookPlayerCount],
  );
  const defaultDefenders = useMemo(
    () => defaultDefendersForVariant(variant, playbookPlayerCount),
    [variant, playbookPlayerCount],
  );
  const defenseTemplates = useMemo(
    () => defenseTemplatesForVariant(variant),
    [variant],
  );
  const stTemplates = useMemo(
    () => (variant === "tackle_11" ? specialTeamsTemplates() : []),
    [variant],
  );

  const close = useCallback(() => {
    if (creating) return;
    setOpen(false);
  }, [creating]);

  const loadFormations = useCallback(() => {
    setLoadingFormations(true);
    listFormationsAction()
      .then((res) => {
        if (res.ok) setFormations(res.formations);
      })
      .finally(() => setLoadingFormations(false));
  }, []);

  const openCreatePlay = useCallback(
    (opts?: { startAtDraw?: boolean }) => {
      // Viewer / archived → hint, never open the sheet (mirrors the legacy
      // openFormationPicker divert).
      if (isViewer) {
        setShowViewerHint(true);
        return;
      }
      // Offline → fail loud. Creating a play needs a live server; never drop
      // the coach into a surface that silently can't persist.
      if (offlineGated) {
        toast(
          "New plays aren't available offline. Reconnect to create one.",
          "error",
        );
        return;
      }
      setLevel(opts?.startAtDraw ? "draw" : "method");
      setPlayType("offense");
      setOpen(true);
      // Warm the saved-formations list in the background so the "Your
      // formations" grid is ready by the time the coach reaches Level 2.
      loadFormations();
    },
    [isViewer, offlineGated, toast, loadFormations],
  );

  const handleError = useCallback(
    (res: { error: string; code?: string }) => {
      const code = res.code;
      if (code === "CAP_EXCEEDED" || /Free tier|capped at/i.test(res.error)) {
        setCapOpen(true);
      } else if (code === "DOWNGRADE_LOCKED") {
        setLockOpen(true);
      } else {
        // GAME_MODE_LOCKED (native-safe copy) + generic errors → toast.
        toast(res.error, "error");
      }
    },
    [toast],
  );

  // Core create path. Faithful port of the playbook page's
  // createWithFormation, including the preview divert.
  const createWithFormation = useCallback(
    async (formation?: SavedFormation, opts?: CreateOpts) => {
      if (isPreview) {
        setOpen(false);
        const isOffenseFromFormation =
          (opts?.playType ?? "offense") === "offense" && !opts?.initialPlayers;
        if (isOffenseFromFormation) {
          const q = new URLSearchParams({ playbookId });
          if (formation?.id) q.set("formationId", formation.id);
          router.push(`/plays/new-preview?${q.toString()}`);
        } else {
          blockIfPreview(
            "This flow isn't available in demo mode. Start your own playbook to unlock every template.",
          );
        }
        return;
      }
      setCreating(true);
      const playTypeToUse = opts?.playType ?? "offense";
      const initialPlayers =
        opts?.initialPlayers ?? formation?.players ?? defaultOffensePlayers;
      // Await the (now-batched, fast) create before navigating — the safe
      // path. Optimistic pre-navigation is deliberately NOT used: a rejected
      // create (cap / lock / game) must surface here, never inside a phantom
      // editor whose autosave writes to a row that was never inserted.
      const res = await createPlayAction(playbookId, {
        initialPlayers,
        formationId: formation?.id ?? null,
        formationName: opts?.formationName ?? formation?.displayName ?? "",
        variant,
        playerCount: playbookPlayerCount,
        playType: playTypeToUse,
        specialTeamsUnit: opts?.specialTeamsUnit ?? null,
        playName: opts?.playName,
      });
      if (res.ok) {
        router.push(`/plays/${res.playId}/edit`);
      } else {
        setCreating(false);
        setOpen(false);
        handleError(res);
      }
    },
    [
      isPreview,
      playbookId,
      router,
      blockIfPreview,
      defaultOffensePlayers,
      variant,
      playbookPlayerCount,
      handleError,
    ],
  );

  const createNewFormation = useCallback(async () => {
    if (isPreview) {
      setOpen(false);
      const q = new URLSearchParams({
        preview: "1",
        variant,
        returnToPlaybook: playbookId,
      });
      router.push(`/formations/new?${q.toString()}`);
      return;
    }
    setCreating(true);
    const res = await createPlayAction(playbookId, {
      initialPlayers: defaultOffensePlayers,
      variant,
      playerCount: playbookPlayerCount,
    });
    if (res.ok) {
      router.push(`/formations/new?variant=${variant}&returnToPlay=${res.playId}`);
    } else {
      setCreating(false);
      setOpen(false);
      handleError(res);
    }
  }, [
    isPreview,
    playbookId,
    router,
    variant,
    playbookPlayerCount,
    defaultOffensePlayers,
    handleError,
  ]);

  const onPickBlank = useCallback(() => {
    if (playType === "defense") {
      void createWithFormation(undefined, {
        playType: "defense",
        initialPlayers: defaultDefenders,
      });
    } else {
      void createWithFormation();
    }
  }, [playType, createWithFormation, defaultDefenders]);

  const onImportPhoto = useCallback(() => {
    setOpen(false);
    router.push(`/playbooks/${playbookId}/import-photo`);
  }, [router, playbookId]);

  const sheet = (
    <>
      <CreatePlaySheet
        open={open}
        onClose={close}
        level={level}
        onChooseDraw={() => setLevel("draw")}
        onBack={() => setLevel("method")}
        showCoachCal={showCoachCal}
        onGenerateWithCal={() => {
          setOpen(false);
          openCoachCal("playbook_generate_play");
        }}
        showPhotoImport={photoImportAvailable}
        onImportPhoto={onImportPhoto}
        variant={variant}
        playType={playType}
        onChangePlayType={setPlayType}
        expectedOffenseCount={expectedOffenseCount}
        defenseCount={profile.defensePlayerCount}
        defaultOffensePlayers={defaultOffensePlayers}
        defaultDefenders={defaultDefenders}
        formations={formations}
        loadingFormations={loadingFormations}
        defenseTemplates={defenseTemplates}
        stTemplates={stTemplates}
        creating={creating}
        onPickBlank={onPickBlank}
        onPickFormation={(f) =>
          void createWithFormation(f, { playType })
        }
        onPickDefenseTemplate={(t) =>
          void createWithFormation(undefined, {
            playType: "defense",
            initialPlayers: t.players,
            formationName: t.displayName,
            playName: resolvePlayName?.(t.displayName),
          })
        }
        onPickSTTemplate={(t) =>
          void createWithFormation(undefined, {
            playType: "special_teams",
            specialTeamsUnit: t.unit,
            initialPlayers: t.players,
            formationName: t.displayName,
            playName: resolvePlayName?.(t.displayName),
          })
        }
        onCreateNewFormation={() => void createNewFormation()}
      />

      {/* Cap-exceeded upgrade prompt (native-safe: price copy is web-only). */}
      <UpgradeModal
        open={capOpen}
        onClose={() => setCapOpen(false)}
        title={`Free tier is capped at ${freeMaxPlays} plays per playbook`}
        message={
          <>
            <span data-web-only>
              Upgrade to Team Coach ($9/mo or $99/yr) for unlimited plays per
              playbook.
            </span>
            <span data-native-only>
              Unlimited plays per playbook aren&rsquo;t included in your current
              plan.
            </span>
          </>
        }
      />

      {/* Downgrade-locked playbook (native-safe: no price/steer copy on native). */}
      <UpgradeModal
        open={lockOpen}
        onClose={() => setLockOpen(false)}
        title="This playbook is locked"
        message={
          <>
            <span data-web-only>
              This playbook is read-only because your plan was downgraded.
              Upgrade to Team Coach to unlock it.
            </span>
            <span data-native-only>
              This playbook is read-only on your current plan.
            </span>
          </>
        }
      />

      {/* Viewer (read-only) hint. */}
      <Modal
        open={showViewerHint}
        onClose={() => setShowViewerHint(false)}
        title="Only coaches can add plays"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setShowViewerHint(false)}
            >
              Close
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setShowViewerHint(false);
                router.push("/home");
              }}
            >
              Create your own playbook
            </Button>
          </>
        }
      >
        <p className="text-sm text-foreground">
          You have view-only access to this playbook. To add plays, ask the
          coach to grant you edit access, or create your own playbook.
        </p>
      </Modal>
    </>
  );

  return { openCreatePlay, sheet };
}
