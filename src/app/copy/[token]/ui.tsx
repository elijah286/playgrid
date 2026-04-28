"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { acceptCopyLinkAction } from "@/app/actions/copy-links";
import { Button, useToast } from "@/components/ui";

export function ClaimCopyButton({ token }: { token: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, setPending] = useState(false);
  const [needsUpgrade, setNeedsUpgrade] = useState<string | null>(null);

  async function claim() {
    setPending(true);
    const res = await acceptCopyLinkAction(token);
    if (!res.ok) {
      setPending(false);
      if (res.needsUpgrade) {
        setNeedsUpgrade(res.error);
        return;
      }
      toast(res.error, "error");
      return;
    }
    router.push(`/playbooks/${res.playbookId}`);
  }

  if (needsUpgrade) {
    return (
      <div className="space-y-3">
        <div className="rounded-md bg-warning-light px-3 py-2 text-xs text-warning ring-1 ring-warning/30">
          {needsUpgrade}
        </div>
        <Link
          href="/pricing"
          className="block w-full rounded-lg bg-primary px-4 py-2 text-center text-sm font-semibold text-white hover:bg-primary/90"
        >
          See pricing
        </Link>
        <button
          type="button"
          onClick={() => setNeedsUpgrade(null)}
          className="block w-full text-center text-xs text-muted underline-offset-2 hover:text-foreground hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <Button variant="primary" loading={pending} onClick={claim} className="w-full">
      Claim my copy
    </Button>
  );
}
