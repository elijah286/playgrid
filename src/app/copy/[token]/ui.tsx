"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { acceptCopyLinkAction } from "@/app/actions/copy-links";
import { Button, useToast } from "@/components/ui";

export function ClaimCopyButton({
  token,
  blockedByQuota = false,
}: {
  token: string;
  /** Pre-flight signal from the server: free user, slot already used.
   *  We render an upgrade CTA instead of the claim button so we don't
   *  burn the click on a server-side rejection. */
  blockedByQuota?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, setPending] = useState(false);

  async function claim() {
    setPending(true);
    const res = await acceptCopyLinkAction(token);
    if (!res.ok) {
      setPending(false);
      toast(res.error, "error");
      return;
    }
    // Drop them straight into the Customize dialog so the first thing
    // they see is "this is yours, name it / brand it." The header
    // reads `?customize=1` from the query and opens the dialog.
    router.push(`/playbooks/${res.playbookId}?customize=1`);
  }

  if (blockedByQuota) {
    return (
      <Link
        href="/pricing"
        className="block w-full rounded-lg bg-primary px-4 py-2 text-center text-sm font-semibold text-white hover:bg-primary/90"
      >
        Upgrade to claim
      </Link>
    );
  }

  return (
    <Button variant="primary" loading={pending} onClick={claim} className="w-full">
      Claim &amp; customize
    </Button>
  );
}
