"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, useToast } from "@/components/ui";
import { acceptExamplePlaybookAction } from "@/app/actions/example-claim";
import { track } from "@/lib/analytics/track";

export function ClaimExampleButton({
  playbookId,
  blockedByQuota,
}: {
  playbookId: string;
  blockedByQuota: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();

  function claim() {
    if (blockedByQuota) {
      toast(
        "You've already used your free playbook slot. Upgrade to Team Coach to claim this one alongside it.",
        "error",
      );
      return;
    }
    track({
      event: "example_cta_click",
      target: "claim_example_primary",
      metadata: { surface: "example_claim_page", playbook_id: playbookId },
    });
    start(async () => {
      const res = await acceptExamplePlaybookAction(playbookId);
      if (!res.ok) {
        toast(res.error, "error");
        return;
      }
      router.push(`/playbooks/${res.playbookId}`);
    });
  }

  return (
    <Button onClick={claim} loading={pending} disabled={blockedByQuota} className="w-full">
      Claim &amp; customize
    </Button>
  );
}
