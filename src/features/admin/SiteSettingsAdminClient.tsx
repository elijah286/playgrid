"use client";

import { useState, useTransition } from "react";
import { useToast } from "@/components/ui";
import { setHideLobbyAnimationAction } from "@/app/actions/admin-lobby";
import {
  setExamplesUserIdAction,
  setExampleMakerModeAction,
} from "@/app/actions/admin-examples";

export function SiteSettingsAdminClient({
  initialHideLobbyAnimation,
  initialExamplesUserId,
  initialExampleMakerActive,
}: {
  initialHideLobbyAnimation: boolean;
  initialExamplesUserId: string | null;
  initialExampleMakerActive: boolean;
}) {
  const { toast } = useToast();

  const [hideLobbyAnimation, setHideLobbyAnimation] = useState(initialHideLobbyAnimation);
  const [lobbyPending, startLobbyTransition] = useTransition();

  const [examplesUserId, setExamplesUserIdState] = useState(
    initialExamplesUserId ?? "",
  );
  const [savedExamplesUserId, setSavedExamplesUserId] = useState(
    initialExamplesUserId ?? "",
  );
  const [examplesUserPending, startExamplesUserTransition] = useTransition();

  const [makerActive, setMakerActive] = useState(initialExampleMakerActive);
  const [makerPending, startMakerTransition] = useTransition();

  function toggleLobbyAnimation(next: boolean) {
    const prev = hideLobbyAnimation;
    setHideLobbyAnimation(next);
    startLobbyTransition(async () => {
      const res = await setHideLobbyAnimationAction(next);
      if (!res.ok) {
        setHideLobbyAnimation(prev);
        toast(res.error, "error");
        return;
      }
      toast(
        next ? "Lobby animation hidden." : "Lobby animation restored.",
        "success",
      );
    });
  }

  function saveExamplesUser() {
    const value = examplesUserId.trim();
    startExamplesUserTransition(async () => {
      const res = await setExamplesUserIdAction(value || null);
      if (!res.ok) {
        toast(res.error, "error");
        return;
      }
      setSavedExamplesUserId(res.examplesUserId ?? "");
      setMakerActive(false);
      toast(
        res.examplesUserId
          ? "Examples user saved."
          : "Examples user cleared.",
        "success",
      );
    });
  }

  function toggleMakerMode(next: boolean) {
    const prev = makerActive;
    setMakerActive(next);
    startMakerTransition(async () => {
      const res = await setExampleMakerModeAction(next);
      if (!res.ok) {
        setMakerActive(prev);
        toast(res.error, "error");
        return;
      }
      toast(
        next
          ? "You are now in example maker mode."
          : "Example maker mode off.",
        "success",
      );
    });
  }

  const examplesUserDirty = examplesUserId.trim() !== savedExamplesUserId;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface-raised p-4">
        <div>
          <p className="text-sm font-semibold text-foreground">
            Hide playbook animation on lobby
          </p>
          <p className="mt-0.5 text-xs text-muted">
            When on, the Preview/Simple toggle is hidden and the lobby
            always renders the simple card view.
          </p>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={hideLobbyAnimation}
            disabled={lobbyPending}
            onChange={(e) => toggleLobbyAnimation(e.target.checked)}
          />
          <span>{hideLobbyAnimation ? "On" : "Off"}</span>
        </label>
      </div>

      <div className="space-y-3 rounded-2xl border border-border bg-surface-raised p-4">
        <div>
          <p className="text-sm font-semibold text-foreground">
            Examples author
          </p>
          <p className="mt-0.5 text-xs text-muted">
            The user id whose playbooks appear on the public /examples page.
            Create a dedicated account, paste its profile id below, then
            enter example maker mode to edit its playbooks using the
            normal site.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            inputMode="text"
            autoComplete="off"
            spellCheck={false}
            placeholder="uuid of the examples user"
            value={examplesUserId}
            disabled={examplesUserPending}
            onChange={(e) => setExamplesUserIdState(e.target.value)}
            className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 font-mono text-xs text-foreground outline-none focus:ring-2 focus:ring-primary/40"
          />
          <button
            type="button"
            onClick={saveExamplesUser}
            disabled={examplesUserPending || !examplesUserDirty}
            className="inline-flex items-center justify-center rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {examplesUserPending ? "Saving…" : "Save"}
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3">
          <div>
            <p className="text-sm font-semibold text-foreground">
              Example maker mode
            </p>
            <p className="mt-0.5 text-xs text-muted">
              When on, your playbook list, new-playbook button, and editor
              act on behalf of the examples author.
            </p>
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={makerActive}
              disabled={makerPending || !savedExamplesUserId}
              onChange={(e) => toggleMakerMode(e.target.checked)}
            />
            <span>{makerActive ? "On" : "Off"}</span>
          </label>
        </div>
        {!savedExamplesUserId && (
          <p className="text-xs text-muted">
            Save an examples user id before turning this on.
          </p>
        )}
      </div>
    </div>
  );
}
