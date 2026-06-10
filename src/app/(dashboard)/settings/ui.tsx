"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  BarChart3,
  Brain,
  CreditCard,
  DollarSign,
  FlaskConical,
  Gauge,
  Globe,
  KeyRound,
  Menu as MenuIcon,
  MessageCircle,
  Settings as SettingsIcon,
  Sparkles,
  Ticket,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  UsersAdminClient,
  type AdminUserRow,
} from "@/features/admin/UsersAdminClient";
import { OpenAISettingsClient } from "@/features/admin/OpenAISettingsClient";
import { ClaudeSettingsClient } from "@/features/admin/ClaudeSettingsClient";
import { LlmProviderToggleClient } from "@/features/admin/LlmProviderToggleClient";
import { RagEmbeddingsAdminClient } from "@/features/admin/RagEmbeddingsAdminClient";
import { ResendSettingsClient } from "@/features/admin/ResendSettingsClient";
import { GoogleMapsSettingsClient } from "@/features/admin/GoogleMapsSettingsClient";
import { MaxMindSettingsClient } from "@/features/admin/MaxMindSettingsClient";
import { RedditPixelSettingsClient } from "@/features/admin/RedditPixelSettingsClient";
import { MetaPixelSettingsClient } from "@/features/admin/MetaPixelSettingsClient";
import { GoogleNativeSigninSettingsClient } from "@/features/admin/GoogleNativeSigninSettingsClient";
import { RevenueAdminClient } from "@/features/admin/RevenueAdminClient";
import { FeedbackAdminClient } from "@/features/admin/FeedbackAdminClient";
import { CoachAiFeedbackTabs } from "@/features/admin/CoachAiFeedbackTabs";
import { CoachAiTokenUsageClient } from "@/features/admin/CoachAiTokenUsageClient";
import type { KbMissRow } from "@/app/actions/coach-ai-feedback";
import { CoachInvitationsAdminClient } from "@/features/admin/CoachInvitationsAdminClient";
import { BillingAdminClient } from "@/features/admin/BillingAdminClient";
import { TrafficAdminClient } from "@/features/admin/TrafficAdminClient";
import { GeographyAdminClient } from "@/features/admin/GeographyAdminClient";
import { ActivationAdminClient } from "@/features/admin/ActivationAdminClient";
import { ReengagementAdminClient } from "@/features/admin/ReengagementAdminClient";
import { AnalyticsExclusionsAdminClient } from "@/features/admin/AnalyticsExclusionsAdminClient";
import { SiteSettingsAdminClient } from "@/features/admin/SiteSettingsAdminClient";
import { CoachSeatsAdminClient } from "@/features/admin/CoachSeatsAdminClient";
import { PlaybookSeedsAdminClient } from "@/features/admin/PlaybookSeedsAdminClient";
import { BetaFeaturesAdminClient } from "@/features/admin/BetaFeaturesAdminClient";
import { OpexAdminClient } from "@/features/admin/OpexAdminClient";
import type { FeedbackRow } from "@/app/actions/feedback";
import type { CoachInvitationRow } from "@/app/actions/coach-invitations";
import type {
  CancellationFeedbackRow,
  GiftCodeRow,
} from "@/app/actions/admin-billing";
import type { StripeConfigStatus } from "@/lib/site/stripe-config";
import type { TrafficSummary } from "@/app/actions/admin-traffic";
import type { GeoSummary } from "@/app/actions/admin-geography";
import type { MonetizationSummary } from "@/app/actions/admin-activation";
import {
  AdminSidebarNav,
  type AdminNavGroup,
} from "@/features/admin/AdminSidebarNav";
import {
  OverviewAdminClient,
  deriveOverviewProps,
  type OverviewJumpTarget,
  type OverviewWindow,
} from "@/features/admin/OverviewAdminClient";
import type { BillingSummary } from "@/app/actions/admin-billing";
import type { ShareLifetimeSummary } from "@/app/actions/admin-traffic-insights";

