"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  acceptInviteAction,
  requestCoachAccessAction,
} from "@/app/actions/invites";
import { setMyPositionsAction } from "@/app/actions/playbook-roster";
import { Button, useToast } from "@/components/ui";

const POSITION_OPTIONS = [
  "QB",
  "RB",
  "WR",
  "TE",
  "OL",
  "DL",
  "LB",
  "DB",
  "K",
] as const;

type Mode = "player" | "coach";

export function AcceptInviteButton({
  token,
  askPositions = false,
}: {
  token: string;
  askPositions?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, setPending] = useState(false);
  const [accepted, setAccepted] = useState<null | {
    mode: Mode;
    status: "active" | "pending";
  }>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<Mode>("player");

  const toggle = (pos: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(pos)) next.delete(pos);
      else next.add(pos);
      return next;
    });
  };

  async function submit() {
    setPending(true);
    const res =
      mode === "coach"
        ? await requestCoachAccessAction(token)
        : await acceptInviteAction(token);
    if (!res.ok) {
      setPending(false);
      toast(
        mode === "coach"
          ? `Could not send coach request: ${res.error}`
          : `Could not accept invite: ${res.error}`,
        "error",
      );
      return;
    }
    if (mode === "player" && askPositions && selected.size > 0) {
      const r = await setMyPositionsAction(res.playbookId, Array.from(selected));
      if (!r.ok) {
        toast(`Saved, but couldn't save positions: ${r.error}`, "error");
      }
    }
    if (mode === "player" && res.status === "active") {
      router.push(`/playbooks/${res.playbookId}`);
      return;
    }
    setPending(false);
    setAccepted({ mode, status: res.status });
  }

  if (accepted) {
    if (accepted.mode === "coach") {
      const playerLine =
        accepted.status === "active"
          ? "You have player access to the playbook while you wait."
          : "The coach still needs to approve your player access too, so you won't see plays yet.";
      return (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-foreground">
            Coach request sent.
          </p>
          <p className="text-xs text-muted">
            The playbook owner will review your request for coach access.
            You&apos;ll get edit privileges once they approve.
          </p>
          <p className="text-xs text-muted">{playerLine}</p>
          <Button
            variant="secondary"
            onClick={() => router.push("/home")}
            className="w-full"
          >
            Go to home
          </Button>
        </div>
      );
    }
    return (
      <div className="space-y-2">
        <p className="text-sm font-semibold text-foreground">Request sent.</p>
        <p className="text-xs text-muted">
          The coach will review and approve your access. You&apos;ll see the
          playbook once they do.
        </p>
        <Button
          variant="secondary"
          onClick={() => router.push("/home")}
          className="w-full"
        >
          Go to home
        </Button>
      </div>
    );
  }

  if (mode === "coach") {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-border bg-surface-inset p-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">
            Requesting coach access
          </p>
          <p className="mt-1 text-xs text-foreground">
            This sends a request to the playbook owner to give you coach
            (edit) privileges. The owner has to approve it before you can
            edit plays.
          </p>
        </div>
        <Button
          variant="primary"
          loading={pending}
          onClick={submit}
          className="w-full"
        >
          Request coach access
        </Button>
        <button
          type="button"
          className="block w-full text-center text-xs text-muted underline-offset-2 hover:text-foreground hover:underline"
          onClick={() => setMode("player")}
          disabled={pending}
        >
          Never mind, I&apos;m a player
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {askPositions && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">
            Your positions
          </p>
          <p className="mt-0.5 text-xs text-muted">
            Pick any that apply. The coach will see these on the roster.
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {POSITION_OPTIONS.map((pos) => {
              const on = selected.has(pos);
              return (
                <button
                  key={pos}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(pos)}
                  className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${
                    on
                      ? "border-primary bg-primary text-white"
                      : "border-border bg-surface text-foreground hover:bg-surface-inset"
                  }`}
                >
                  {pos}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <Button variant="primary" loading={pending} onClick={submit} className="w-full">
        Accept invite
      </Button>
      <button
        type="button"
        className="block w-full text-center text-xs text-muted underline-offset-2 hover:text-foreground hover:underline"
        onClick={() => setMode("coach")}
        disabled={pending}
      >
        Click here if you are a coach
      </button>
    </div>
  );
}
