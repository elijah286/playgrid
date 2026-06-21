"use client";

import { useEffect, useState, useTransition } from "react";

import {
  startConnectOnboardingAction,
  refreshConnectStatusAction,
  type LeaguePaymentStatus,
} from "@/app/actions/league-payments";

export function PaymentsConnect({
  leagueId,
  initial,
}: {
  leagueId: string;
  initial: LeaguePaymentStatus;
}) {
  const [status, setStatus] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function connect() {
    setError(null);
    startTransition(async () => {
      const r = await startConnectOnboardingAction(leagueId);
      if (!r.ok) setError(r.error);
      else globalThis.location.href = r.url;
    });
  }

  function refresh() {
    setError(null);
    startTransition(async () => {
      const r = await refreshConnectStatusAction(leagueId);
      if (!r.ok) setError(r.error);
      else setStatus((s) => ({ ...s, connected: true, chargesEnabled: r.chargesEnabled }));
    });
  }

  // After returning from Stripe onboarding, reconcile charges-enabled once.
  useEffect(() => {
    if (status.connected && !status.chargesEnabled) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="rounded-2xl border border-border p-4">
      {status.chargesEnabled ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm">
            <span className="inline-flex size-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
              ✓
            </span>
            <span className="font-medium text-foreground">Payments active</span>
            <span className="text-muted">— families are charged at registration.</span>
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={refresh}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-foreground/5 disabled:opacity-50"
          >
            {pending ? "Checking…" : "Refresh"}
          </button>
        </div>
      ) : status.connected ? (
        <div className="space-y-2">
          <div className="text-sm font-medium text-foreground">Finish your Stripe setup</div>
          <p className="text-sm text-muted">
            Your Stripe account is connected but can&apos;t accept charges yet — complete the
            remaining details to turn on payments.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={connect}
              className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50"
            >
              Continue setup
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={refresh}
              className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-foreground/5 disabled:opacity-50"
            >
              {pending ? "Checking…" : "Refresh status"}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="text-sm font-medium text-foreground">Accept payments online</div>
          <p className="text-sm text-muted">
            Connect a Stripe account to collect registration fees and add-ons. Payouts go straight
            to you; until you connect, registrations are recorded as unpaid.
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={connect}
            className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50"
          >
            {pending ? "Starting…" : "Connect Stripe"}
          </button>
        </div>
      )}
      {error ? (
        <p className="mt-3 text-sm text-amber-700 dark:text-amber-300">{error}</p>
      ) : null}
    </div>
  );
}