import { useLazyData, LazyContent } from "./_components/lazyTab";
import {
  loadIntegrationsTabData,
  loadSiteTabData,
  loadOpexTabData,
  loadRevenueTabData,
  loadTokenUsageTabData,
  loadSeedsTabData,
  loadBetaTabData,
  loadReengagementTabData,
} from "./lazy-data";

type Tab =
  | "overview"
  | "users"
  | "analytics"
  | "geography"
  | "opex"
  | "invites"
  | "revenue"
  | "payments"
  | "feedback"
  | "ai_feedback"
  | "ai_usage"
  | "seeds"
  | "site"
  | "integrations"
  | "beta";

const STORAGE_KEY = "site-admin-active-tab";

function isTab(value: string | null | undefined): value is Tab {
  return (
    value === "overview" ||
    value === "users" ||
    value === "analytics" ||
    value === "geography" ||
    value === "opex" ||
    value === "invites" ||
    value === "revenue" ||
    value === "payments" ||
    value === "feedback" ||
    value === "ai_feedback" ||
    value === "ai_usage" ||
    value === "seeds" ||
    value === "site" ||
    value === "integrations" ||
    value === "beta"
  );
}

export function SettingsClient({
  currentUserId,
  initialUsers,
  usersError,
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
  initialTrafficSummary,
  trafficError,
  initialGeoSummary,
  geoError,
  initialActivationSummary,
  activationError,
  initialCoachAiKbMisses,
  coachAiKbMissesError,
  initialExcludedEmails,
  initialCancellationFeedback,
  cancellationFeedbackError,
  overviewWindow,
  initialBillingSummary,
  billingSummaryError,
  initialShareLifetime,
}: {
  currentUserId: string;
  initialUsers: AdminUserRow[];
  usersError: string | null;
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
  initialTrafficSummary: TrafficSummary;
  trafficError: string | null;
  initialGeoSummary: GeoSummary;
  geoError: string | null;
  initialActivationSummary: MonetizationSummary | null;
  activationError: string | null;
  initialCoachAiKbMisses: KbMissRow[];
  coachAiKbMissesError: string | null;
  initialExcludedEmails: string[];
  initialCancellationFeedback: CancellationFeedbackRow[];
  cancellationFeedbackError: string | null;
  overviewWindow: OverviewWindow;
  initialBillingSummary: BillingSummary | null;
  billingSummaryError: string | null;
  initialShareLifetime: ShareLifetimeSummary | null;
  shareLifetimeError: string | null;
}) {
  const searchParams = useSearchParams();
  const urlTab = searchParams?.get("tab") ?? null;
  const urlQuery = searchParams?.get("q") ?? null;
  const [tab, setTab] = useState<Tab>(isTab(urlTab) ? urlTab : "overview");
  const [analyticsSubTab, setAnalyticsSubTab] = useState<
    "traffic" | "monetization" | "reengagement"
  >("traffic");
  const [usersSubTab, setUsersSubTab] = useState<"list" | "settings">("list");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Lazy-loaded tab data — fetched the first time each heavy tab is opened
  // (and cached for the session), so the initial page load only pays for the
  // Overview + always-visible tabs. See lazy-data.ts and _components/lazyTab.tsx.
  const integrationsData = useLazyData(
    tab === "integrations",
    loadIntegrationsTabData
  );
  const siteData = useLazyData(tab === "site", loadSiteTabData);
  const opexData = useLazyData(tab === "opex", loadOpexTabData);
  const revenueData = useLazyData(tab === "revenue", loadRevenueTabData);
  const tokenUsageData = useLazyData(tab === "ai_usage", loadTokenUsageTabData);
  const seedsData = useLazyData(tab === "seeds", loadSeedsTabData);
  const betaData = useLazyData(tab === "beta", loadBetaTabData);
  const reengagementData = useLazyData(
    tab === "analytics" && analyticsSubTab === "reengagement",
    loadReengagementTabData
  );

  // Persist last-viewed tab so refreshing the page doesn't lose context.
  // localStorage is fine here — this is a single-admin tool and the
  // selection is per-device, not per-user. ?tab= in the URL wins over
  // localStorage so deep-links (e.g. from the inbox) land where intended.
  useEffect(() => {
    if (isTab(urlTab)) return;
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (isTab(stored)) setTab(stored);
    } catch {
      /* private mode / disabled storage — ignore */
    }
  }, [urlTab]);
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, tab);
    } catch {
      /* ignore */
    }
  }, [tab]);

  const excludedEmailsCount = initialExcludedEmails.length;
  const overviewProps = deriveOverviewProps({
    initialUsersCount: initialUsers.length,
    excludedEmailsCount,
    traffic: initialTrafficSummary,
    geo: initialGeoSummary,
    invites: initialInvites,
    feedback: initialFeedback,
    kbMisses: initialCoachAiKbMisses,
    giftCodes: initialGiftCodes,
    stripeMode: stripeStatus.mode,
    billing: initialBillingSummary,
    billingError: billingSummaryError,
    activation: initialActivationSummary,
    shareLifetime: initialShareLifetime,
    window: overviewWindow,
  });

  const navGroups: AdminNavGroup<Tab>[] = [
    {
      label: "Insights",
      items: [
        { value: "overview", label: "Overview", icon: Gauge },
        { value: "analytics", label: "Analytics", icon: BarChart3 },
        { value: "geography", label: "Geography", icon: Globe },
        { value: "opex", label: "Opex", icon: DollarSign },
      ],
    },
    {
      label: "People",
      items: [
        {
          value: "users",
          label: "Users",
          icon: Users,
          badge: overviewProps.totalUsers,
        },
        {
          value: "invites",
          label: "Coach invites",
          icon: Ticket,
          badge: overviewProps.pendingInvites,
        },
      ],
    },
    {
      label: "Revenue",
      items: [
        { value: "revenue", label: "Revenue", icon: TrendingUp },
        { value: "payments", label: "Payments", icon: CreditCard },
      ],
    },
    {
      label: "Content",
      items: [
        {
          value: "feedback",
          label: "Feedback",
          icon: MessageCircle,
          badge: overviewProps.recentFeedback,
        },
        {
          value: "ai_feedback",
          label: "AI Feedback",
          icon: Brain,
          badge: overviewProps.unreviewedKbMisses,
        },
        { value: "ai_usage", label: "Cal usage", icon: DollarSign },
        { value: "seeds", label: "Playbook seeds", icon: Sparkles },
      ],
    },
    {
      label: "Configuration",
      items: [
        { value: "site", label: "Site", icon: SettingsIcon },
        { value: "integrations", label: "Integrations", icon: KeyRound },
        { value: "beta", label: "Beta features", icon: FlaskConical },
      ],
    },
  ];

  const allItems = navGroups.flatMap((g) => g.items);
  const activeItem = allItems.find((i) => i.value === tab) ?? allItems[0];
  const ActiveIcon = activeItem.icon;

  function jumpFromOverview(target: OverviewJumpTarget) {
    setTab(target);
  }

  return (
    <div className="lg:grid lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-8">
      <AdminSidebarNav
        groups={navGroups}
        value={tab}
        onChange={setTab}
        mobileOpen={mobileNavOpen}
        onMobileOpenChange={setMobileNavOpen}
      />

      <div className="min-w-0 space-y-6">
        <div className="lg:hidden">
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={mobileNavOpen}
            className="inline-flex w-full items-center justify-between gap-2 rounded-lg bg-surface-raised px-3 py-2.5 text-sm font-medium text-foreground ring-1 ring-inset ring-border"
          >
            <span className="inline-flex items-center gap-2">
              <ActiveIcon className="size-4 text-muted" aria-hidden="true" />
              {activeItem.label}
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs text-muted">
              <MenuIcon className="size-4" aria-hidden="true" />
              Menu
            </span>
          </button>
        </div>

        {tab === "overview" && (
          <OverviewAdminClient {...overviewProps} onJump={jumpFromOverview} />
        )}

        {tab === "users" && (
          <div className="space-y-6">
            <SubTabBar
              value={usersSubTab}
              onChange={setUsersSubTab}
              items={[
                { value: "list", label: "Users" },
                { value: "settings", label: "Settings" },
              ]}
            />
            {usersSubTab === "list" ? (
              usersError ? (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950 ring-1 ring-amber-200">
                  {usersError}
                </p>
              ) : (
                <UsersAdminClient
                  initialUsers={initialUsers}
                  currentUserId={currentUserId}
                  initialExcludedEmails={initialExcludedEmails}
                  initialQuery={urlQuery ?? ""}
                />
              )
            ) : (
              <AnalyticsExclusionsAdminClient
                initialEmails={initialExcludedEmails}
              />
            )}
          </div>
        )}

        {tab === "analytics" && (
          <div className="space-y-6">
            <SubTabBar
              value={analyticsSubTab}
              onChange={setAnalyticsSubTab}
              items={[
                { value: "traffic", label: "Traffic" },
                { value: "monetization", label: "Monetization Health" },
                { value: "reengagement", label: "Re-engagement Email" },
              ]}
            />
            {analyticsSubTab === "traffic" && (
              <TrafficAdminClient
                initialSummary={initialTrafficSummary}
                initialError={trafficError}
                initialWindow={
                  overviewWindow === "all" ? "90d" : overviewWindow
                }
              />
            )}
            {analyticsSubTab === "monetization" && (
              <ActivationAdminClient
                initialSummary={initialActivationSummary}
                initialError={activationError}
              />
            )}
            {analyticsSubTab === "reengagement" && (
              <LazyContent state={reengagementData}>
                {(d) =>
                  d.metrics ? (
                    <ReengagementAdminClient initial={d.metrics} />
                  ) : (
                    <p className="rounded-2xl border border-border bg-surface-raised p-4 text-sm text-muted">
                      {d.error ?? "No re-engagement data available yet."}
                    </p>
                  )
                }
              </LazyContent>
            )}
          </div>
        )}

        {tab === "geography" && (
          <GeographyAdminClient
            initialSummary={initialGeoSummary}
            initialError={geoError}
          />
        )}

        {tab === "invites" && (
          <CoachInvitationsAdminClient
            initialItems={initialInvites}
            initialError={invitesError}
          />
        )}

        {tab === "revenue" && (
          <LazyContent state={revenueData}>
            {(d) => (
              <RevenueAdminClient breakdown={d.breakdown} error={d.error} />
            )}
          </LazyContent>
        )}

        {tab === "payments" && (
          <BillingAdminClient
            initialCodes={initialGiftCodes}
            initialError={giftCodesError}
            stripeStatus={stripeStatus}
            initialCoachAiEnabled={initialCoachAiEnabled}
            initialCancellationFeedback={initialCancellationFeedback}
            cancellationFeedbackError={cancellationFeedbackError}
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
          <LazyContent state={integrationsData}>
            {(d) => {
              const {
                integration,
                claude,
                resend,
                googleMaps,
                maxmind,
                redditPixel,
                metaPixel,
                anthropicAdminKey,
                openaiAdminKey,
                googleOAuthWebClientId: initialGoogleOAuthWebClientId,
              } = d;
              return (
                <div className="space-y-4">
                  <div
                    role="alert"
                    className="rounded-2xl border-2 border-red-500 bg-red-50 p-4 text-sm text-red-800 dark:border-red-500 dark:bg-red-950/40 dark:text-red-200"
                  >
                    <p className="font-semibold">
                      Heads up — production-critical settings
                    </p>
                    <p className="mt-1">
                      Changing or deleting these will break or disable key
                      functionality that impacts all users. Please be very
                      careful when modifying these values.
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
                    <p className="text-sm text-red-700 dark:text-red-300">
                      {claude.error}
                    </p>
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
                      <p className="text-sm text-red-700 dark:text-red-300">
                        {integration.error}
                      </p>
                      <p className="text-sm text-muted">
                        Saving keys requires{" "}
                        <code className="font-mono">
                          SUPABASE_SERVICE_ROLE_KEY
                        </code>{" "}
                        on the app server so secrets are not exposed to
                        browsers.
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
                    <p className="text-sm text-red-700 dark:text-red-300">
                      {resend.error}
                    </p>
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
                    <p className="text-sm text-red-700 dark:text-red-300">
                      {googleMaps.error}
                    </p>
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
                    <p className="text-sm text-red-700 dark:text-red-300">
                      {maxmind.error}
                    </p>
                  )}

                  {redditPixel.ok ? (
                    <RedditPixelSettingsClient
                      initial={{
                        configured: redditPixel.configured,
                        statusLabel: redditPixel.statusLabel,
                      }}
                    />
                  ) : (
                    <p className="text-sm text-red-700 dark:text-red-300">
                      {redditPixel.error}
                    </p>
                  )}

                  {metaPixel.ok ? (
                    <MetaPixelSettingsClient
                      initial={{
                        configured: metaPixel.configured,
                        statusLabel: metaPixel.statusLabel,
                      }}
                    />
                  ) : (
                    <p className="text-sm text-red-700 dark:text-red-300">
                      {metaPixel.error}
                    </p>
                  )}

                  <GoogleNativeSigninSettingsClient
                    initial={{ clientId: initialGoogleOAuthWebClientId }}
                  />
                </div>
              );
            }}
          </LazyContent>
        )}

        {tab === "ai_feedback" && (
          <CoachAiFeedbackTabs
            initialKbMisses={initialCoachAiKbMisses}
            initialError={coachAiKbMissesError}
          />
        )}

        {tab === "ai_usage" && (
          <LazyContent state={tokenUsageData}>
            {(d) => <CoachAiTokenUsageClient initial={d} />}
          </LazyContent>
        )}

        {tab === "seeds" && (
          <LazyContent state={seedsData}>
            {(d) => <PlaybookSeedsAdminClient initial={d.seeds} />}
          </LazyContent>
        )}

        {tab === "beta" && (
          <LazyContent state={betaData}>
            {(d) => <BetaFeaturesAdminClient initialFeatures={d} />}
          </LazyContent>
        )}

        {tab === "opex" && (
          <LazyContent state={opexData}>
            {(d) => (
              <OpexAdminClient
                initialServices={d.services}
                initialEntries={d.entries}
                initialPeriodMonth={d.period}
                initialError={d.error}
              />
            )}
          </LazyContent>
        )}

        {tab === "site" && (
          <LazyContent state={siteData}>
            {(d) => (
              <div className="space-y-4">
                <CoachSeatsAdminClient
                  initialDefaults={d.seatDefaults}
                  initialBonusRows={d.coachBonusRows}
                  initialPack={d.coachCalPack}
                />
                <SiteSettingsAdminClient
                  initialHideLobbyAnimation={d.hideLobbyAnimation}
                  initialExamplesPageEnabled={d.examplesPageEnabled}
                  initialFreeMaxPlays={d.freeMaxPlays}
                  initialMobileEditingEnabled={d.mobileEditingEnabled}
                  initialHideOwnerInfoAbout={d.hideOwnerInfoAbout}
                  initialReferralConfig={d.referralConfig}
                  initialAppleSigninEnabled={d.appleSigninEnabled}
                  initialGoogleSigninEnabled={d.googleSigninEnabled}
                  initialCoachCalUpgradeBannerEnabled={
                    d.coachCalUpgradeBannerEnabled
                  }
                  initialCoachCalVersion={d.coachCalVersion}
                  initialCoachAiEvalDays={d.coachAiEvalDays}
                />
              </div>
            )}
          </LazyContent>
        )}
      </div>
    </div>
  );
}

function SubTabBar<T extends string>({
  value,
  onChange,
  items,
}: {
  value: T;
  onChange: (v: T) => void;
  items: { value: T; label: string }[];
}) {
  return (
    <div
      role="tablist"
      className="inline-flex w-full gap-1 overflow-x-auto rounded-xl border border-border bg-surface-raised p-1 text-xs sm:w-auto"
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.value)}
            className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 transition-colors ${
              active
                ? "bg-foreground/10 font-semibold text-foreground"
                : "text-muted hover:text-foreground"
            }`}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
