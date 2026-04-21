"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { acceptInviteAction } from "@/app/actions/invites";
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
  const [accepted, setAccepted] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = (pos: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(pos)) next.delete(pos);
      else next.add(pos);
      return next;
    });
  };

  async function accept() {
    setPending(true);
    const res = await acceptInviteAction(token);
    if (!res.ok) {
      setPending(false);
      toast(`Could not accept invite: ${res.error}`, "error");
      return;
    }
    if (askPositions && selected.size > 0) {
      const r = await setMyPositionsAction(res.playbookId, Array.from(selected));
      if (!r.ok) {
        // Non-blocking — membership is created; positions can be edited later.
        toast(`Saved, but couldn't save positions: ${r.error}`, "error");
      }
    }
    setPending(false);
    setAccepted(true);
  }

  if (accepted) {
    return (
      <div className="space-y-2">
        <p className="text-sm font-semibold text-foreground">Request sent.</p>
        <p className="text-xs text-muted">
          The coach will review and approve your access. You&apos;ll see the playbook once they do.
        </p>
        <Button variant="secondary" onClick={() => router.push("/home")} className="w-full">
          Go to home
        </Button>
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
      <Button variant="primary" loading={pending} onClick={accept} className="w-full">
        Accept invite
      </Button>
    </div>
  );
}
