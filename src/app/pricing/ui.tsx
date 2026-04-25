"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import {
  createBillingPortalSessionAction,
  createCheckoutSessionAction,
  redeemGiftCodeAction,
} from "@/app/actions/billing";
import { TIER_LABEL } from "@/lib/billing/features";
import { DEFAULT_INCLUDED_SEATS, SEAT_PRICE_USD_PER_MONTH } from "@/lib/billing/seats";
import type { Entitlement, SubscriptionTier } from "@/lib/billing/entitlement";
import { SegmentedControl } from "@/components/ui";
import { cn } from "@/lib/utils";

type Interval = "month" | "year";

type TierDef = {
  id: SubscriptionTier;
  name: string;
  tagline: string;
  price: { month: number; year: number };
  features: string[];
  cta: string;
};

function buildTiers(freeMaxPlays: number): TierDef[] {
  return [
  {
    id: "free",
    name: "Solo Coach",
    tagline: "Build and print playsheets for free, forever.",
    price: { month: 0, year: 0 },
    features: [
      `1 playbook with up to ${freeMaxPlays} plays`,
      "Full play editor",
      "Playsheets (print + PDF)",
      "Formations library",
      "View shared playbooks",
      "View on mobile",
    ],
    cta: "Get started",
  },
  {
    id: "coach",
    name: "Team Coach",
    tagline: "For head coaches running a real program.",
    price: { month: 9, year: 99 },
    features: [
      "Everything in Solo Coach",
      "Unlimited plays",
      "Wristbands (print + PDF)",
      `${DEFAULT_INCLUDED_SEATS} collaborator seats included — $${SEAT_PRICE_USD_PER_MONTH}/seat/month after`,
      "Manage players",
      "Share notes",
      "Game Mode — sideline view with play-by-play results tracking",
    ],
    cta: "Upgrade to Team Coach",
  },
  {
    id: "coach_ai",
    name: "Team Coach AI",
    tagline: "Team Coach + AI tools to move faster.",
    price: { month: 25, year: 200 },
    features: [
      "Everything in Team Coach",
      "AI play suggestions (coming soon)",
      "Scouting report generation",
      "Automatic tagging",
      "Early access to new AI features",
    ],
    cta: "Upgrade to Coach AI",
  },
  ];
}

function formatPrice(tier: TierDef, interval: Interval): string {
  const v = tier.price[interval];
  if (v === 0) return "Free";
  return `$${v}`;
}

function priceSuffix(tier: TierDef, interval: Interval): string | null {
  if (tier.price[interval] === 0) return null;
  return interval === "month" ? "/month" : "/year";
}

function annualSavings(tier: TierDef): number | null {
  if (tier.price.month === 0 || tier.price.year === 0) return null;
  const yearly = tier.price.month * 12;
  const pct = Math.round(((yearly - tier.price.year) / yearly) * 100);
  return pct > 0 ? pct : null;
}

