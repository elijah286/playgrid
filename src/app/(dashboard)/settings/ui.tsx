"use client";

import { useEffect, useRef, useState } from "react";
import {
  BarChart3,
  Brain,
  Check,
  CreditCard,
  DollarSign,
  FlaskConical,
  KeyRound,
  Menu as MenuIcon,
  MessageCircle,
  Settings as SettingsIcon,
  Sparkles,
  Ticket,
  Users,
} from "lucide-react";
import { UsersAdminClient, type AdminUserRow } from "@/features/admin/UsersAdminClient";
import { OpenAISettingsClient } from "@/features/admin/OpenAISettingsClient";
import { ClaudeSettingsClient } from "@/features/admin/ClaudeSettingsClient";
import { LlmProviderToggleClient } from "@/features/admin/LlmProviderToggleClient";
import { RagEmbeddingsAdminClient } from "@/features/admin/RagEmbeddingsAdminClient";
import type { LlmProvider } from "@/lib/site/llm-provider";
import { ResendSettingsClient } from "@/features/admin/ResendSettingsClient";
import { GoogleMapsSettingsClient } from "@/features/admin/GoogleMapsSettingsClient";
import { MaxMindSettingsClient } from "@/features/admin/MaxMindSettingsClient";
import { FeedbackAdminClient } from "@/features/admin/FeedbackAdminClient";
import { CoachAiFeedbackTabs } from "@/features/admin/CoachAiFeedbackTabs";
import type { KbMissRow } from "@/app/actions/coach-ai-feedback";
import { CoachInvitationsAdminClient } from "@/features/admin/CoachInvitationsAdminClient";
import { BillingAdminClient } from "@/features/admin/BillingAdminClient";
import { TrafficAdminClient } from "@/features/admin/TrafficAdminClient";
import { ActivationAdminClient } from "@/features/admin/ActivationAdminClient";
import { AnalyticsExclusionsAdminClient } from "@/features/admin/AnalyticsExclusionsAdminClient";
import { SiteSettingsAdminClient } from "@/features/admin/SiteSettingsAdminClient";
import { CoachSeatsAdminClient } from "@/features/admin/CoachSeatsAdminClient";
import type { SeatDefaults } from "@/lib/site/seat-defaults-config";
import type { CoachCalPackConfig } from "@/lib/site/coach-cal-pack-config";
import type { ReferralConfig } from "@/lib/site/referral-config";
import type { CoachBonusRow } from "@/app/actions/admin-seat-config";
import { PlaybookSeedsAdminClient } from "@/features/admin/PlaybookSeedsAdminClient";
import { BetaFeaturesAdminClient } from "@/features/admin/BetaFeaturesAdminClient";
import { OpexAdminClient } from "@/features/admin/OpexAdminClient";
import type { OpexService, OpexEntry } from "@/app/actions/admin-opex";
import type { BetaFeatures } from "@/lib/site/beta-features-config";
import type { SavedFormation } from "@/app/actions/formations";
import type { FeedbackRow } from "@/app/actions/feedback";
import type { CoachInvitationRow } from "@/app/actions/coach-invitations";
import type { GiftCodeRow } from "@/app/actions/admin-billing";
import type { StripeConfigStatus } from "@/lib/site/stripe-config";
import type { TrafficSummary } from "@/app/actions/admin-traffic";
import type { MonetizationSummary } from "@/app/actions/admin-activation";
import { SegmentedControl } from "@/components/ui";
import { cn } from "@/lib/utils";

type IntegrationProps =
  | { ok: true; configured: boolean; statusLabel: string; updatedAt: string | null }
  | { ok: false; error: string };

type ClaudeProps =
  | {
      ok: true;
      configured: boolean;
      statusLabel: string;
      provider: LlmProvider;
      updatedAt: string | null;
    }
  | { ok: false; error: string };

type ResendProps =
  | {
      ok: true;
      configured: boolean;
      statusLabel: string;
      fromEmail: string | null;
      contactToEmail: string | null;
      updatedAt: string | null;
    }
  | { ok: false; error: string };

type GoogleMapsProps =
  | { ok: true; configured: boolean; statusLabel: string; updatedAt: string | null }
  | { ok: false; error: string };

type MaxMindProps =
  | { ok: true; configured: boolean; statusLabel: string; downloadedAt: string | null }
  | { ok: false; error: string };

type AdminKeyProps = { configured: boolean; statusLabel: string };

