"use client";

import { useState, useTransition } from "react";
import { useToast } from "@/components/ui";
import { setHideLobbyAnimationAction } from "@/app/actions/admin-lobby";
import { setExamplesPageEnabledAction } from "@/app/actions/admin-examples";

export function SiteSettingsAdminClient({
  initialHideLobbyAnimation,
  initialExamplesPageEnabled,
}: {
  initialHideLobbyAnimation: boolean;
  initialExamplesPageEnabled: boolean;
}) {
  const { toast } = useToast();

  const [hideLobbyAnimation, setHideLobbyAnimation] = useState(initialHideLobbyAnimation);
  const [lobbyPending, startLobbyTransition] = useTransition();

  const [examplesEnabled, setExamplesEnabled] = useState(initialExamplesPageEnabled);
  const [examplesPending, startExamplesTransition] = useTransition();

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