export function PricingClient({
  entitlement,
  showCoachAi,
  isAuthed = true,
  freeMaxPlays,
}: {
  entitlement: Entitlement | null;
  showCoachAi: boolean;
  isAuthed?: boolean;
  freeMaxPlays: number;
}) {
  const allTiers = buildTiers(freeMaxPlays);
  const tiers = showCoachAi ? allTiers : allTiers.filter((t) => t.id !== "coach_ai");
  const [interval, setInterval] = useState<Interval>("month");
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const currentTier = entitlement?.tier ?? "free";
  const source = entitlement?.source ?? "free";
  const isPaid = source === "stripe";

  function choose(t: TierDef) {
    setErr(null);
    if (!isAuthed) {
      window.location.href = "/login?mode=signup";
      return;
    }
    // Free-tier button when the user is on a paid plan means "downgrade";
    // route them through the billing portal where Stripe handles it.
    if (t.id === "free") {
      if (isPaid) {
        startTransition(async () => {
          const res = await createBillingPortalSessionAction();
          if (!res.ok) {
            setErr(res.error);
            return;
          }
          window.location.href = res.url;
        });
        return;
      }
      window.location.href = "/home";
      return;
    }
    if (t.id === currentTier && isPaid) {
      startTransition(async () => {
        const res = await createBillingPortalSessionAction();
        if (!res.ok) {
          setErr(res.error);
          return;
        }
        window.location.href = res.url;
      });
      return;
    }
    startTransition(async () => {
      const res = await createCheckoutSessionAction({
        tier: t.id as Exclude<SubscriptionTier, "free">,
        interval,
      });
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      window.location.href = res.url;
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-center">
        <SegmentedControl
          options={[
            { value: "month" as const, label: "Monthly" },
            { value: "year" as const, label: "Annual" },
          ]}
          value={interval}
          onChange={setInterval}
        />
      </div>

      <div
        className={cn(
          "grid grid-cols-1 gap-4",
          tiers.length === 3 ? "md:grid-cols-3" : "md:grid-cols-2 max-w-3xl mx-auto",
        )}
      >
        {tiers.map((t) => {
          const isCurrent = t.id === currentTier;
          const suffix = priceSuffix(t, interval);
          const savings = interval === "year" ? annualSavings(t) : null;
          return (
            <div
              key={t.id}
              className="relative flex flex-col rounded-2xl border border-border bg-surface-raised p-6"
            >

              <div className="mb-4">
                <h2 className="text-lg font-bold text-foreground">{t.name}</h2>
                <p className="mt-1 text-xs text-muted">{t.tagline}</p>
              </div>

              <div className="mb-5 flex items-baseline gap-1">
                <span className="text-3xl font-extrabold tracking-tight text-foreground">
                  {formatPrice(t, interval)}
                </span>
                {suffix ? (
                  <span className="text-sm text-muted">{suffix}</span>
                ) : null}
                {savings && interval === "year" ? (
                  <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800 ring-1 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-100 dark:ring-emerald-800">
                    Save {savings}%
                  </span>
                ) : null}
              </div>

              <ul className="mb-6 space-y-2 text-sm">
                {t.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                    <span className="text-foreground">{f}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-auto">
                {(() => {
                  // Unauthed: always "Get started" (orange) → signup.
                  if (!isAuthed) {
                    return (
                      <button
                        type="button"
                        onClick={() => choose(t)}
                        disabled={pending}
                        className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50"
                      >
                        Get started
                      </button>
                    );
                  }
                  // Authed, viewing current plan.
                  if (isCurrent) {
                    return (
                      <button
                        type="button"
                        onClick={() => choose(t)}
                        disabled={pending || !isPaid}
                        className="w-full rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-surface disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isPaid ? "Manage billing" : "Current plan"}
                      </button>
                    );
                  }
                  // Authed, viewing free while on a paid plan = Downgrade.
                  if (t.id === "free" && isPaid) {
                    return (
                      <button
                        type="button"
                        onClick={() => choose(t)}
                        disabled={pending}
                        className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50"
                      >
                        Downgrade
                      </button>
                    );
                  }
                  // Authed, paid tier they don't have = Upgrade (orange).
                  return (
                    <button
                      type="button"
                      onClick={() => choose(t)}
                      disabled={pending}
                      className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50"
                    >
                      {t.cta}
                    </button>
                  );
                })()}
              </div>
            </div>
          );
        })}
      </div>

      {err ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-900 ring-1 ring-red-200">
          {err}
        </p>
      ) : null}

      {isAuthed && <RedeemCodePanel />}

      <p className="text-center text-xs text-muted">
        Prices in USD. Team Coach includes {DEFAULT_INCLUDED_SEATS} collaborator
        seats; add more for ${SEAT_PRICE_USD_PER_MONTH}/seat/month. Coaches who
        already have their own Team Coach plan don&rsquo;t count against your
        seats. Cancel anytime from Manage billing.
      </p>
    </div>
  );
}

function RedeemCodePanel() {
  const [code, setCode] = useState("");
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<
    { kind: "success" | "error"; text: string } | null
  >(null);

  function submit() {
    if (!code.trim()) return;
    setMsg(null);
    startTransition(async () => {
      const res = await redeemGiftCodeAction(code);
      if (!res.ok) {
        setMsg({ kind: "error", text: res.error });
        return;
      }
      const expires = res.expiresAt
        ? ` until ${new Date(res.expiresAt).toLocaleDateString()}`
        : "";
      setMsg({
        kind: "success",
        text: `Code redeemed — you now have ${TIER_LABEL[res.tier]}${expires}. Refresh to see your new plan.`,
      });
      setCode("");
    });
  }

  return (
    <div className="mx-auto max-w-md rounded-2xl border border-border bg-surface-raised p-5">
      <h3 className="text-sm font-semibold text-foreground">Have a code?</h3>
      <p className="mt-1 text-xs text-muted">
        Redeem a gift code to upgrade your account without paying.
      </p>
      <div className="mt-3 flex gap-2">
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          placeholder="Enter code"
          className="block w-full rounded-md bg-surface px-3 py-1.5 font-mono text-sm uppercase tracking-wide ring-1 ring-border"
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="button"
          onClick={submit}
          disabled={pending || !code.trim()}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50"
        >
          Redeem
        </button>
      </div>
      {msg ? (
        <p
          className={cn(
            "mt-3 rounded-md px-3 py-2 text-xs ring-1",
            msg.kind === "error"
              ? "bg-red-50 text-red-900 ring-red-200"
              : "bg-emerald-50 text-emerald-900 ring-emerald-200",
          )}
        >
          {msg.text}
        </p>
      ) : null}
    </div>
  );
}
