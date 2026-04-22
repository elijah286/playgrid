"use client";

import { useState, useTransition } from "react";
import { useToast } from "@/components/ui";
import { setHideLobbyAnimationAction } from "@/app/actions/admin-lobby";
import { setFreeMaxPlaysPerPlaybookAction } from "@/app/actions/admin-free-tier";

export function SiteSettingsAdminClient({
  initialHideLobbyAnimation,
  initialFreeMaxPlaysPerPlaybook,
}: {
  initialHideLobbyAnimation: boolean;
  initialFreeMaxPlaysPerPlaybook: number;
}) {
  const { toast } = useToast();
  const [hideLobbyAnimation, setHideLobbyAnimation] = useState(initialHideLobbyAnimation);
  const [lobbyPending, startLobbyTransition] = useTransition();

  const [freeMaxPlays, setFreeMaxPlays] = useState(initialFreeMaxPlaysPerPlaybook);
  const [freeMaxPlaysDraft, setFreeMaxPlaysDraft] = useState(
    String(initialFreeMaxPlaysPerPlaybook),
  );
  const [freeMaxPlaysPending, startFreeMaxPlaysTransition] = useTransition();

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

  function saveFreeMaxPlays() {
    const parsed = Number.parseInt(freeMaxPlaysDraft, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      toast("Enter a positive whole number.", "error");
      setFreeMaxPlaysDraft(String(freeMaxPlays));
      return;
    }
    if (parsed === freeMaxPlays) return;
    startFreeMaxPlaysTransition(async () => {
      const res = await setFreeMaxPlaysPerPlaybookAction(parsed);
      if (!res.ok) {
        toast(res.error, "error");
        setFreeMaxPlaysDraft(String(freeMaxPlays));
        return;
      }
      setFreeMaxPlays(res.limit);
      setFreeMaxPlaysDraft(String(res.limit));
      toast(`Free tier cap set to ${res.limit} plays per playbook.`, "success");
    });
  }

  const freeMaxPlaysDirty =
    freeMaxPlaysDraft.trim() !== String(freeMaxPlays) &&
    Number.parseInt(freeMaxPlaysDraft, 10) !== freeMaxPlays;

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
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">
            Free tier play cap
          </p>
          <p className="mt-0.5 text-xs text-muted">
            Max plays per playbook for owners on the Free plan. Applies to
            new play creation, duplicate, and the Pricing page copy.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            className="w-20 rounded-md bg-surface px-2 py-1 text-sm text-foreground ring-1 ring-border focus:outline-none focus:ring-2 focus:ring-primary"
            value={freeMaxPlaysDraft}
            disabled={freeMaxPlaysPending}
            onChange={(e) => setFreeMaxPlaysDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveFreeMaxPlays();
            }}
          />
          <button
            type="button"
            onClick={saveFreeMaxPlays}
            disabled={freeMaxPlaysPending || !freeMaxPlaysDirty}
            className="rounded-md bg-primary px-3 py-1 text-sm font-medium text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
