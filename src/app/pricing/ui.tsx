"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import {
  createBillingPortalSessionAction,
  createCheckoutSessionAction,
  previewSubscriptionChangeAction,
  confirmSubscriptionChangeAction,
} from "@/app/actions/billing";
import { track } from "@/lib/analytics/track";
import {
  MESSAGE_PACK_PRICE_USD_PER_MONTH,
  MESSAGE_PACK_SIZE,
  SEAT_PRICE_USD_PER_MONTH,
} from "@/lib/billing/seats-config";
import type { SeatDefaults } from "@/lib/site/seat-defaults-config";
import type { Entitlement, SubscriptionTier } from "@/lib/billing/entitlement";
import { Modal, SegmentedControl } from "@/components/ui";
import { cn } from "@/lib/utils";

const TIER_RANK: Record<SubscriptionTier, number> = {
  free: 0,
  coach: 1,
  coach_ai: 2,
};

type PreviewLine = { description: string; amount: number };
type UpgradePreview = {
  amountDueNow: number;
  currency: string;
  lines: PreviewLine[];
  nextRenewalAt: string | null;
};
type UpgradeModalState = {
  targetTier: Exclude<SubscriptionTier, "free">;
  targetName: string;
  targetInterval: Interval;
  preview: UpgradePreview | null;
  loadingPreview: boolean;
  confirming: boolean;
  error: string | null;
};

type Interval = "month" | "year";

type TierDef = {
  id: SubscriptionTier;
  name: string;
  tagline: string;
  price: { month: number; year: number };
  features: string[];
  addOns?: string;
  cta: string;
};

