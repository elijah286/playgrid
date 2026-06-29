"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Check,
  Sparkles,
  Trophy,
  ClipboardList,
  Layers,
  Megaphone,
  ArrowRight,
} from "lucide-react";
import {
  createBillingPortalSessionAction,
  previewSubscriptionChangeAction,
  confirmSubscriptionChangeAction,
  previewSubscriptionDowngradeAction,
  scheduleSubscriptionDowngradeAction,
} from "@/app/actions/billing";
import { track } from "@/lib/analytics/track";
import { SEAT_PRICE_USD_PER_MONTH } from "@/lib/billing/seats-config";
import type { SeatDefaults } from "@/lib/site/seat-defaults-config";
import type { Entitlement, SubscriptionTier } from "@/lib/billing/entitlement";
import { Modal, SegmentedControl } from "@/components/ui";
import { cn } from "@/lib/utils";
import { isNativeApp } from "@/lib/native/isNativeApp";
import { useIsNativeApp } from "@/lib/native/useIsNativeApp";

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
type DowngradeModalState = {
  targetTier: SubscriptionTier;
  targetName: string;
  targetInterval: Interval;
  currentName: string | null;
  effectiveAt: string | null;
  loadingPreview: boolean;
  confirming: boolean;
  error: string | null;
};

type Interval = "month" | "year";

