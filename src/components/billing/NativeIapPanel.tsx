"use client";

import { type ReactNode, useEffect, useState } from "react";
import { nativePlatform } from "@/lib/native/isNativeApp";
import { getIapClientConfig } from "@/app/actions/iap";
import {
  configureIap,
  getCoachOffers,
  purchaseCoach,
  restoreCoach,
  type CoachOffer,
} from "@/lib/native/iap";

type Phase = "loading" | "unavailable" | "ready" | "success";

/**
 * iOS in-app purchase panel for the Coach plan. Renders the StoreKit-priced
 * offers + a Subscribe / Restore flow when IAP is enabled (server flag +
 * RevenueCat configured), and otherwise renders `fallback` — so on web, on
 * Android, and on iOS-before-launch it shows exactly what was there before.
 * Prices come straight from StoreKit (offer.priceString); never hardcode them.
 */
export function NativeIapPanel({ fallback }: { fallback: ReactNode }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [offers, setOffers] = useState<CoachOffer[]>([]);
  const [busy, setBusy] = useState<string | null>(null); // packageId or "restore"
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (nativePlatform() !== "ios") {
        if (!cancelled) setPhase("unavailable");
        return;
      }
      try {
        const cfg = await getIapClientConfig();
        if (!cfg.enabled || !cfg.iosSdkKey) {
          if (!cancelled) setPhase("unavailable");
          return;
        }
        await configureIap(cfg.iosSdkKey);
        const list = await getCoachOffers();
        if (cancelled) return;
        if (!list.length) {
          setPhase("unavailable");
          return;
        }
        setOffers(list);
        setPhase("ready");
      } catch {
        if (!cancelled) setPhase("unavailable");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function buy(offer: CoachOffer) {
    setBusy(offer.packageId);
    setError(null);
    const res = await purchaseCoach(offer.packageId);
    setBusy(null);
    if (res.cancelled) return;
    if (res.ok && res.entitled) {
      setPhase("success");
      return;
    }
    setError(res.error ?? "That didn’t go through. Please try again.");
  }

  async function restore() {
    setBusy("restore");
    setError(null);
    const res = await restoreCoach();
    setBusy(null);
    if (res.entitled) {
      setPhase("success");
      return;
    }
    setError("We couldn’t find a previous purchase to restore.");
  }

  if (phase === "loading") {
    return (
      <div className="rounded-2xl border border-border bg-surface-raised p-6 text-sm text-muted">
        Loading plans…
      </div>
    );
  }

  if (phase === "unavailable") return <>{fallback}</>;

  if (phase === "success") {
    return (
      <div className="rounded-2xl border border-border bg-surface-raised p-6 text-center">
        <p className="text-base font-semibold text-foreground">You’re on Team Coach 🎉</p>
        <p className="mt-1 text-sm text-muted">
          Your plan is active — all Team Coach features are unlocked.
        </p>
        <button
          type="button"
          onClick={() => {
            window.location.href = "/home?welcome=team_coach";
          }}
          className="mt-4 inline-flex items-center rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary-hover"
        >
          Continue
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-surface-raised p-6">
      <p className="text-base font-semibold text-foreground">Team Coach</p>
      <p className="mt-1 text-sm text-muted">
        Unlimited playbooks and plays, Coach Cal AI, game mode, wristbands, and team sharing.
      </p>
      <div className="mt-4 flex flex-col gap-2">
        {offers.map((offer) => (
          <button
            key={offer.packageId}
            type="button"
            disabled={busy !== null}
            onClick={() => buy(offer)}
            className="flex items-center justify-between rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-60"
          >
            <span>{offer.interval === "year" ? "Annual" : "Monthly"}</span>
            <span>
              {busy === offer.packageId
                ? "…"
                : `${offer.priceString}/${offer.interval === "year" ? "yr" : "mo"}`}
            </span>
          </button>
        ))}
      </div>
      <button
        type="button"
        disabled={busy !== null}
        onClick={restore}
        className="mt-3 text-xs font-medium text-muted hover:text-foreground disabled:opacity-60"
      >
        {busy === "restore" ? "Restoring…" : "Restore purchase"}
      </button>
      {error ? <p className="mt-2 text-xs text-red-700">{error}</p> : null}
      <p className="mt-3 text-[11px] leading-relaxed text-muted">
        Billed through your Apple account. Cancel anytime in Settings → your name → Subscriptions.
      </p>
    </div>
  );
}
