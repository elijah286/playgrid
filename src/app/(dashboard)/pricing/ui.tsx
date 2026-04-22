"use client";

import { useState, useTransition } from "react";
import { Check, Sparkles } from "lucide-react";
import {
  createBillingPortalSessionAction,
  createCheckoutSessionAction,
  redeemGiftCodeAction,
} from "@/app/actions/billing";
import { TIER_LABEL } from "@/lib/billing/features";
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
  highlight?: boolean;
};

const TIERS: TierDef[] = [
  {
    id: "free",
    name: "Solo Coach",
    tagline: "Build and print playsheets for free, forever.",
    price: { month: 0, year: 0 },
    features: [
      "Unlimited plays and playbooks",
      "Full play editor",
      "Playsheets (print + PDF)",
      "Formations library",
      "View shared playbooks",
    ],
    cta: "Get started",
  },
  {
    id: "coach",
    name: "Coach",
    tagline: "For head coaches running a real program.",
    price: { month: 9, year: 99 },
    features: [
      "Everything in Solo Coach",
      "Wristbands (print + PDF)",
      "Team invites and shared editing",
      "Collaborate with assistants",
      "Priority support",
    ],
    cta: "Upgrade to Coach",
    highlight: true,
  },
  {
    id: "coach_ai",
    name: "Coach AI",
    tagline: "Coach + AI tools to move faster.",
    price: { month: 25, year: 200 },
    features: [
      "Everything in Coach",
      "AI play suggestions (coming soon)",
      "Scouting report generation",
      "Automatic tagging",
      "Early access to new AI features",
    ],
    cta: "Upgrade to Coach AI",
  },
];

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

export function PricingClient({ entitlement }: { entitlement: Entitlement | null }) {
  const [interval, setInterval] = useState<Interval>("month");
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const currentTier = entitlement?.tier ?? "free";
  const source = entitlement?.source ?? "free";
  const isPaid = source === "stripe";

  function choose(t: TierDef) {
    setErr(null);
    if (t.id === "free") {
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

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {TIERS.map((t) => {
          const isCurrent = t.id === currentTier;
          const suffix = priceSuffix(t, interval);
          const savings = interval === "year" ? annualSavings(t) : null;
          return (
            <div
              key={t.id}
              className={cn(
                "relative flex flex-col rounded-2xl border bg-surface-raised p-6",
                t.highlight
                  ? "border-primary/60 ring-2 ring-primary/20"
                  : "border-border",
              )}
            >
              {t.highlight ? (
                <div className="absolute -top-3 right-6 inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white">
                  <Sparkles className="size-3" /> Most popular
                </div>
              ) : null}

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
                {isCurrent ? (
                  <button
                    type="button"
                    onClick={() => choose(t)}
                    disabled={pending || (isCurrent && !isPaid)}
                    className="w-full rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-surface disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isPaid ? "Manage billing" : "Current plan"}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => choose(t)}
                    disabled={pending}
                    className={cn(
                      "w-full rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50",
                      t.highlight
                        ? "bg-primary text-white hover:bg-primary-hover"
                        : "border border-border text-foreground hover:bg-surface",
                    )}
                  >
                    {t.cta}
                  </button>
                )}
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

      <RedeemCodePanel />

      <p className="text-center text-xs text-muted">
        Prices in USD. Team invitees collaborate free — only the head coach pays. Cancel anytime
        from Manage billing.
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