type Feature = string | { text: string; bold?: boolean };
type TierDef = {
  id: SubscriptionTier;
  name: string;
  tagline: string;
  price: { month: number; year: number };
  features: Feature[];
  limitNote?: string;
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
    limitNote: `1 playbook · ${freeMaxPlays} plays max`,
    features: [
      "Full play editor with playsheets (print + PDF) and formations library",
      "Team calendar — practices, games, scrimmages with player RSVPs",
      "Invite unlimited players to view the playbook and get schedule updates",
      "Manage your roster (names, jersey numbers, positions)",
    ],
    cta: "Get started",
  },
  {
    id: "coach",
    name: "Team Coach",
    tagline: "Everything you need to coach a season — plus Coach Cal AI.",
    price: { month: 9, year: 99 },
    features: [
      { text: "Unlimited plays", bold: true },
      { text: "Unlimited playbooks", bold: true },
      "Coach Cal AI — generate plays, plan practices, get strategy feedback (50 messages/month)",
      "Game Mode — sideline view with play-by-play results tracking",
      "Wristbands (print + PDF)",
      `Invite ${seatDefaults.coach} assistant coach${seatDefaults.coach === 1 ? "" : "es"} to collaborate on the playbook`,
      "Send a copy of your playbook to another coach",
      "Practice plans — build reusable templates, collaborate with co-coaches, share with players",
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
      "Coach Cal AI — generates plays, plans practices, manages your team",
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
    addOns: `Scale up: +$${SEAT_PRICE_USD_PER_MONTH}/seat/mo`,
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
  coachProTrialUsed = false,
}: {
  entitlement: Entitlement | null;
  showCoachAi: boolean;
  isAuthed?: boolean;
  freeMaxPlays: number;
  seatDefaults: SeatDefaults;
  coachAiEvalDays: number;
  /** True iff this user already used the Coach Pro trial — Stripe won't
   *  grant a second one, so the CTA copy switches to "Subscribe" and the
   *  "no charge today" footnote is suppressed. */
  coachProTrialUsed?: boolean;
}) {
  const router = useRouter();
  const allTiers = buildTiers(freeMaxPlays, seatDefaults, coachAiEvalDays);
  const tiers = showCoachAi ? allTiers : allTiers.filter((t) => t.id !== "coach_ai");
  const [interval, setInterval] = useState<Interval>("month");
  const [pending, startTransition] = useTransition();
  // App Store Guideline 3.1.1 backstop. This Stripe-driven pricing UI is also
  // wrapped in `data-web-only` by the page, but that's a CSS gate; this is the
  // JS one. `native` (post-mount) blanks the render so no price/checkout DOM
  // survives on iOS even if the CSS regresses, and the synchronous
  // `isNativeApp()` check in the auto-open effect below stops a Stripe preview
  // call from firing before the hook flips. Mirrors the /checkout hardening.
  const native = useIsNativeApp();
  const [err, setErr] = useState<string | null>(null);
  const [upgradeModal, setUpgradeModal] = useState<UpgradeModalState | null>(null);
  const [downgradeModal, setDowngradeModal] = useState<DowngradeModalState | null>(null);
  const currentTier = entitlement?.tier ?? "free";
  const source = entitlement?.source ?? "free";
  const isPaid = source === "stripe";

  // Auto-open the proration modal when /pricing is hit with
  // `?upgrade=<tier>`. The /account Plan card sends paid coach users
  // here with `?upgrade=coach_ai` so the in-app upgrade path is one
  // click instead of two (account → pricing → click Coach Pro CTA).
  // Validated: the param tier must exist in the displayed tiers, must
  // be a paid tier the user doesn't already have, and must be a real
  // upgrade (not a downgrade — downgrades have their own modal). Fires
  // once on mount; we don't react to subsequent prop changes because
  // the URL param is a one-shot intent signal.
  useEffect(() => {
    if (typeof window === "undefined") return;
    // Never auto-open the upgrade modal (which fires a Stripe preview call) on
    // native — Guideline 3.1.1. Read synchronously, not via `native`, which
    // only flips after this mount effect has already run.
    if (isNativeApp()) return;
    if (!isAuthed || !isPaid) return;
    const params = new URLSearchParams(window.location.search);
    const target = params.get("upgrade");
    if (!target) return;
    const targetTier = target as SubscriptionTier;
    if (targetTier === "free") return;
    if (targetTier === currentTier) return;
    if (TIER_RANK[targetTier] <= TIER_RANK[currentTier]) return;
    const tierDef = tiers.find((t) => t.id === targetTier);
    if (!tierDef) return;
    // Strip the param so refresh doesn't reopen the modal endlessly.
    params.delete("upgrade");
    const qs = params.toString();
    window.history.replaceState(
      null,
      "",
      window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash,
    );
    openUpgradeModal(tierDef);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      // Hard reload to pick up the new entitlement everywhere. Land on /home
      // with the welcome marker so first-time Coach Pro upgrades get the
      // celebration dialog + Cal-starter-prompts experience (the marker is
      // server-validated against actual entitlement so paste-the-URL won't
      // trigger it). Non-Pro upgrades (e.g. coach → coach with new interval)
      // land on /home without the marker — same destination, just no party.
      const dest =
        targetTier === "coach_ai"
          ? "/home?welcome=coach_pro"
          : "/home";
      window.location.href = dest;
    })();
  }

  function openDowngradeModal(t: TierDef) {
    const targetTier = t.id;
    setErr(null);
    setDowngradeModal({
      targetTier,
      targetName: t.name,
      targetInterval: interval,
      currentName: null,
      effectiveAt: null,
      loadingPreview: true,
      confirming: false,
      error: null,
    });
    track({
      event: "checkout_started",
      target: t.id,
      metadata: { interval, tier: t.id, flow: "downgrade" },
    });
    void (async () => {
      const res = await previewSubscriptionDowngradeAction({ targetTier });
      setDowngradeModal((cur) => {
        if (!cur || cur.targetTier !== targetTier) return cur;
        if (!res.ok) return { ...cur, loadingPreview: false, error: res.error };
        return {
          ...cur,
          loadingPreview: false,
          currentName: res.currentName,
          effectiveAt: res.effectiveAt,
        };
      });
    })();
  }

  function confirmDowngrade() {
    if (!downgradeModal) return;
    const { targetTier, targetInterval } = downgradeModal;
    setDowngradeModal((cur) => (cur ? { ...cur, confirming: true, error: null } : cur));
    void (async () => {
      const res = await scheduleSubscriptionDowngradeAction({ targetTier, targetInterval });
      if (!res.ok) {
        setDowngradeModal((cur) =>
          cur ? { ...cur, confirming: false, error: res.error } : cur,
        );
        return;
      }
      window.location.href = "/account?downgrade=scheduled";
    })();
  }

  function choose(t: TierDef) {
    setErr(null);
    if (!isAuthed) {
      window.location.href = "/login?mode=signup";
      return;
    }
    // Free-tier button when the user is on a paid plan means "downgrade
    // to free at period end" — schedule a cancel_at_period_end via
    // the new flow instead of routing to the portal.
    if (t.id === "free") {
      if (isPaid) {
        openDowngradeModal(t);
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
    // Existing paid customer moving between paid tiers. Upgrades go
    // through the in-place proration flow; downgrades are scheduled to
    // take effect at the end of the current billing period via a Stripe
    // subscription schedule.
    if (isPaid && t.id !== currentTier) {
      if (TIER_RANK[t.id] > TIER_RANK[currentTier]) {
        openUpgradeModal(t);
      } else {
        openDowngradeModal(t);
      }
      return;
    }
    // Telemetry: record the click so the engagement funnel can show
    // pricing → checkout dropoff. Fired before navigation so we still
    // capture intent even if the next page errors. The actual Stripe
    // checkout session is created on /checkout via embedded mode.
    track({
      event: "checkout_started",
      target: t.id,
      metadata: { interval, tier: t.id },
    });
    router.push(`/checkout?tier=${t.id}&interval=${interval}`);
  }

  // On native, render nothing: the page mounts a `data-native-only`
  // NativeIapPanel (StoreKit IAP / neutral notice) alongside this component, so
  // blanking here leaves the App-Store-safe surface and no Stripe price/CTA.
  if (native) return null;

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
                <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
                  {t.name}
                  {isProTier && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary ring-1 ring-primary/30">
                      <Sparkles className="size-3" />
                      AI
                    </span>
                  )}
                </h2>
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

              {t.limitNote ? (
                <p className="-mt-3 mb-5 text-xs text-muted">{t.limitNote}</p>
              ) : null}

              <ul className="mb-3 space-y-2 text-sm">
                {t.features.map((f) => {
                  const text = typeof f === "string" ? f : f.text;
                  const bold = typeof f === "string" ? false : !!f.bold;
                  return (
                    <li key={text} className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                      <span className={cn("text-foreground", bold && "font-semibold")}>{text}</span>
                    </li>
                  );
                })}
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
                  // Paid users moving up a tier don't get Stripe trials —
                  // the upgrade flow charges proration today. Don't show
                  // the "Start X-day free trial" label (which is t.cta for
                  // Coach Pro), since clicking it actually opens the
                  // proration preview, not a trial.
                  const isPaidUpgrade =
                    isPaid && t.id !== "free" && TIER_RANK[t.id] > TIER_RANK[currentTier];
                  // Free user who already used the Coach Pro trial:
                  // Stripe will refuse a second trial and bill them in
                  // full at checkout. Replace the trial CTA with
                  // "Subscribe" so we don't promise a free window.
                  const isTrialUsedSubscribe =
                    !isPaid && isProTier && coachProTrialUsed;
                  const label = isPaidDowngrade
                    ? `Downgrade to ${t.name}`
                    : isPaidUpgrade
                      ? `Upgrade to ${t.name}`
                      : isTrialUsedSubscribe
                        ? `Subscribe to ${t.name}`
                        : t.cta;
                  // Trial copy only applies to first-time subscribers
                  // who haven't already burned the eligibility.
                  const showTrialNote = isProTier && !isPaid && !coachProTrialUsed;
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

      <LeagueOperatorCallout />

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
      <DowngradeConfirmModal
        state={downgradeModal}
        onClose={() => setDowngradeModal(null)}
        onConfirm={confirmDowngrade}
      />
    </div>
  );
}

