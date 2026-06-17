"use client";

import { type ReactNode, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { nativePlatform } from "@/lib/native/isNativeApp";
import { getIapClientConfig } from "@/app/actions/iap";
import {
  getCoachOffers,
  purchaseCoach,
  restoreCoach,
  withTimeout,
  type CoachOffer,
} from "@/lib/native/iap";

type Phase = "loading" | "unavailable" | "error" | "ready" | "success";

/**
 * Apple Guideline 3.1.2(c): the purchase flow must surface functional
 * Terms of Use (EULA) + Privacy Policy links. These render in EVERY phase where
 * IAP is active — loading, error, AND ready — not just the ready state. A
 * reviewer who hits a transient StoreKit load failure (the 2.1(b) rejection)
 * lands on the `error` card; if the links only lived in `ready`, that card
 * would have no legal links and re-trip 3.1.2(c). Keeping them here makes the
 * two rejections independent: the links are present even when 0 products load.
 */
function LegalLinks() {
  return (
    <p className="mt-3 text-[11px] leading-relaxed text-muted">
      <Link href="/terms" className="underline underline-offset-2 hover:text-foreground">
        Terms of Use (EULA)
      </Link>
      {" · "}
      <Link href="/privacy" className="underline underline-offset-2 hover:text-foreground">
        Privacy Policy
      </Link>
    </p>
  );
}

/**
 * iOS in-app purchase panel for the Coach plan. Renders the StoreKit-priced
 * offers + a Subscribe / Restore flow when IAP is enabled (server flag +
 * StoreKit ready), and otherwise renders `fallback` — so on web, on
 * Android, and on iOS-before-launch it shows exactly what was there before.
 * Prices come straight from StoreKit (offer.priceString); never hardcode them.
 */
export function NativeIapPanel({ fallback }: { fallback: ReactNode }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [offers, setOffers] = useState<CoachOffer[]>([]);
  const [busy, setBusy] = useState<string | null>(null); // packageId or "restore"
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setPhase("loading");
    setError(null);
    if (nativePlatform() !== "ios") {
      setPhase("unavailable");
      return;
    }
    try {
      // The enabled-flag check is a server action; if it hangs or fails on a
      // flaky WebView connection, don't spin forever — assume enabled and let
      // the StoreKit fetch (which has its own timeout) decide. A genuine
      // `false` still shows the neutral fallback.
      let enabled = true;
      try {
        const cfg = await withTimeout(getIapClientConfig(), 6000, "iap config");
        enabled = cfg.enabled;
      } catch {
        enabled = true;
      }
      if (!enabled) {
        // IAP is off (pre-launch / web / Android) → show the neutral fallback.
        setPhase("unavailable");
        return;
      }
      const list = await getCoachOffers();
      if (!list.length) {
        // IAP is ON but StoreKit returned nothing (bad ids, products not yet
        // "Ready to Submit", or no StoreKit config) — that's a load failure the
        // coach can retry, NOT "purchases unavailable".
        setPhase("error");
        return;
      }
      setOffers(list);
      setPhase("ready");
    } catch {
      setPhase("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function buy(offer: CoachOffer) {
    setBusy(offer.productId);
    setError(null);
    const res = await purchaseCoach(offer.productId);
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
        <LegalLinks />
      </div>
    );
  }

  if (phase === "unavailable") return <>{fallback}</>;

  if (phase === "error") {
    return (
      <div className="rounded-2xl border border-border bg-surface-raised p-6">
        <p className="text-base font-semibold text-foreground">Team Coach</p>
        <p className="mt-1 text-sm text-muted">
          We couldn’t load plans from the App Store just now. Check your
          connection and try again.
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void load()}
            className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-60"
          >
            Try again
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={restore}
            className="text-xs font-medium text-muted hover:text-foreground disabled:opacity-60"
          >
            {busy === "restore" ? "Restoring…" : "Already subscribed? Restore"}
          </button>
        </div>
        {error ? <p className="mt-2 text-xs text-red-700">{error}</p> : null}
        <LegalLinks />
      </div>
    );
  }

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
            key={offer.productId}
            type="button"
            disabled={busy !== null}
            onClick={() => buy(offer)}
            className="flex items-center justify-between rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-60"
          >
            <span>{offer.interval === "year" ? "Annual" : "Monthly"}</span>
            <span>
              {busy === offer.productId
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
      {/* Apple Guideline 3.1.2(c): auto-renew disclosure + functional EULA &
          privacy links must live in the purchase flow itself. Title, length,
          and price are shown in the offer buttons above. */}
      <p className="mt-3 text-[11px] leading-relaxed text-muted">
        Team Coach is an auto-renewing subscription billed to your Apple Account. It renews
        automatically unless canceled at least 24 hours before the end of the current period; manage
        or cancel anytime in Settings → your name → Subscriptions.
      </p>
      <LegalLinks />
    </div>
  );
}
