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
  const [referralCapNoCap, setReferralCapNoCap] = useState(
    initialReferralConfig.capDays === null,
  );
  const [referralCapInput, setReferralCapInput] = useState(
    initialReferralConfig.capDays === null
      ? "180"
      : String(initialReferralConfig.capDays),
  );
  const [savedReferral, setSavedReferral] = useState<ReferralConfig>(
    initialReferralConfig,
  );
  const [referralPending, startReferralTransition] = useTransition();
  const referralDirty =
    referralEnabled !== savedReferral.enabled ||
    Number(referralDaysInput) !== savedReferral.daysPerAward ||
    (referralCapNoCap ? null : Number(referralCapInput)) !== savedReferral.capDays;

  function saveReferral() {
    const days = Number(referralDaysInput);
    if (!Number.isFinite(days) || days < 1 || days > 3650) {
      toast("Days per award must be between 1 and 3650.", "error");
      return;
    }
    let cap: number | null = null;
    if (!referralCapNoCap) {
      const c = Number(referralCapInput);
      if (!Number.isFinite(c) || c < 1 || c > 3650) {
        toast("Cap must be between 1 and 3650, or check 'No cap'.", "error");
        return;
      }
      cap = Math.floor(c);
    }
    const next: ReferralConfig = {
      enabled: referralEnabled,
      daysPerAward: Math.floor(days),
      capDays: cap,
    };
    startReferralTransition(async () => {
      const res = await setReferralConfigAction(next);
      if (!res.ok) {
        toast(res.error, "error");
        return;
      }
      setSavedReferral(res.config);
      setReferralDaysInput(String(res.config.daysPerAward));
      if (res.config.capDays !== null) {
        setReferralCapInput(String(res.config.capDays));
      }
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
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface-raised p-4">
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

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface-raised p-4">
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

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface-raised p-4">
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

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface-raised p-4">
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

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface-raised p-4">
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

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface-raised p-4">
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

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface-raised p-4">
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

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface-raised p-4">
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
              When a coach sends a copy of their playbook and a brand-new
              user (zero owned playbooks) claims it, the sender earns Team
              Coach days as a thank-you. Off by default. Same recipient
              can only mint one reward; awards stack by extending the
              sender&rsquo;s active referral grant.
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
              Days per award
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
              Lifetime cap (days per sender)
            </span>
            <input
              type="number"
              min={1}
              max={3650}
              step={1}
              className="w-24 rounded-md bg-surface px-3 py-1.5 text-sm ring-1 ring-border disabled:opacity-50"
              value={referralCapInput}
              disabled={referralPending || !referralEnabled || referralCapNoCap}
              onChange={(e) => setReferralCapInput(e.target.value)}
            />
          </label>

          <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={referralCapNoCap}
              disabled={referralPending || !referralEnabled}
              onChange={(e) => setReferralCapNoCap(e.target.checked)}
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
      </div>
    </div>
  );
}
