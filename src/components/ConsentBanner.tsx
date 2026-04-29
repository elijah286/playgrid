"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { setConsentAction } from "@/app/actions/consent";

export default function ConsentBanner() {
  const [dismissed, setDismissed] = useState(false);
  const [pending, startTransition] = useTransition();

  if (dismissed) return null;

  function choose(value: "accepted" | "declined") {
    startTransition(async () => {
      await setConsentAction(value);
      setDismissed(true);
    });
  }

  return (
    <div
      role="dialog"
      aria-label="Cookie preferences"
      className="fixed inset-x-0 bottom-0 z-[60] mx-auto max-w-2xl px-3 pb-3 sm:px-4 sm:pb-4"
    >
      <div className="rounded-lg border border-border bg-surface p-4 shadow-lg">
        <p className="text-sm text-foreground">
          We use a small set of cookies to keep you signed in and, if you
          consent, to measure which marketing campaigns brought you here.
          You&rsquo;re seeing this because we detected a visit from the
          EU/UK.{" "}
          <Link href="/privacy" className="text-primary underline">
            Privacy policy
          </Link>
          .
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => choose("accepted")}
            className="inline-flex items-center justify-center rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
          >
            Accept all
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => choose("declined")}
            className="inline-flex items-center justify-center rounded-md border border-border bg-surface-inset px-3 py-1.5 text-sm font-medium text-foreground hover:bg-surface disabled:opacity-60"
          >
            Decline non-essential
          </button>
        </div>
      </div>
    </div>
  );
}
