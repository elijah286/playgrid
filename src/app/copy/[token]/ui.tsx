"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { acceptCopyLinkAction } from "@/app/actions/copy-links";
import { Button, useToast } from "@/components/ui";

/** The claim path can take 10–20s for a big playbook — it sequentially
 *  copies plays + play_versions + formations + groups. A bare spinner
 *  for that long reads as "it's stuck"; cycling the status text + an
 *  indeterminate progress bar gives the user something to watch and
 *  signals real progress is happening on the server. */
function stageFor(elapsedMs: number, playCount: number): string {
  if (elapsedMs < 1500) return "Setting up your workspace…";
  if (elapsedMs < 5000) {
    const noun = playCount === 1 ? "play" : "plays";
    return `Cloning ${playCount} ${noun}…`;
  }
  if (elapsedMs < 12000) return "Almost there…";
  return "Still working — hang tight…";
}

export function ClaimCopyButton({
  token,
  playCount,
  blockedByQuota = false,
}: {
  token: string;
  /** Source playbook size — drives the "Cloning N plays…" message so the
   *  user knows the wait is proportional to real work, not a hang. */
  playCount: number;
  /** Pre-flight signal from the server: free user, slot already used.
   *  We render an upgrade CTA instead of the claim button so we don't
   *  burn the click on a server-side rejection. */
  blockedByQuota?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, setPending] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (!pending) {
      setElapsedMs(0);
      return;
    }
    const start = Date.now();
    const id = window.setInterval(() => {
      setElapsedMs(Date.now() - start);
    }, 250);
    return () => window.clearInterval(id);
  }, [pending]);

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
      <>
        <Link
          href="/pricing"
          data-web-only
          className="block w-full rounded-lg bg-primary px-4 py-2 text-center text-sm font-semibold text-white hover:bg-primary/90"
        >
          Upgrade to claim
        </Link>
        <p
          data-native-only
          className="rounded-lg border border-border px-4 py-2 text-center text-sm text-muted"
        >
          You&apos;ve reached the free playbook limit.
        </p>
      </>
    );
  }

  if (pending) {
    return (
      <div
        className="space-y-2"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <div className="indeterminate-bar text-primary" />
        <p className="text-center text-xs text-muted">
          {stageFor(elapsedMs, playCount)}
        </p>
      </div>
    );
  }

  return (
    <Button variant="primary" onClick={claim} className="w-full">
      Claim &amp; customize
    </Button>
  );
}