type Tab =
  | "users"
  | "analytics"
  | "invites"
  | "payments"
  | "integrations"
  | "feedback"
  | "ai_feedback"
  | "seeds"
  | "beta"
  | "opex"
  | "site";

export function SettingsClient({
  currentUserId,
  initialUsers,
  usersError,
  integration,
  claude,
  resend,
  googleMaps,
  maxmind,
  initialFeedback,
  feedbackError,
  initialFeedbackWidgetEnabled,
  initialFeedbackWidgetTouchEnabled,
  initialInvites,
  invitesError,
  initialGiftCodes,
  giftCodesError,
  stripeStatus,
  initialCoachAiEnabled,
  initialHideLobbyAnimation,
  initialExamplesPageEnabled,
  initialFreeMaxPlays,
  initialMobileEditingEnabled,
  initialTrafficSummary,
  trafficError,
  initialActivationSummary,
  activationError,
  initialSeeds,
  initialBetaFeatures,
  initialHideOwnerInfoAbout,
  initialAppleSigninEnabled,
  initialGoogleSigninEnabled,
  initialCoachAiKbMisses,
  coachAiKbMissesError,
  initialOpexServices,
  initialOpexEntries,
  initialOpexPeriod,
  opexError,
  anthropicAdminKey,
  openaiAdminKey,
  initialSeatDefaults,
  initialCoachBonusRows,
  initialCoachCalPack,
  initialReferralConfig,
  initialExcludedEmails,
}: {
  currentUserId: string;
  initialUsers: AdminUserRow[];
  usersError: string | null;
  integration: IntegrationProps;
  claude: ClaudeProps;
  resend: ResendProps;
  googleMaps: GoogleMapsProps;
  maxmind: MaxMindProps;
  initialFeedback: FeedbackRow[];
  feedbackError: string | null;
  initialFeedbackWidgetEnabled: boolean;
  initialFeedbackWidgetTouchEnabled: boolean;
  initialInvites: CoachInvitationRow[];
  invitesError: string | null;
  initialGiftCodes: GiftCodeRow[];
  giftCodesError: string | null;
  stripeStatus: StripeConfigStatus;
  initialCoachAiEnabled: boolean;
  initialHideLobbyAnimation: boolean;
  initialExamplesPageEnabled: boolean;
  initialFreeMaxPlays: number;
  initialMobileEditingEnabled: boolean;
  initialTrafficSummary: TrafficSummary;
  trafficError: string | null;
  initialActivationSummary: MonetizationSummary | null;
  activationError: string | null;
  initialSeeds: SavedFormation[];
  initialBetaFeatures: BetaFeatures;
  initialHideOwnerInfoAbout: boolean;
  initialAppleSigninEnabled: boolean;
  initialGoogleSigninEnabled: boolean;
  initialCoachAiKbMisses: KbMissRow[];
  coachAiKbMissesError: string | null;
  initialOpexServices: OpexService[];
  initialOpexEntries: OpexEntry[];
  initialOpexPeriod: string;
  opexError: string | null;
  anthropicAdminKey: AdminKeyProps;
  openaiAdminKey: AdminKeyProps;
  initialSeatDefaults: SeatDefaults;
  initialCoachBonusRows: CoachBonusRow[];
  initialCoachCalPack: CoachCalPackConfig;
  initialReferralConfig: ReferralConfig;
  initialExcludedEmails: string[];
}) {
  const [tab, setTab] = useState<Tab>("users");
  const [analyticsSubTab, setAnalyticsSubTab] = useState<
    "traffic" | "monetization"
  >("traffic");
  const [usersSubTab, setUsersSubTab] = useState<"list" | "settings">("list");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  const tabOptions = [
    { value: "users" as const, label: "Users", icon: Users },
    { value: "analytics" as const, label: "Analytics", icon: BarChart3 },
    { value: "invites" as const, label: "Coach invites", icon: Ticket },
    { value: "payments" as const, label: "Payments", icon: CreditCard },
    { value: "integrations" as const, label: "Integrations", icon: KeyRound },
    { value: "feedback" as const, label: "Feedback", icon: MessageCircle },
    { value: "ai_feedback" as const, label: "AI Feedback", icon: Brain },
    { value: "seeds" as const, label: "Playbook seeds", icon: Sparkles },
    { value: "beta" as const, label: "Beta features", icon: FlaskConical },
    { value: "opex" as const, label: "Opex", icon: DollarSign },
    { value: "site" as const, label: "Site", icon: SettingsIcon },
  ];
  const activeOption = tabOptions.find((o) => o.value === tab) ?? tabOptions[0];
  const ActiveIcon = activeOption.icon;

  useEffect(() => {
    if (!mobileMenuOpen) return;
    function onDocClick(e: MouseEvent) {
      if (!mobileMenuRef.current?.contains(e.target as Node)) {
        setMobileMenuOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMobileMenuOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [mobileMenuOpen]);

  return (
    <div className="space-y-6">
      <div className="sm:hidden" ref={mobileMenuRef}>
        <div className="relative">
          <button
            type="button"
            onClick={() => setMobileMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={mobileMenuOpen}
            className="inline-flex w-full items-center justify-between gap-2 rounded-lg bg-surface-inset px-3 py-2 text-sm font-medium text-foreground ring-1 ring-inset ring-black/5"
          >
            <span className="inline-flex items-center gap-2">
              <ActiveIcon className="size-4" />
              {activeOption.label}
            </span>
            <MenuIcon className="size-4 text-muted" />
          </button>
          {mobileMenuOpen && (
            <div
              role="menu"
              className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-lg bg-surface-raised py-1 shadow-lg ring-1 ring-black/10"
            >
              {tabOptions.map((opt) => {
                const Icon = opt.icon;
                const active = opt.value === tab;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setTab(opt.value);
                      setMobileMenuOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm",
                      active ? "bg-surface-inset text-foreground" : "text-foreground hover:bg-surface-inset",
                    )}
                  >
                    <span className="inline-flex items-center gap-2">
                      <Icon className="size-4" />
                      {opt.label}
                    </span>
                    {active && <Check className="size-4 text-muted" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <SegmentedControl
        className="hidden sm:inline-flex"
        value={tab}
        onChange={setTab}
        options={tabOptions}
      />

      {tab === "users" && (
        <div className="space-y-6">
          <div className="flex gap-2 border-b border-border">
            <button
              onClick={() => setUsersSubTab("list")}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                usersSubTab === "list"
                  ? "border-b-2 border-primary text-foreground"
                  : "text-muted hover:text-foreground"
              }`}
            >
              Users
            </button>
            <button
              onClick={() => setUsersSubTab("settings")}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                usersSubTab === "settings"
                  ? "border-b-2 border-primary text-foreground"
                  : "text-muted hover:text-foreground"
              }`}
            >
              Settings
            </button>
          </div>
          {usersSubTab === "list" && (
            <div>
              {usersError ? (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950 ring-1 ring-amber-200">
                  {usersError}
                </p>
              ) : (
                <UsersAdminClient
                  initialUsers={initialUsers}
                  currentUserId={currentUserId}
                  initialExcludedEmails={initialExcludedEmails}
                />
              )}
            </div>
          )}
          {usersSubTab === "settings" && (
            <AnalyticsExclusionsAdminClient
              initialEmails={initialExcludedEmails}
            />
          )}
        </div>
      )}

      {tab === "analytics" && (
        <div className="space-y-6">
          <div className="flex gap-2 border-b border-border">
            <button
              onClick={() => setAnalyticsSubTab("traffic")}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                analyticsSubTab === "traffic"
                  ? "border-b-2 border-primary text-foreground"
                  : "text-muted hover:text-foreground"
              }`}
            >
              Traffic
            </button>
            <button
              onClick={() => setAnalyticsSubTab("monetization")}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                analyticsSubTab === "monetization"
                  ? "border-b-2 border-primary text-foreground"
                  : "text-muted hover:text-foreground"
              }`}
            >
              Monetization Health
            </button>
          </div>
          {analyticsSubTab === "traffic" && (
            <TrafficAdminClient
              initialSummary={initialTrafficSummary}
              initialError={trafficError}
            />
          )}
          {analyticsSubTab === "monetization" && (
            <ActivationAdminClient
              initialSummary={initialActivationSummary}
              initialError={activationError}
            />
          )}
        </div>
      )}

      {tab === "invites" && (
        <CoachInvitationsAdminClient
          initialItems={initialInvites}
          initialError={invitesError}
        />
      )}

      {tab === "payments" && (
        <BillingAdminClient
          initialCodes={initialGiftCodes}
          initialError={giftCodesError}
          stripeStatus={stripeStatus}
          initialCoachAiEnabled={initialCoachAiEnabled}
        />
      )}

      {tab === "feedback" && (
        <FeedbackAdminClient
          initialItems={initialFeedback}
          initialError={feedbackError}
          initialWidgetEnabled={initialFeedbackWidgetEnabled}
          initialWidgetTouchEnabled={initialFeedbackWidgetTouchEnabled}
        />
      )}

      {tab === "integrations" && (
        <div className="space-y-4">
          <div
            role="alert"
            className="rounded-2xl border-2 border-red-500 bg-red-50 p-4 text-sm text-red-800 dark:border-red-500 dark:bg-red-950/40 dark:text-red-200"
          >
            <p className="font-semibold">Heads up — production-critical settings</p>
            <p className="mt-1">
              Changing or deleting these will break or disable key functionality
              that impacts all users. Please be very careful when modifying these
              values.
            </p>
          </div>
          {claude.ok && (
            <LlmProviderToggleClient initial={claude.provider} />
          )}

          <RagEmbeddingsAdminClient />

          {claude.ok ? (
            <ClaudeSettingsClient
              initial={{
                configured: claude.configured,
                statusLabel: claude.statusLabel,
                updatedAt: claude.updatedAt,
              }}
              adminInitial={anthropicAdminKey}
            />
          ) : (
            <p className="text-sm text-red-700 dark:text-red-300">{claude.error}</p>
          )}

          {integration.ok ? (
            <OpenAISettingsClient
              initial={{
                configured: integration.configured,
                statusLabel: integration.statusLabel,
                updatedAt: integration.updatedAt,
              }}
              adminInitial={openaiAdminKey}
            />
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-red-700 dark:text-red-300">{integration.error}</p>
              <p className="text-sm text-muted">
                Saving keys requires <code className="font-mono">SUPABASE_SERVICE_ROLE_KEY</code> on the
                app server so secrets are not exposed to browsers.
              </p>
            </div>
          )}

          {resend.ok ? (
            <ResendSettingsClient
              initial={{
                configured: resend.configured,
                statusLabel: resend.statusLabel,
                fromEmail: resend.fromEmail,
                contactToEmail: resend.contactToEmail,
                updatedAt: resend.updatedAt,
              }}
            />
          ) : (
            <p className="text-sm text-red-700 dark:text-red-300">{resend.error}</p>
          )}

          {googleMaps.ok ? (
            <GoogleMapsSettingsClient
              initial={{
                configured: googleMaps.configured,
                statusLabel: googleMaps.statusLabel,
                updatedAt: googleMaps.updatedAt,
              }}
            />
          ) : (
            <p className="text-sm text-red-700 dark:text-red-300">{googleMaps.error}</p>
          )}

          {maxmind.ok ? (
            <MaxMindSettingsClient
              initial={{
                configured: maxmind.configured,
                statusLabel: maxmind.statusLabel,
                downloadedAt: maxmind.downloadedAt,
              }}
            />
          ) : (
            <p className="text-sm text-red-700 dark:text-red-300">{maxmind.error}</p>
          )}
        </div>
      )}

      {tab === "ai_feedback" && (
        <CoachAiFeedbackTabs
          initialKbMisses={initialCoachAiKbMisses}
          initialError={coachAiKbMissesError}
        />
      )}

      {tab === "seeds" && (
        <PlaybookSeedsAdminClient initial={initialSeeds} />
      )}

      {tab === "beta" && (
        <BetaFeaturesAdminClient initialFeatures={initialBetaFeatures} />
      )}

      {tab === "opex" && (
        <OpexAdminClient
          initialServices={initialOpexServices}
          initialEntries={initialOpexEntries}
          initialPeriodMonth={initialOpexPeriod}
          initialError={opexError}
        />
      )}

      {tab === "site" && (
        <div className="space-y-4">
          <CoachSeatsAdminClient
            initialDefaults={initialSeatDefaults}
            initialBonusRows={initialCoachBonusRows}
            initialPack={initialCoachCalPack}
          />
          <SiteSettingsAdminClient
            initialHideLobbyAnimation={initialHideLobbyAnimation}
            initialExamplesPageEnabled={initialExamplesPageEnabled}
            initialFreeMaxPlays={initialFreeMaxPlays}
            initialMobileEditingEnabled={initialMobileEditingEnabled}
            initialHideOwnerInfoAbout={initialHideOwnerInfoAbout}
            initialReferralConfig={initialReferralConfig}
            initialAppleSigninEnabled={initialAppleSigninEnabled}
            initialGoogleSigninEnabled={initialGoogleSigninEnabled}
          />
        </div>
      )}
    </div>
  );
}