function formatDateLong(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function DowngradeConfirmModal({
  state,
  onClose,
  onConfirm,
}: {
  state: DowngradeModalState | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const open = state !== null;
  const date = formatDateLong(state?.effectiveAt ?? null);
  const isFree = state?.targetTier === "free";
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        state
          ? isFree
            ? "Cancel paid plan?"
            : `Switch to ${state.targetName}?`
          : "Downgrade"
      }
      footer={
        state ? (
          <>
            <button
              type="button"
              onClick={onClose}
              disabled={state.confirming}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-surface disabled:opacity-60"
            >
              Keep current plan
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={state.confirming || state.loadingPreview || !state.effectiveAt}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50"
            >
              {state.confirming
                ? "Scheduling…"
                : isFree
                  ? "Cancel at period end"
                  : "Confirm downgrade"}
            </button>
          </>
        ) : null
      }
    >
      {state?.loadingPreview ? (
        <p className="text-sm text-muted">Checking your billing period…</p>
      ) : state?.error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-900 ring-1 ring-red-200">
          {state.error}
        </p>
      ) : state?.effectiveAt ? (
        <div className="space-y-3 text-sm">
          <p className="text-foreground">
            {isFree ? (
              <>
                Your{" "}
                <span className="font-semibold">{state.currentName}</span> plan
                will continue until <span className="font-semibold">{date}</span>
                . After that, you&rsquo;ll move to the free plan with no further
                charges. You can reverse this from your account page before then.
              </>
            ) : (
              <>
                Your <span className="font-semibold">{state.currentName}</span>{" "}
                plan continues until <span className="font-semibold">{date}</span>
                . On that date, your subscription switches to{" "}
                <span className="font-semibold">{state.targetName}</span> at the
                new rate. No refund or change today.
              </>
            )}
          </p>
          <p className="text-xs text-muted">
            You won&rsquo;t lose access to anything you&rsquo;ve paid for
            through the rest of this period.
          </p>
        </div>
      ) : null}
    </Modal>
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

// Lead-gen callout for the league-operator platform. Sits below the
// self-serve coach tiers as a third option whose pricing is "contact us".
// The CTA deep-links to /contact?topic=league, which posts to /api/contact
// — the same path as the feedback widget — so each inquiry lands in the
// admin Feedback tab AND fires an immediate in-production admin
// notification. Web-only by virtue of living inside PricingClient, which
// renders nothing on native.
function LeagueOperatorCallout() {
  const features = [
    {
      icon: ClipboardList,
      title: "Player registration",
      body: "Online signups and rosters across every team in your league.",
    },
    {
      icon: Layers,
      title: "Multi-sport management",
      body: "Run multiple sports and seasons side by side from one account.",
    },
    {
      icon: Megaphone,
      title: "League-wide announcements",
      body: "Reach every coach, player, and parent with a single message.",
    },
  ];
  return (
    <div className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/[0.06] to-transparent p-6 sm:p-8">
      <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div className="max-w-2xl">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-primary ring-1 ring-primary/30">
              <Trophy className="size-3" />
              For leagues &amp; organizations
            </span>
          </div>
          <h2 className="mt-3 text-xl font-bold tracking-tight text-foreground">
            Running a whole league?
          </h2>
          <p className="mt-1.5 text-sm text-muted">
            XO Gridmaker for league operators brings every team, sport, and
            season onto one platform. Contact us for pricing and more
            information.
          </p>
          <ul className="mt-5 grid gap-4 sm:grid-cols-3">
            {features.map((f) => (
              <li key={f.title} className="flex flex-col gap-1.5">
                <f.icon className="size-5 text-primary" />
                <span className="text-sm font-semibold text-foreground">
                  {f.title}
                </span>
                <span className="text-xs text-muted">{f.body}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="shrink-0 md:text-right">
          <p className="text-2xl font-extrabold tracking-tight text-foreground">
            Custom pricing
          </p>
          <p className="mb-4 text-xs text-muted">Tailored to your league&rsquo;s size</p>
          <Link
            href="/contact?topic=league"
            onClick={() =>
              track({
                event: "checkout_started",
                target: "league_ops",
                metadata: { flow: "league_interest" },
              })
            }
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white hover:bg-primary-hover md:w-auto"
          >
            Contact us for pricing
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}

// `showCoachAi` prop kept on the call site for future re-introduction
// of the Coach Cal message-pack block; not consumed today (2026-05-27).
function AddOnsDisclosure(_props: { showCoachAi: boolean }) {
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
            {/* Coach Cal message packs hidden 2026-05-27 — bring back
                when the add-on UX is ready to be re-promoted. */}
          </dl>
        </div>
      ) : null}
    </div>
  );
}

