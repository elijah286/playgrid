"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import {
  approveCoachUpgradeAction,
  approveMemberAction,
  approveRosterClaimAction,
  denyCoachUpgradeAction,
  denyMemberAction,
  rejectRosterClaimAction,
} from "@/app/actions/playbook-roster";

type Act = () => Promise<{ ok: true } | { ok: false; error: string }>;
export type ApprovalPair = { approve: Act; deny: Act; okMsg: string };

/**
 * Resolve the approve/deny action pair for an alert kind, or null if the kind
 * isn't inline-actionable (or is missing the id it needs). Every action is a
 * reused production server action — no new writes.
 */
export function approvalFor(
  kind: string,
  playbookId: string,
  userId: string | null,
  claimId: string | null,
): ApprovalPair | null {
  switch (kind) {
    case "membership":
      return userId
        ? {
            approve: () => approveMemberAction(playbookId, userId),
            deny: () => denyMemberAction(playbookId, userId),
            okMsg: "Approved.",
          }
        : null;
    case "coach_upgrade":
      return userId
        ? {
            approve: () => approveCoachUpgradeAction(playbookId, userId),
            deny: () => denyCoachUpgradeAction(playbookId, userId),
            okMsg: "Coach access granted.",
          }
        : null;
    case "roster_claim":
      return claimId
        ? {
            approve: () => approveRosterClaimAction(playbookId, claimId),
            deny: () => rejectRosterClaimAction(playbookId, claimId),
            okMsg: "Claim approved.",
          }
        : null;
    default:
      return null;
  }
}

/** Approve / Deny buttons for an actionable alert, shared by Alerts + Home. */
export function ApprovalControls({ pair }: { pair: ApprovalPair }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  async function go(fn: Act, okMsg?: string) {
    setBusy(true);
    try {
      const res = await fn();
      if (!res.ok) {
        toast(res.error, "error");
        return;
      }
      if (okMsg) toast(okMsg, "success");
      router.refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Something went wrong.", "error");
    } finally {
      setBusy(false);
    }
  }

  if (busy) {
    return <Loader2 className="size-4 shrink-0 animate-spin text-muted" aria-hidden />;
  }
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      <button
        type="button"
        onClick={() => go(pair.deny)}
        className="inline-flex min-h-[36px] items-center rounded-lg border border-border bg-surface-raised px-3 py-2 text-xs font-bold text-muted transition-colors hover:text-foreground"
      >
        Deny
      </button>
      <button
        type="button"
        onClick={() => go(pair.approve, pair.okMsg)}
        className="inline-flex min-h-[36px] items-center rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-primary-hover"
      >
        Approve
      </button>
    </span>
  );
}