function buildTiers(
  freeMaxPlays: number,
  seatDefaults: SeatDefaults,
  evalDays: number,
): TierDef[] {
  return [
  {
    id: "free",
    name: "Solo Coach",
    tagline: "Run your team's playbook, schedule, and roster — free, forever.",
    price: { month: 0, year: 0 },
    features: [
      `1 playbook with up to ${freeMaxPlays} plays`,
      "Full play editor",
      "Playsheets (print + PDF)",
      "Formations library",
      "Team calendar — practices, games, scrimmages with player RSVPs",
      "Invite unlimited players to view the playbook and get schedule updates",
      "Manage your roster (names, jersey numbers, positions)",
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
      `Invite ${seatDefaults.coach} assistant coach${seatDefaults.coach === 1 ? "" : "es"} to collaborate on the playbook`,
      "Send a copy of your playbook to another coach",
      "Practice plans — build reusable templates, collaborate with co-coaches, share with players",
      "Game Mode — sideline view with play-by-play results tracking",
      "Play & playbook history — every change tracked, restore any version",
    ],
    addOns: `Need more? +$${SEAT_PRICE_USD_PER_MONTH}/seat/mo`,
    cta: "Upgrade to Team Coach",
  },
  {
    id: "coach_ai",
    name: "Coach Pro",
    tagline: "Your AI coaching partner — Coach Cal included.",
    price: { month: 25, year: 250 },
    features: [
      "Everything in Team Coach",
      `${seatDefaults.coachPro} collaborator seat${seatDefaults.coachPro === 1 ? "" : "s"} included`,
      "Coach Cal AI — ask anything, get instant answers",
      "Generate plays and full playbooks with AI",
      "Strategy feedback vs. specific defenses",
      "Adjust playbook to your team's skill level",
      "Bulk formation edits across your playbook",
      "Practice and game scheduling help",
      "200 Coach Cal messages per month",
    ],
    addOns: `Scale up: +$${SEAT_PRICE_USD_PER_MONTH}/seat/mo · +$${MESSAGE_PACK_PRICE_USD_PER_MONTH}/mo per ${MESSAGE_PACK_SIZE} extra messages`,
    cta: `Start ${evalDays}-day free trial`,
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
  seatDefaults,
  coachAiEvalDays,
}: {
  entitlement: Entitlement | null;
  showCoachAi: boolean;
  isAuthed?: boolean;
  freeMaxPlays: number;
  seatDefaults: SeatDefaults;
  coachAiEvalDays: number;
}) {
  const allTiers = buildTiers(freeMaxPlays, seatDefaults, coachAiEvalDays);
  const tiers = showCoachAi ? allTiers : allTiers.filter((t) => t.id !== "coach_ai");
  const [interval, setInterval] = useState<Interval>("month");
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [upgradeModal, setUpgradeModal] = useState<UpgradeModalState | null>(null);
  const currentTier = entitlement?.tier ?? "free";
  const source = entitlement?.source ?? "free";
  const isPaid = source === "stripe";

  function openUpgradeModal(t: TierDef) {
    const targetTier = t.id as Exclude<SubscriptionTier, "free">;
    setErr(null);
    setUpgradeModal({
      targetTier,
      targetName: t.name,
      targetInterval: interval,
      preview: null,
      loadingPreview: true,
      confirming: false,
      error: null,
    });
    track({
      event: "checkout_started",
      target: t.id,
      metadata: { interval, tier: t.id, flow: "upgrade" },
    });
    void (async () => {
      const res = await previewSubscriptionChangeAction({
        targetTier,
        targetInterval: interval,
      });
      setUpgradeModal((cur) => {
        if (!cur || cur.targetTier !== targetTier || cur.targetInterval !== interval) return cur;
        if (!res.ok) return { ...cur, loadingPreview: false, error: res.error };
        const { amountDueNow, currency, lines, nextRenewalAt } = res;
        return {
          ...cur,
          loadingPreview: false,
          preview: { amountDueNow, currency, lines, nextRenewalAt },
        };
      });
    })();
  }

  function confirmUpgrade() {
    if (!upgradeModal) return;
    const { targetTier, targetInterval } = upgradeModal;
    setUpgradeModal((cur) => (cur ? { ...cur, confirming: true, error: null } : cur));
    void (async () => {
      const res = await confirmSubscriptionChangeAction({ targetTier, targetInterval });
      if (!res.ok) {
        setUpgradeModal((cur) => (cur ? { ...cur, confirming: false, error: res.error } : cur));
        return;
      }
      // Hard reload to pick up the new entitlement everywhere.
      window.location.href = "/account?upgrade=success";
    })();
  }

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
    // Existing paid customer moving between paid tiers. Upgrades go through
    // the in-place proration flow; downgrades route to the Stripe portal
    // until Phase 2 ships scheduled downgrades.
    if (isPaid && t.id !== currentTier) {
      if (TIER_RANK[t.id] > TIER_RANK[currentTier]) {
        openUpgradeModal(t);
        return;
      }
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
      // Telemetry: record the click so the engagement funnel can show
      // pricing → checkout dropoff. Fired before the action so we still
      // capture intent if the action fails or the redirect aborts.
      track({
        event: "checkout_started",
        target: t.id,
        metadata: { interval, tier: t.id },
      });
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
          const isProTier = t.id === "coach_ai";
          return (
            <div
              key={t.id}
              className={cn(
                "relative flex flex-col rounded-2xl border p-6",
                isProTier
                  ? "border-primary/40 bg-primary/[0.03] ring-2 ring-primary/20"
                  : "border-border bg-surface-raised",
              )}
            >
              {isProTier && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="inline-flex items-center rounded-full bg-primary px-3 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white shadow">
                    Most Popular
                  </span>
                </div>
              )}

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

              <ul className="mb-3 space-y-2 text-sm">
                {t.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                    <span className="text-foreground">{f}</span>
                  </li>
                ))}
              </ul>
              {t.addOns ? (
                <p className="mb-6 pl-6 text-[11px] text-muted">{t.addOns}</p>
              ) : (
                <div className="mb-6" />
              )}

              <div className="mt-auto">
                {(() => {
                  // Unauthed: always "Get started" (orange) → signup.
                  if (!isAuthed) {
                    return (
                      <>
                        <button
                          type="button"
                          onClick={() => choose(t)}
                          disabled={pending}
                          className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50"
                        >
                          Get started
                        </button>
                        {isProTier && (
                          <p className="mt-1.5 text-center text-[11px] text-muted">
                            {coachAiEvalDays}-day free trial · no charge today
                          </p>
                        )}
                      </>
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
                  // Authed, paid tier they don't have = Upgrade or
                  // Downgrade between paid tiers (or first-time subscribe
                  // for a non-paying user).
                  const isPaidDowngrade =
                    isPaid && t.id !== "free" && TIER_RANK[t.id] < TIER_RANK[currentTier];
                  const label = isPaidDowngrade ? `Downgrade to ${t.name}` : t.cta;
                  // Trial copy only applies to first-time subscribers.
                  const showTrialNote = isProTier && !isPaid;
                  return (
                    <>
                      <button
                        type="button"
                        onClick={() => choose(t)}
                        disabled={pending}
                        className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50"
                      >
                        {label}
                      </button>
                      {showTrialNote && (
                        <p className="mt-1.5 text-center text-[11px] text-muted">
                          {coachAiEvalDays}-day free trial · no charge today
                        </p>
                      )}
                    </>
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

      <AddOnsDisclosure showCoachAi={showCoachAi} />

      <p className="text-center text-xs text-muted">
        Prices in USD. Coaches who already have their own paid plan
        don&rsquo;t count against your seats. Cancel anytime from Manage
        billing.
      </p>

      <UpgradePreviewModal
        state={upgradeModal}
        onClose={() => setUpgradeModal(null)}
        onConfirm={confirmUpgrade}
      />
    </div>
  );
}

function formatMoney(amount: number, currency: string): string {
  // Stripe returns minor units (cents for USD). Intl handles the conversion
  // via minimumFractionDigits=2 / divide-by-100.
  const value = amount / 100;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(value);
  } catch {
    return `$${value.toFixed(2)}`;
  }
}

function UpgradePreviewModal({
  state,
  onClose,
  onConfirm,
}: {
  state: UpgradeModalState | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const open = state !== null;
  const renewal = state?.preview?.nextRenewalAt
    ? new Date(state.preview.nextRenewalAt).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : null;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={state ? `Upgrade to ${state.targetName}` : "Upgrade"}
      footer={
        state ? (
          <>
            <button
              type="button"
              onClick={onClose}
              disabled={state.confirming}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-surface disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={state.confirming || state.loadingPreview || !state.preview}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50"
            >
              {state.confirming ? "Upgrading…" : "Confirm upgrade"}
            </button>
          </>
        ) : null
      }
    >
      {state?.loadingPreview ? (
        <p className="text-sm text-muted">Calculating proration…</p>
      ) : state?.error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-900 ring-1 ring-red-200">
          {state.error}
        </p>
      ) : state?.preview ? (
        <div className="space-y-4 text-sm">
          <p className="text-foreground">
            You&rsquo;ll be charged{" "}
            <span className="font-semibold">
              {formatMoney(state.preview.amountDueNow, state.preview.currency)}
            </span>{" "}
            today, prorated for the remainder of your current billing period.
          </p>
          {state.preview.lines.length > 0 && (
            <div className="rounded-lg border border-border bg-surface-inset px-3 py-2">
              <ul className="space-y-1 text-xs">
                {state.preview.lines.map((line, i) => (
                  <li key={i} className="flex justify-between gap-3">
                    <span className="text-muted">{line.description}</span>
                    <span className="font-mono text-foreground">
                      {formatMoney(line.amount, state.preview!.currency)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {renewal && (
            <p className="text-xs text-muted">
              Your subscription will renew on {renewal} at the new plan rate.
            </p>
          )}
        </div>
      ) : null}
    </Modal>
  );
}

function AddOnsDisclosure({ showCoachAi }: { showCoachAi: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mx-auto max-w-md text-center">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-xs text-muted underline-offset-2 hover:text-foreground hover:underline"
      >
        {open ? "Hide add-ons" : "See add-ons"}
      </button>
      {open ? (
        <div className="mt-3 rounded-xl border border-border bg-surface-raised p-4 text-left text-xs text-foreground">
          <dl className="space-y-3">
            <div>
              <dt className="font-semibold">Extra collaborator seats</dt>
              <dd className="text-muted">
                ${SEAT_PRICE_USD_PER_MONTH}/seat/month, billed with your plan.
                Add or remove seats anytime from Manage billing. Coaches who
                already pay for their own plan don&rsquo;t count.
              </dd>
            </div>
            {showCoachAi ? (
              <div>
                <dt className="font-semibold">Extra Coach Cal messages</dt>
                <dd className="text-muted">
                  ${MESSAGE_PACK_PRICE_USD_PER_MONTH}/month per pack of{" "}
                  {MESSAGE_PACK_SIZE} additional messages on Coach Pro. Stack
                  as many packs as you need; unused messages don&rsquo;t roll
                  over.
                </dd>
              </div>
            ) : null}
          </dl>
        </div>
      ) : null}
    </div>
  );
}

