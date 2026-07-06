"use client";

import { useState, useTransition } from "react";
import { Button, useToast } from "@/components/ui";
import { setHideLobbyAnimationAction } from "@/app/actions/admin-lobby";
import { setExamplesPageEnabledAction } from "@/app/actions/admin-examples";
import { setFreeMaxPlaysPerPlaybookAction } from "@/app/actions/admin-free-plays";
import { setMobileEditingEnabledAction } from "@/app/actions/admin-mobile-editing";
import { setHideOwnerInfoAboutAction } from "@/app/actions/admin-about";
import { setReferralConfigAction } from "@/app/actions/admin-referral";
import { setCoachCalUpgradeBannerEnabledAction } from "@/app/actions/admin-coach-cal-banner";
import { setCoachCalVersionAction } from "@/app/actions/admin-coach-cal-version";
import { setCoachAiEvalDaysAction } from "@/app/actions/admin-coach-ai-eval";
import { setCoachCalFreePromptAllowanceAction } from "@/app/actions/admin-coach-cal-free-prompts";
import {
  setSuggestReviewsAction,
  resetRatingPromptForSelfAction,
} from "@/app/actions/admin-review-prompt";
import type { SuggestReviews } from "@/lib/site/review-prompt-config";
import {
  COACH_AI_EVAL_DAYS_MIN,
  COACH_AI_EVAL_DAYS_MAX,
} from "@/lib/site/coach-ai-eval-config";
import {
  COACH_CAL_FREE_PROMPT_ALLOWANCE_MIN,
  COACH_CAL_FREE_PROMPT_ALLOWANCE_MAX,
} from "@/lib/site/coach-cal-free-prompts-config";
import {
  setAppleSigninEnabledAction,
  setGoogleSigninEnabledAction,
} from "@/app/actions/admin-auth-providers";
import type { ReferralConfig } from "@/lib/site/referral-config";

