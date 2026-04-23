"use client";

import { useState, useTransition } from "react";
import { Button, useToast } from "@/components/ui";
import { setHideLobbyAnimationAction } from "@/app/actions/admin-lobby";
import { setExamplesPageEnabledAction } from "@/app/actions/admin-examples";
import { setFreeMaxPlaysPerPlaybookAction } from "@/app/actions/admin-free-plays";

export function SiteSettingsAdminClient({
  initialHideLobbyAnimation,
  initialExamplesPageEnabled,
  initialFreeMaxPlays,
}: {
  initialHideLobbyAnimation: boolean;
  initialExamplesPageEnabled: boolean;
  initialFreeMaxPlays: number;
}) {
  const { toast } = useToast();

  const [hideLobbyAnimation, setHideLobbyAnimation] = useState(initialHideLobbyAnimation);
  const [lobbyPending, startLobbyTransition] = useTransition();

  const [examplesEnabled, setExamplesEnabled] = useState(initialExamplesPageEnabled);
  const [examplesPending, startExamplesTransition] = useTransition();

  const [savedFreeMaxPlays, setSavedFreeMaxPlays] = useState(initialFreeMaxPlays);
  const [freeMaxPlaysInput, setFreeMaxPlaysInput] = useState(String(initialFreeMaxPlays));
  const [freeMaxPlaysPending, startFreeMaxPlaysTransition] = useTransition();

  function saveFreeMaxPlays() {
    const next = Number(freeMaxPlaysInput);
    if (!Number.isFinite(next) || next < 1 || next > 1000) {
      toast("Enter a number between 1 and 1000.", "error");
      setFreeMaxPlaysInput(String(savedFreeMaxPlays));
      return;
    }
    const rounded = Math.floor(next);
    if (rounded === savedFreeMaxPlays) return;
    startFreeMaxPlaysTransition(async () => {
      const res = await setFreeMaxPlaysPerPlaybookAction(rounded);
      if (!res.ok) {
        toast(res.error, "error");
        setFreeMaxPlaysInput(String(savedFreeMaxPlays));
        return;
      }
      setSavedFreeMaxPlays(res.value);
      setFreeMaxPlaysInput(String(res.value));
      toast(`Free-tier play cap set to ${res.value}.`, "success");
    });
  }

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

  function toggleExamplesEnabled(next: boolean) {
    const prev = examplesEnabled;
    setExamplesEnabled(next);
    startExamplesTransition(async () => {
      const res = await setExamplesPageEnabledAction(next);
      if (!res.ok) {
        setExamplesEnabled(prev);
        toast(res.error, "error");
        return;
      }
      toast(
        next ? "Examples page is live." : "Examples page is off.",
        "success",
      );
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface-raised p-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">
            Free-tier plays per playbook
          </p>
          <p className="mt-0.5 text-xs text-muted">
            The max number of plays a free account can create in a single
            playbook. Drives enforcement, the playbook upgrade notice, the
            pricing table, and the FAQ copy. Default is 16.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            max={1000}
            step={1}
            className="w-20 rounded-md bg-surface px-3 py-1.5 text-sm ring-1 ring-border"
            value={freeMaxPlaysInput}
            disabled={freeMaxPlaysPending}
            onChange={(e) => setFreeMaxPlaysInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveFreeMaxPlays();
            }}
          />
          <Button
            variant="secondary"
            size="sm"
            loading={freeMaxPlaysPending}
            disabled={
              freeMaxPlaysPending ||
              freeMaxPlaysInput.trim() === "" ||
              Number(freeMaxPlaysInput) === savedFreeMaxPlays
            }
            onClick={saveFreeMaxPlays}
          >
            Save
          </Button>
        </div>
      </div>

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

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface-raised p-4">
        <div>
          <p className="text-sm font-semibold text-foreground">
            Public examples page
          </p>
          <p className="mt-0.5 text-xs text-muted">
            When on, any playbook you&apos;ve marked as an example and
            published appears at <code className="font-mono">/examples</code>
            . Marking and publishing happen from each playbook&apos;s
            action menu.
          </p>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={examplesEnabled}
            disabled={examplesPending}
            onChange={(e) => toggleExamplesEnabled(e.target.checked)}
          />
          <span>{examplesEnabled ? "Live" : "Off"}</span>
        </label>
      </div>
    </div>
  );
}
