"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  acceptInviteAction,
  requestCoachAccessAction,
} from "@/app/actions/invites";
import {
  listUnclaimedRosterAction,
  setMyPositionsAction,
  submitRosterClaimAction,
  type UnclaimedRosterEntry,
} from "@/app/actions/playbook-roster";
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

/** Internal state machine for the accept flow.
 *  form    → initial: pick positions, accept
 *  claim   → player has accepted; list unclaimed roster entries to claim
 *  done    → terminal: show success (pending) or redirect (active) */
type Phase =
  | { kind: "form" }
  | {
      kind: "claim";
      playbookId: string;
      status: "active" | "pending";
      entries: UnclaimedRosterEntry[];
    }
  | { kind: "done"; mode: Mode; status: "active" | "pending" };

export function AcceptInviteButton({
  token,
  askPositions = false,
  isCoachInvite = false,
}: {
  token: string;
  askPositions?: boolean;
  /** When true, the link itself grants coach access — hide the
   *  "request coach upgrade" affordance, which only makes sense for
   *  player invites where someone wants to be promoted. */
  isCoachInvite?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, setPending] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: "form" });
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

    // Coach path never hits the claim step — coaches aren't on the roster.
    if (mode === "coach") {
      setPending(false);
      setPhase({ kind: "done", mode, status: res.status });
      return;
    }

    // Player path: check for unclaimed roster entries to offer as a claim
    // step. If the coach hasn't pre-added anyone, skip straight to done.
    const rosterRes = await listUnclaimedRosterAction(res.playbookId);
    const entries = rosterRes.ok ? rosterRes.entries : [];
    setPending(false);
    if (entries.length === 0) {
      if (res.status === "active") {
        router.push(`/playbooks/${res.playbookId}`);
        return;
      }
      setPhase({ kind: "done", mode, status: res.status });
      return;
    }
    setPhase({
      kind: "claim",
      playbookId: res.playbookId,
      status: res.status,
      entries,
    });
  }

  if (phase.kind === "claim") {
    return (
      <ClaimPlayerStep
        entries={phase.entries}
        onSubmit={async (memberId, asManager) => {
          const r = await submitRosterClaimAction({ memberId, asManager });
          if (!r.ok) {
            toast(`Couldn't submit claim: ${r.error}`, "error");
            return false;
          }
          setPhase({ kind: "done", mode: "player", status: phase.status });
          return true;
        }}
        onSkip={() => {
          if (phase.status === "active") {
            router.push(`/playbooks/${phase.playbookId}`);
            return;
          }
          setPhase({ kind: "done", mode: "player", status: phase.status });
        }}
      />
    );
  }

  if (phase.kind === "done") {
    if (phase.mode === "coach") {
      const playerLine =
        phase.status === "active"
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
    // Player finished the flow. If they submitted a claim, it's always
    // pending coach approval regardless of their access status.
    return (
      <div className="space-y-2">
        <p className="text-sm font-semibold text-foreground">
          {phase.status === "active"
            ? "You\u2019re in."
            : "Request sent."}
        </p>
        <p className="text-xs text-muted">
          {phase.status === "active"
            ? "You have access to the playbook. Any player claim you submitted is pending coach approval."
            : "The coach will review and approve your access. You\u2019ll see the playbook once they do."}
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
      {!isCoachInvite && (
        <button
          type="button"
          className="block w-full text-center text-xs text-muted underline-offset-2 hover:text-foreground hover:underline"
          onClick={() => setMode("coach")}
          disabled={pending}
        >
          Click here if you are a coach
        </button>
      )}
    </div>
  );
}

function ClaimPlayerStep({
  entries,
  onSubmit,
  onSkip,
}: {
  entries: UnclaimedRosterEntry[];
  onSubmit: (memberId: string, asManager: boolean) => Promise<boolean>;
  onSkip: () => void;
}) {
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [asManager, setAsManager] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (entries.length === 1 && !pickedId) setPickedId(entries[0]!.id);
  }, [entries, pickedId]);

  const picked = pickedId ? entries.find((e) => e.id === pickedId) ?? null : null;
  // Default the role toggle once a player is picked: minors default to
  // parent/guardian, adults default to "I am the player." Caller can flip.
  useEffect(() => {
    if (!picked) {
      setAsManager(null);
      return;
    }
    setAsManager((prev) => (prev === null ? picked.is_minor : prev));
  }, [picked]);

  async function claim() {
    if (!pickedId || asManager === null) return;
    setSubmitting(true);
    const ok = await onSubmit(pickedId, asManager);
    if (!ok) setSubmitting(false);
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">
          Claim your player
        </p>
        <p className="mt-0.5 text-xs text-muted">
          Your coach set up the roster already. Pick who you are so they can
          link your account — this needs coach approval.
        </p>
      </div>
      <ul className="max-h-64 space-y-1.5 overflow-y-auto">
        {entries.map((e) => {
          const on = pickedId === e.id;
          const positions =
            e.positions.length > 0 ? e.positions.join(", ") : e.position;
          const meta = [e.jersey_number ? `#${e.jersey_number}` : null, positions]
            .filter(Boolean)
            .join(" · ");
          return (
            <li key={e.id}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => setPickedId(e.id)}
                className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                  on
                    ? "border-primary bg-primary/10"
                    : "border-border bg-surface hover:bg-surface-inset"
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-foreground">
                    {e.label || "Unnamed player"}
                  </span>
                  {meta && <span className="block truncate text-xs text-muted">{meta}</span>}
                </span>
                {on && <span className="text-xs font-semibold text-primary">Selected</span>}
              </button>
            </li>
          );
        })}
      </ul>
      {picked && (
        <div className="space-y-1.5 rounded-lg border border-border bg-surface-inset p-3">
          <p className="text-xs font-semibold text-foreground">
            What&apos;s your relationship to {picked.label || "this player"}?
          </p>
          <div className="grid grid-cols-1 gap-1.5">
            <label className="flex cursor-pointer items-start gap-2 rounded border border-border bg-surface p-2 text-xs">
              <input
                type="radio"
                name="claim-role"
                className="mt-0.5"
                checked={asManager === false}
                onChange={() => setAsManager(false)}
              />
              <span>
                <span className="block font-semibold text-foreground">
                  I am {picked.label || "this player"}
                </span>
                <span className="block text-muted">
                  Link this slot to my account.
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2 rounded border border-border bg-surface p-2 text-xs">
              <input
                type="radio"
                name="claim-role"
                className="mt-0.5"
                checked={asManager === true}
                onChange={() => setAsManager(true)}
              />
              <span>
                <span className="block font-semibold text-foreground">
                  I&apos;m {picked.label || "this player"}&apos;s parent or guardian
                </span>
                <span className="block text-muted">
                  Manage this slot on their behalf — keeps your own account separate.
                </span>
              </span>
            </label>
          </div>
        </div>
      )}
      <Button
        variant="primary"
        disabled={!pickedId || asManager === null}
        loading={submitting}
        onClick={claim}
        className="w-full"
      >
        {asManager === false ? "Claim player" : "Claim as parent"}
      </Button>
      <button
        type="button"
        className="block w-full text-center text-xs text-muted underline-offset-2 hover:text-foreground hover:underline"
        onClick={onSkip}
        disabled={submitting}
      >
        Skip for now
      </button>
    </div>
  );
}