export function SiteSettingsAdminClient({
  initialHideLobbyAnimation,
  initialExamplesPageEnabled,
  initialFreeMaxPlays,
  initialMobileEditingEnabled,
  initialHideOwnerInfoAbout,
  initialReferralConfig,
  initialAppleSigninEnabled,
  initialGoogleSigninEnabled,
  initialCoachCalUpgradeBannerEnabled,
  initialCoachCalVersion,
  initialCoachAiEvalDays,
  initialCoachCalFreePromptAllowance,
  initialSuggestReviews,
}: {
  initialHideLobbyAnimation: boolean;
  initialExamplesPageEnabled: boolean;
  initialFreeMaxPlays: number;
  initialMobileEditingEnabled: boolean;
  initialHideOwnerInfoAbout: boolean;
  initialReferralConfig: ReferralConfig;
  initialAppleSigninEnabled: boolean;
  initialGoogleSigninEnabled: boolean;
  initialCoachCalUpgradeBannerEnabled: boolean;
  initialCoachCalVersion: "v1" | "v2";
  initialCoachAiEvalDays: number;
  initialCoachCalFreePromptAllowance: number;
  initialSuggestReviews: SuggestReviews;
}) {
  const { toast } = useToast();

  const [hideLobbyAnimation, setHideLobbyAnimation] = useState(initialHideLobbyAnimation);
  const [lobbyPending, startLobbyTransition] = useTransition();

  const [examplesEnabled, setExamplesEnabled] = useState(initialExamplesPageEnabled);
  const [examplesPending, startExamplesTransition] = useTransition();

  const [mobileEditingEnabled, setMobileEditingEnabled] = useState(initialMobileEditingEnabled);
  const [mobileEditingPending, startMobileEditingTransition] = useTransition();

  const [hideOwnerInfoAbout, setHideOwnerInfoAbout] = useState(initialHideOwnerInfoAbout);
  const [hideOwnerPending, startHideOwnerTransition] = useTransition();

  const [appleSigninEnabled, setAppleSigninEnabled] = useState(initialAppleSigninEnabled);
  const [applePending, startAppleTransition] = useTransition();
  const [googleSigninEnabled, setGoogleSigninEnabled] = useState(initialGoogleSigninEnabled);
  const [googlePending, startGoogleTransition] = useTransition();

  const [coachCalBannerEnabled, setCoachCalBannerEnabled] = useState(
    initialCoachCalUpgradeBannerEnabled,
  );
  const [coachCalBannerPending, startCoachCalBannerTransition] = useTransition();

  const [coachCalVersion, setCoachCalVersion] = useState<"v1" | "v2">(initialCoachCalVersion);
  const [coachCalVersionPending, startCoachCalVersionTransition] = useTransition();

  const [savedEvalDays, setSavedEvalDays] = useState(initialCoachAiEvalDays);
  const [evalDaysInput, setEvalDaysInput] = useState(String(initialCoachAiEvalDays));
  const [evalDaysPending, startEvalDaysTransition] = useTransition();

  const [savedFreePrompts, setSavedFreePrompts] = useState(
    initialCoachCalFreePromptAllowance,
  );
  const [freePromptsInput, setFreePromptsInput] = useState(
    String(initialCoachCalFreePromptAllowance),
  );
  const [freePromptsPending, startFreePromptsTransition] = useTransition();

  const [suggestReviews, setSuggestReviews] = useState<SuggestReviews>(initialSuggestReviews);
  const [suggestReviewsPending, startSuggestReviewsTransition] = useTransition();
  const [resetPending, startResetTransition] = useTransition();

  function saveEvalDays() {
    const next = Number(evalDaysInput);
    if (
      !Number.isFinite(next) ||
      next < COACH_AI_EVAL_DAYS_MIN ||
      next > COACH_AI_EVAL_DAYS_MAX
    ) {
      toast(
        `Enter a number between ${COACH_AI_EVAL_DAYS_MIN} and ${COACH_AI_EVAL_DAYS_MAX}.`,
        "error",
      );
      setEvalDaysInput(String(savedEvalDays));
      return;
    }
    const rounded = Math.floor(next);
    if (rounded === savedEvalDays) return;
    startEvalDaysTransition(async () => {
      const res = await setCoachAiEvalDaysAction(rounded);
      if (!res.ok) {
        toast(res.error, "error");
        setEvalDaysInput(String(savedEvalDays));
        return;
      }
      setSavedEvalDays(res.value);
      setEvalDaysInput(String(res.value));
      toast(
        `Coach Cal eval window set to ${res.value} day${res.value === 1 ? "" : "s"}. Existing evaluators keep the window they signed up with.`,
        "success",
      );
    });
  }

  function saveFreePrompts() {
    const next = Number(freePromptsInput);
    if (
      !Number.isFinite(next) ||
      next < COACH_CAL_FREE_PROMPT_ALLOWANCE_MIN ||
      next > COACH_CAL_FREE_PROMPT_ALLOWANCE_MAX
    ) {
      toast(
        `Enter a number between ${COACH_CAL_FREE_PROMPT_ALLOWANCE_MIN} and ${COACH_CAL_FREE_PROMPT_ALLOWANCE_MAX}.`,
        "error",
      );
      setFreePromptsInput(String(savedFreePrompts));
      return;
    }
    const rounded = Math.floor(next);
    if (rounded === savedFreePrompts) return;
    startFreePromptsTransition(async () => {
      const res = await setCoachCalFreePromptAllowanceAction(rounded);
      if (!res.ok) {
        toast(res.error, "error");
        setFreePromptsInput(String(savedFreePrompts));
        return;
      }
      setSavedFreePrompts(res.value);
      setFreePromptsInput(String(res.value));
      toast(
        `Free Coach Cal prompts set to ${res.value}. Applies to free users who haven't used theirs up yet.`,
        "success",
      );
    });
  }

  function toggleCoachCalBanner(next: boolean) {
    const prev = coachCalBannerEnabled;
    setCoachCalBannerEnabled(next);
    startCoachCalBannerTransition(async () => {
      const res = await setCoachCalUpgradeBannerEnabledAction(next);
      if (!res.ok) {
        setCoachCalBannerEnabled(prev);
        toast(res.error, "error");
        return;
      }
      toast(
        next ? "Coach Cal upgrade banner is on." : "Coach Cal upgrade banner is off.",
        "success",
      );
    });
  }

  function switchCoachCalVersion(next: "v1" | "v2") {
    const prev = coachCalVersion;
    if (next === prev) return;
    setCoachCalVersion(next);
    startCoachCalVersionTransition(async () => {
      const res = await setCoachCalVersionAction(next);
      if (!res.ok) {
        setCoachCalVersion(prev);
        toast(res.error, "error");
        return;
      }
      toast(
        next === "v2"
          ? "Cal v2 active (full Phase 2 stack: provenance gate + rescue + server-side aliasing)."
          : "Cal v1 active (legacy behavior: no provenance gate, no rescue, no server-side aliasing).",
        "success",
      );
    });
  }

  function toggleAppleSignin(next: boolean) {
    const prev = appleSigninEnabled;
    setAppleSigninEnabled(next);
    startAppleTransition(async () => {
      const res = await setAppleSigninEnabledAction(next);
      if (!res.ok) {
        setAppleSigninEnabled(prev);
        toast(res.error, "error");
        return;
      }
      toast(next ? "Apple sign-in enabled." : "Apple sign-in disabled.", "success");
    });
  }

  function toggleGoogleSignin(next: boolean) {
    const prev = googleSigninEnabled;
    setGoogleSigninEnabled(next);
    startGoogleTransition(async () => {
      const res = await setGoogleSigninEnabledAction(next);
      if (!res.ok) {
        setGoogleSigninEnabled(prev);
        toast(res.error, "error");
        return;
      }
      toast(next ? "Google sign-in enabled." : "Google sign-in disabled.", "success");
    });
  }

  const [savedFreeMaxPlays, setSavedFreeMaxPlays] = useState(initialFreeMaxPlays);
  const [freeMaxPlaysInput, setFreeMaxPlaysInput] = useState(String(initialFreeMaxPlays));
  const [freeMaxPlaysPending, startFreeMaxPlaysTransition] = useTransition();

  // Referral rewards.
  const [referralEnabled, setReferralEnabled] = useState(initialReferralConfig.enabled);
  const [referralDaysInput, setReferralDaysInput] = useState(
    String(initialReferralConfig.daysPerAward),
  );
  const [recipientTrialInput, setRecipientTrialInput] = useState(
    String(initialReferralConfig.recipientTrialDays),
  );
  const [payerCreditAuto, setPayerCreditAuto] = useState(
    initialReferralConfig.payerCreditCents === null,
  );
  const [payerCreditInput, setPayerCreditInput] = useState(
    initialReferralConfig.payerCreditCents === null
      ? "9"
      : String(initialReferralConfig.payerCreditCents / 100),
  );
  const [capAwardsNoCap, setCapAwardsNoCap] = useState(
    initialReferralConfig.capAwards === null,
  );
  const [capAwardsInput, setCapAwardsInput] = useState(
    initialReferralConfig.capAwards === null
      ? "24"
      : String(initialReferralConfig.capAwards),
  );
  const [testEmailsInput, setTestEmailsInput] = useState(
    initialReferralConfig.testEmails.join("\n"),
  );
  const [savedReferral, setSavedReferral] = useState<ReferralConfig>(
    initialReferralConfig,
  );
  const [referralPending, startReferralTransition] = useTransition();
  const parseTestEmails = (raw: string): string[] => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const part of raw.split(/[\s,]+/)) {
      const e = part.trim().toLowerCase();
      if (e && e.includes("@") && !seen.has(e)) {
        seen.add(e);
        out.push(e);
      }
    }
    return out;
  };
  const referralDirty =
    referralEnabled !== savedReferral.enabled ||
    Number(referralDaysInput) !== savedReferral.daysPerAward ||
    Number(recipientTrialInput) !== savedReferral.recipientTrialDays ||
    (payerCreditAuto ? null : Math.round(Number(payerCreditInput) * 100)) !==
      savedReferral.payerCreditCents ||
    (capAwardsNoCap ? null : Number(capAwardsInput)) !== savedReferral.capAwards ||
    parseTestEmails(testEmailsInput).join(",") !==
      savedReferral.testEmails.join(",");

  function saveReferral() {
    const days = Number(referralDaysInput);
    if (!Number.isFinite(days) || days < 1 || days > 3650) {
      toast("Free-sender days must be between 1 and 3650.", "error");
      return;
    }
    const trial = Number(recipientTrialInput);
    if (!Number.isFinite(trial) || trial < 0 || trial > 3650) {
      toast("New-coach trial days must be between 0 and 3650.", "error");
      return;
    }
    let payerCents: number | null = null;
    if (!payerCreditAuto) {
      const d = Number(payerCreditInput);
      if (!Number.isFinite(d) || d < 0 || d > 1000) {
        toast("Payer credit must be $0–$1000, or check 'Auto'.", "error");
        return;
      }
      payerCents = Math.round(d * 100);
    }
    let capAwards: number | null = null;
    if (!capAwardsNoCap) {
      const c = Number(capAwardsInput);
      if (!Number.isFinite(c) || c < 1 || c > 100000) {
        toast("Referral cap must be 1–100000, or check 'No cap'.", "error");
        return;
      }
      capAwards = Math.floor(c);
    }
    const next: ReferralConfig = {
      enabled: referralEnabled,
      daysPerAward: Math.floor(days),
      // Legacy day-cap preserved as-is (superseded by the awards cap below).
      capDays: savedReferral.capDays,
      recipientTrialDays: Math.floor(trial),
      payerCreditCents: payerCents,
      capAwards,
      testEmails: parseTestEmails(testEmailsInput),
    };
    startReferralTransition(async () => {
      const res = await setReferralConfigAction(next);
      if (!res.ok) {
        toast(res.error, "error");
        return;
      }
      setSavedReferral(res.config);
      setReferralDaysInput(String(res.config.daysPerAward));
      setRecipientTrialInput(String(res.config.recipientTrialDays));
      setPayerCreditAuto(res.config.payerCreditCents === null);
      if (res.config.payerCreditCents !== null) {
        setPayerCreditInput(String(res.config.payerCreditCents / 100));
      }
      setCapAwardsNoCap(res.config.capAwards === null);
      if (res.config.capAwards !== null) {
        setCapAwardsInput(String(res.config.capAwards));
      }
      setTestEmailsInput(res.config.testEmails.join("\n"));
      toast("Referral rewards updated.", "success");
    });
  }

  function saveFreeMaxPlays() {
    const next = Number(freeMaxPlaysInput);
    if (!Number.isFinite(next) || next < 1 || next > 1000) {
      toast("Enter a number between 1 and 1000.", "error");
      setFreeMaxPlaysInput(String(savedFreeMaxPlays));
      return;
    }
    const rounded = Math.floor(next);
    if (rounded === savedFreeMaxPlays) return;
    startFreeMaxPlaysTransition(async () => {
      const res = await setFreeMaxPlaysPerPlaybookAction(rounded);
      if (!res.ok) {
        toast(res.error, "error");
        setFreeMaxPlaysInput(String(savedFreeMaxPlays));
        return;
      }
      setSavedFreeMaxPlays(res.value);
      setFreeMaxPlaysInput(String(res.value));
      toast(`Free-tier play cap set to ${res.value}.`, "success");
    });
  }

  function toggleLobbyAnimation(next: boolean) {
    const prev = hideLobbyAnimation;
    setHideLobbyAnimation(next);
    startLobbyTransition(async () => {
      const res = await setHideLobbyAnimationAction(next);
      if (!res.ok) {
        setHideLobbyAnimation(prev);
        toast(res.error, "error");
        return;
      }
      toast(
        next ? "Lobby animation hidden." : "Lobby animation restored.",
        "success",
      );
    });
  }

  function toggleMobileEditing(next: boolean) {
    const prev = mobileEditingEnabled;
    setMobileEditingEnabled(next);
    startMobileEditingTransition(async () => {
      const res = await setMobileEditingEnabledAction(next);
      if (!res.ok) {
        setMobileEditingEnabled(prev);
        toast(res.error, "error");
        return;
      }
      toast(
        next ? "Mobile play editing enabled." : "Mobile play editing disabled.",
        "success",
      );
    });
  }

  function toggleHideOwnerInfoAbout(next: boolean) {
    const prev = hideOwnerInfoAbout;
    setHideOwnerInfoAbout(next);
    startHideOwnerTransition(async () => {
      const res = await setHideOwnerInfoAboutAction(next);
      if (!res.ok) {
        setHideOwnerInfoAbout(prev);
        toast(res.error, "error");
        return;
      }
      toast(
        next ? "Owner info hidden on About page." : "Owner info shown on About page.",
        "success",
      );
    });
  }

  function resetRatingPrompt() {
    startResetTransition(async () => {
      const res = await resetRatingPromptForSelfAction();
      if (!res.ok) {
        toast(res.error, "error");
        return;
      }
      try {
        localStorage.removeItem("playgrid:rating-nudge-shown");
      } catch {
        // ignore
      }
      toast("Rating prompt state cleared — triggers and cooldown reset.", "success");
    });
  }

  function switchSuggestReviews(next: SuggestReviews) {
    const prev = suggestReviews;
    if (next === prev) return;
    setSuggestReviews(next);
    startSuggestReviewsTransition(async () => {
      const res = await setSuggestReviewsAction(next);
      if (!res.ok) {
        setSuggestReviews(prev);
        toast(res.error, "error");
        return;
      }
      const label =
        next === "everyone"
          ? "everyone"
          : next === "only_admins"
            ? "admins only"
            : "off";
      toast(`App Store rating nudge: ${label}.`, "success");
    });
  }

  function toggleExamplesEnabled(next: boolean) {
    const prev = examplesEnabled;
    setExamplesEnabled(next);
    startExamplesTransition(async () => {
      const res = await setExamplesPageEnabledAction(next);
      if (!res.ok) {
        setExamplesEnabled(prev);
        toast(res.error, "error");
        return;
      }
      toast(
        next ? "Examples page is live." : "Examples page is off.",
        "success",
      );
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface-raised p-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">Suggest reviews</p>
          <p className="mt-0.5 text-xs text-muted">
            Who sees the in-app App Store rating nudge after hitting an
            engagement milestone (saved a Cal play, 3rd play created, 2nd share,
            first print). Set to <strong>Admins only</strong> while validating,
            then switch to <strong>Everyone</strong> to roll out broadly.{" "}
            <button
              type="button"
              onClick={resetRatingPrompt}
              disabled={resetPending}
              className="underline decoration-dotted underline-offset-2 hover:text-foreground disabled:opacity-50"
            >
              {resetPending ? "Resetting…" : "Reset my state"}
            </button>
          </p>
        </div>
        <div className="inline-flex items-center gap-1 self-start rounded-lg bg-surface p-1 ring-1 ring-border sm:self-auto">
          {(["everyone", "only_admins", "off"] as const).map((opt) => (
            <button
              key={opt}
              type="button"
              className={`rounded-md px-3 py-1 text-sm transition-colors ${
                suggestReviews === opt
                  ? "bg-primary text-primary-foreground"
                  : "text-muted hover:text-foreground"
              }`}
              disabled={suggestReviewsPending}
              onClick={() => switchSuggestReviews(opt)}
            >
              {opt === "everyone"
                ? "Everyone"
                : opt === "only_admins"
                  ? "Admins only"
                  : "Off"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface-raised p-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">
            Coach Cal version
          </p>
          <p className="mt-0.5 text-xs text-muted">
            <strong>v2 (default):</strong> full Phase 2 stack — provenance gate
            rejects hand-authored fences, rescue substitutes tool output on retry
            failure, server-side label aliases applied in compose_play /
            compose_defense / place_defense.{" "}
            <strong>v1 (fallback):</strong> legacy pre-Phase-2 behavior — none of
            the above. Flip to v1 instantly if v2 misbehaves; catalog fixes
            (Snag-in-5v5, QB-carry route_kind, Seam drift, etc.) still apply in
            both versions because they're bug fixes, not behavior changes.
          </p>
        </div>
        <div className="inline-flex items-center gap-1 self-start rounded-lg bg-surface p-1 ring-1 ring-border sm:self-auto">
          <button
            type="button"
            className={`rounded-md px-3 py-1 text-sm transition-colors ${
              coachCalVersion === "v2"
                ? "bg-primary text-primary-foreground"
                : "text-muted hover:text-foreground"
            }`}
            disabled={coachCalVersionPending}
            onClick={() => switchCoachCalVersion("v2")}
          >
            v2
          </button>
          <button
            type="button"
            className={`rounded-md px-3 py-1 text-sm transition-colors ${
              coachCalVersion === "v1"
                ? "bg-primary text-primary-foreground"
                : "text-muted hover:text-foreground"
            }`}
            disabled={coachCalVersionPending}
            onClick={() => switchCoachCalVersion("v1")}
          >
            v1
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface-raised p-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">
            Coach Cal upgrade banner
          </p>
          <p className="mt-0.5 text-xs text-muted">
            When on, entitled users see a maintenance notice at the top of
            the Coach Cal chat window letting them know Cal is being
            actively improved and may behave unusually.
          </p>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={coachCalBannerEnabled}
            disabled={coachCalBannerPending}
            onChange={(e) => toggleCoachCalBanner(e.target.checked)}
          />
          <span>{coachCalBannerEnabled ? "On" : "Off"}</span>
        </label>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface-raised p-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">
            Coach Cal eval window
          </p>
          <p className="mt-0.5 text-xs text-muted">
            Length of the free trial offered to new Coach Pro subscribers,
            in days. Drives the Stripe checkout trial and every marketing
            surface that mentions the trial (pricing, coach-cal landing,
            FAQ, header preview, in-app upsells). Default is 7. Existing
            evaluators are unaffected — Stripe locks in their end date at
            sign-up.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={COACH_AI_EVAL_DAYS_MIN}
            max={COACH_AI_EVAL_DAYS_MAX}
            step={1}
            className="w-20 rounded-md bg-surface px-3 py-1.5 text-sm ring-1 ring-border"
            value={evalDaysInput}
            disabled={evalDaysPending}
            onChange={(e) => setEvalDaysInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveEvalDays();
            }}
          />
          <Button
            variant="secondary"
            size="sm"
            loading={evalDaysPending}
            disabled={
              evalDaysPending ||
              evalDaysInput.trim() === "" ||
              Number(evalDaysInput) === savedEvalDays
            }
            onClick={saveEvalDays}
          >
            Save
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface-raised p-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">
            Free Coach Cal prompts
          </p>
          <p className="mt-0.5 text-xs text-muted">
            How many real Coach Cal prompts a free (non-subscribed) user gets
            before the paywall — a lifetime allowance per account. Only
            successful turns count; a Cal error never burns a prompt. Cost caps
            still bound spend. Set to 0 to disable the free trial entirely.
            Default is 5.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={COACH_CAL_FREE_PROMPT_ALLOWANCE_MIN}
            max={COACH_CAL_FREE_PROMPT_ALLOWANCE_MAX}
            step={1}
            className="w-20 rounded-md bg-surface px-3 py-1.5 text-sm ring-1 ring-border"
            value={freePromptsInput}
            disabled={freePromptsPending}
            onChange={(e) => setFreePromptsInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveFreePrompts();
            }}
          />
          <Button
            variant="secondary"
            size="sm"
            loading={freePromptsPending}
            disabled={
              freePromptsPending ||
              freePromptsInput.trim() === "" ||
              Number(freePromptsInput) === savedFreePrompts
            }
            onClick={saveFreePrompts}
          >
            Save
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface-raised p-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">
            Free-tier plays per playbook
          </p>
          <p className="mt-0.5 text-xs text-muted">
            The max number of plays a free account can create in a single
            playbook. Drives enforcement, the playbook upgrade notice, the
            pricing table, and the FAQ copy. Default is 16.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            max={1000}
            step={1}
            className="w-20 rounded-md bg-surface px-3 py-1.5 text-sm ring-1 ring-border"
            value={freeMaxPlaysInput}
            disabled={freeMaxPlaysPending}
            onChange={(e) => setFreeMaxPlaysInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveFreeMaxPlays();
            }}
          />
          <Button
            variant="secondary"
            size="sm"
            loading={freeMaxPlaysPending}
            disabled={
              freeMaxPlaysPending ||
              freeMaxPlaysInput.trim() === "" ||
              Number(freeMaxPlaysInput) === savedFreeMaxPlays
            }
            onClick={saveFreeMaxPlays}
          >
            Save
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface-raised p-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">
            Hide playbook animation on lobby
          </p>
          <p className="mt-0.5 text-xs text-muted">
            When on, the Preview/Simple toggle is hidden and the lobby
            always renders the simple card view.
          </p>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={hideLobbyAnimation}
            disabled={lobbyPending}
            onChange={(e) => toggleLobbyAnimation(e.target.checked)}
          />
          <span>{hideLobbyAnimation ? "On" : "Off"}</span>
        </label>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface-raised p-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">
            Public examples page
          </p>
          <p className="mt-0.5 text-xs text-muted">
            When on, any playbook you&apos;ve marked as an example and
            published appears at <code className="font-mono">/examples</code>
            . Marking and publishing happen from each playbook&apos;s
            action menu.
          </p>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={examplesEnabled}
            disabled={examplesPending}
            onChange={(e) => toggleExamplesEnabled(e.target.checked)}
          />
          <span>{examplesEnabled ? "Live" : "Off"}</span>
        </label>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface-raised p-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">
            Mobile play editing
          </p>
          <p className="mt-0.5 text-xs text-muted">
            When off, the mobile &ldquo;Edit play&rdquo; button is hidden and
            the formation picker is read-only on small screens. Turn on once
            mobile editing is fixed.
          </p>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={mobileEditingEnabled}
            disabled={mobileEditingPending}
            onChange={(e) => toggleMobileEditing(e.target.checked)}
          />
          <span>{mobileEditingEnabled ? "On" : "Off"}</span>
        </label>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface-raised p-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">
            Continue with Google
          </p>
          <p className="mt-0.5 text-xs text-muted">
            Show the Google sign-in button on the login page. Requires the
            Google provider to be enabled in Supabase Auth → Providers with
            valid OAuth credentials. Off hides the button entirely.
          </p>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={googleSigninEnabled}
            disabled={googlePending}
            onChange={(e) => toggleGoogleSignin(e.target.checked)}
          />
          <span>{googleSigninEnabled ? "On" : "Off"}</span>
        </label>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface-raised p-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">
            Continue with Apple
          </p>
          <p className="mt-0.5 text-xs text-muted">
            Show the Apple sign-in button on the login page. Requires an
            Apple Developer Services ID + secret JWT wired into Supabase Auth
            → Providers (the JWT expires every 6 months). Apple is required
            by App Store Review Guideline 4.8 once the iOS app ships.
          </p>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={appleSigninEnabled}
            disabled={applePending}
            onChange={(e) => toggleAppleSignin(e.target.checked)}
          />
          <span>{appleSigninEnabled ? "On" : "Off"}</span>
        </label>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface-raised p-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">
            Hide owner info on About page
          </p>
          <p className="mt-0.5 text-xs text-muted">
            When on, the About page drops the owner&apos;s name, photo, and
            hometown and reads as written by the team behind the product.
          </p>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={hideOwnerInfoAbout}
            disabled={hideOwnerPending}
            onChange={(e) => toggleHideOwnerInfoAbout(e.target.checked)}
          />
          <span>{hideOwnerInfoAbout ? "On" : "Off"}</span>
        </label>
      </div>

      <div className="space-y-3 rounded-2xl border border-border bg-surface-raised p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">
              Referral rewards
            </p>
            <p className="mt-0.5 text-xs text-muted">
              When a coach refers a new user (via their share link, a copy
              link, or a team invite) and that user activates — builds a play
              or joins a team — the referrer is rewarded. Paying coaches get a
              Stripe credit toward their next invoice; free coaches get Team
              Coach days. The new coach gets a welcome trial. Off by default.
              Each new coach can only mint one reward.
            </p>
          </div>
          <label className="inline-flex shrink-0 cursor-pointer items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={referralEnabled}
              disabled={referralPending}
              onChange={(e) => setReferralEnabled(e.target.checked)}
            />
            <span>{referralEnabled ? "On" : "Off"}</span>
          </label>
        </div>

        <div className="flex flex-wrap items-end gap-4 border-t border-border pt-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted">
              Free-sender reward (days)
            </span>
            <input
              type="number"
              min={1}
              max={3650}
              step={1}
              className="w-24 rounded-md bg-surface px-3 py-1.5 text-sm ring-1 ring-border disabled:opacity-50"
              value={referralDaysInput}
              disabled={referralPending || !referralEnabled}
              onChange={(e) => setReferralDaysInput(e.target.value)}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted">
              Paying-sender credit ($)
            </span>
            <input
              type="number"
              min={0}
              max={1000}
              step={1}
              placeholder="Auto"
              className="w-24 rounded-md bg-surface px-3 py-1.5 text-sm ring-1 ring-border disabled:opacity-50"
              value={payerCreditInput}
              disabled={referralPending || !referralEnabled || payerCreditAuto}
              onChange={(e) => setPayerCreditInput(e.target.value)}
            />
          </label>

          <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={payerCreditAuto}
              disabled={referralPending || !referralEnabled}
              onChange={(e) => setPayerCreditAuto(e.target.checked)}
            />
            <span>Auto (1 mo)</span>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted">
              New-coach trial (days)
            </span>
            <input
              type="number"
              min={0}
              max={3650}
              step={1}
              className="w-24 rounded-md bg-surface px-3 py-1.5 text-sm ring-1 ring-border disabled:opacity-50"
              value={recipientTrialInput}
              disabled={referralPending || !referralEnabled}
              onChange={(e) => setRecipientTrialInput(e.target.value)}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted">
              Lifetime cap (referrals per sender)
            </span>
            <input
              type="number"
              min={1}
              max={100000}
              step={1}
              className="w-24 rounded-md bg-surface px-3 py-1.5 text-sm ring-1 ring-border disabled:opacity-50"
              value={capAwardsInput}
              disabled={referralPending || !referralEnabled || capAwardsNoCap}
              onChange={(e) => setCapAwardsInput(e.target.value)}
            />
          </label>

          <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={capAwardsNoCap}
              disabled={referralPending || !referralEnabled}
              onChange={(e) => setCapAwardsNoCap(e.target.checked)}
            />
            <span>No cap</span>
          </label>

          <Button
            variant="secondary"
            size="sm"
            loading={referralPending}
            disabled={referralPending || !referralDirty}
            onClick={saveReferral}
            className="ml-auto"
          >
            Save
          </Button>
        </div>

        <label className="flex flex-col gap-1 border-t border-border pt-3">
          <span className="text-xs font-medium text-muted">
            Test accounts (staged rollout)
          </span>
          <span className="text-[11px] text-muted/80">
            Emails, one per line. The program runs LIVE for just these accounts
            even while the toggle above is Off — use it to validate the real
            reward paths (comp days + the Stripe credit) before enabling for
            everyone. Leave empty for a normal launch.
          </span>
          <textarea
            rows={3}
            placeholder={"tester@example.com\ncoach@example.com"}
            className="mt-1 w-full max-w-md rounded-md bg-surface px-3 py-1.5 font-mono text-xs text-foreground ring-1 ring-border"
            value={testEmailsInput}
            disabled={referralPending}
            onChange={(e) => setTestEmailsInput(e.target.value)}
          />
        </label>
      </div>
    </div>
  );
}
